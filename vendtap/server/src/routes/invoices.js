// Invoice routes: the core sales workflow. Creating an invoice decrements
// live inventory, writes the inventory ledger, and updates the customer balance.
import { Router } from 'express';
import { q, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

const TAX_RATE = Number(process.env.TAX_RATE || 0); // distribution is often tax-exempt resale

router.get('/', async (req, res, next) => {
  try {
    const { status, customer_id } = req.query;
    const params = [];
    let sql = `
      SELECT i.*, c.name AS customer_name, u.name AS salesman_name
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      LEFT JOIN users u ON u.id = i.salesman_id
      WHERE 1 = 1`;
    if (status) { params.push(status); sql += ` AND i.status = $${params.length}`; }
    if (customer_id) { params.push(customer_id); sql += ` AND i.customer_id = $${params.length}`; }
    sql += ' ORDER BY i.created_at DESC LIMIT 200';
    res.json(await q(sql, params));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await one(
      `SELECT i.*, c.name AS customer_name, u.name AS salesman_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN users u ON u.id = i.salesman_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    invoice.items = await q('SELECT * FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    invoice.payments = await q('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY created_at', [req.params.id]);
    res.json(invoice);
  } catch (e) { next(e); }
});

// Create an invoice. Body: { customer_id, note, items: [{ product_id, quantity }] }
router.post('/', async (req, res, next) => {
  try {
    const { customer_id, note, items } = req.body || {};
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    const customer = await one('SELECT * FROM customers WHERE id = $1', [customer_id]);
    if (!customer) return res.status(400).json({ error: 'Unknown customer' });

    // Resolve products and validate stock before committing anything.
    const resolved = [];
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Each item needs a positive integer quantity' });
      }
      const product = await one('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (!product) return res.status(400).json({ error: `Unknown product ${item.product_id}` });
      if (product.stock < qty) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name} (have ${product.stock}, need ${qty})` });
      }
      resolved.push({ product, qty, price: product.price, lineTotal: +(product.price * qty).toFixed(2) });
    }

    const subtotal = +resolved.reduce((s, r) => s + r.lineTotal, 0).toFixed(2);
    const tax = +(subtotal * TAX_RATE).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);

    const invoice = await tx(async (client) => {
      // Atomic invoice number from a count within the transaction.
      const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS n FROM invoices');
      const number = `INV-${String(cnt[0].n + 1).padStart(5, '0')}`;
      const { rows } = await client.query(
        `INSERT INTO invoices (number, customer_id, salesman_id, status, subtotal, tax, total, paid, note)
         VALUES ($1, $2, $3, 'open', $4, $5, $6, 0, $7) RETURNING *`,
        [number, customer_id, req.user.id, subtotal, tax, total, note || null]
      );
      const inv = rows[0];
      for (const r of resolved) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [inv.id, r.product.id, r.product.name, r.qty, r.price, r.lineTotal]
        );
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [r.qty, r.product.id]);
        await client.query(
          'INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES ($1, $2, $3, $4)',
          [r.product.id, -r.qty, 'sale', number]
        );
      }
      await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [total, customer_id]);
      return inv;
    });

    res.status(201).json(invoice);
  } catch (e) { next(e); }
});

// Void an invoice: restores stock and reverses the customer balance for the unpaid portion.
router.post('/:id/void', async (req, res, next) => {
  try {
    const invoice = await one('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Already void' });

    const items = await q('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    const updated = await tx(async (client) => {
      for (const it of items) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [it.quantity, it.product_id]);
        await client.query(
          'INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES ($1, $2, $3, $4)',
          [it.product_id, it.quantity, 'void', invoice.number]
        );
      }
      const { rows } = await client.query("UPDATE invoices SET status = 'void' WHERE id = $1 RETURNING *", [invoice.id]);
      const outstanding = invoice.total - invoice.paid;
      await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [outstanding, invoice.customer_id]);
      return rows[0];
    });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
