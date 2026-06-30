// Invoice routes: the core sales workflow. Creating an invoice decrements
// live inventory, writes the inventory ledger, and updates the customer balance.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

const TAX_RATE = Number(process.env.TAX_RATE || 0); // distribution is often tax-exempt resale

function nextInvoiceNumber() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM invoices").get();
  return `INV-${String(row.n + 1).padStart(5, '0')}`;
}

router.get('/', (req, res) => {
  const { status, customer_id } = req.query;
  let sql = `
    SELECT i.*, c.name AS customer_name, u.name AS salesman_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN users u ON u.id = i.salesman_id
    WHERE 1 = 1`;
  const params = [];
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND i.customer_id = ?'; params.push(customer_id); }
  sql += ' ORDER BY i.created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const invoice = db
    .prepare(
      `SELECT i.*, c.name AS customer_name, u.name AS salesman_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN users u ON u.id = i.salesman_id
       WHERE i.id = ?`
    )
    .get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
  invoice.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at').all(req.params.id);
  res.json(invoice);
});

// Create an invoice. Body: { customer_id, note, items: [{ product_id, quantity }] }
router.post('/', (req, res) => {
  const { customer_id, note, items } = req.body || {};
  if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  // Resolve products and validate stock before committing anything.
  const resolved = [];
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Each item needs a positive integer quantity' });
    }
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    if (!product) return res.status(400).json({ error: `Unknown product ${item.product_id}` });
    if (product.stock < qty) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name} (have ${product.stock}, need ${qty})` });
    }
    resolved.push({ product, qty, price: product.price, lineTotal: +(product.price * qty).toFixed(2) });
  }

  const subtotal = +resolved.reduce((s, r) => s + r.lineTotal, 0).toFixed(2);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  const number = nextInvoiceNumber();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO invoices (number, customer_id, salesman_id, status, subtotal, tax, total, paid, note)
         VALUES (?, ?, ?, 'open', ?, ?, ?, 0, ?)`
      )
      .run(number, customer_id, req.user.id, subtotal, tax, total, note || null);
    const invoiceId = info.lastInsertRowid;

    const insItem = db.prepare(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, price, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    const ledger = db.prepare(
      'INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES (?, ?, ?, ?)'
    );
    for (const r of resolved) {
      insItem.run(invoiceId, r.product.id, r.product.name, r.qty, r.price, r.lineTotal);
      decStock.run(r.qty, r.product.id);
      ledger.run(r.product.id, -r.qty, 'sale', number);
    }
    db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(total, customer_id);
    return invoiceId;
  });

  const invoiceId = tx();
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId));
});

// Void an invoice: restores stock and reverses the customer balance for the unpaid portion.
router.post('/:id/void', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  if (invoice.status === 'void') return res.status(400).json({ error: 'Already void' });

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
  const tx = db.transaction(() => {
    const incStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    const ledger = db.prepare(
      'INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES (?, ?, ?, ?)'
    );
    for (const it of items) {
      incStock.run(it.quantity, it.product_id);
      ledger.run(it.product_id, it.quantity, 'void', invoice.number);
    }
    db.prepare("UPDATE invoices SET status = 'void' WHERE id = ?").run(invoice.id);
    const outstanding = invoice.total - invoice.paid;
    db.prepare('UPDATE customers SET balance = balance - ? WHERE id = ?').run(outstanding, invoice.customer_id);
  });
  tx();
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id));
});

export default router;
