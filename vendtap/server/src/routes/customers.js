// Customer (store) routes.
import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const params = [];
    let sql = 'SELECT * FROM customers';
    if (search) {
      params.push(`%${search}%`);
      sql += ` WHERE name ILIKE $1 OR contact ILIKE $1 OR phone ILIKE $1`;
    }
    sql += ' ORDER BY name';
    res.json(await q(sql, params));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await one('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Not found' });
    const invoices = await q(
      'SELECT * FROM invoices WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json({ ...customer, invoices });
  } catch (e) { next(e); }
});

// Products this customer has bought before — for one-tap reordering on a new
// invoice. Returns each previously purchased product with how often/recently it
// was ordered, the quantity and price on the most recent order, and live stock.
router.get('/:id/history', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT p.id AS product_id, p.name, p.sku, p.unit, p.price, p.stock,
              SUM(ii.quantity)::int AS total_qty,
              COUNT(DISTINCT ii.invoice_id)::int AS times_ordered,
              MAX(i.created_at) AS last_ordered,
              (ARRAY_AGG(ii.quantity ORDER BY i.created_at DESC))[1] AS last_qty,
              (ARRAY_AGG(ii.price ORDER BY i.created_at DESC))[1] AS last_price
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       JOIN products p ON p.id = ii.product_id
       WHERE i.customer_id = $1 AND i.status <> 'void' AND p.active = 1
       GROUP BY p.id
       ORDER BY times_ordered DESC, last_ordered DESC`,
      [req.params.id]
    );
    res.json(rows.map((r) => ({ ...r, price: Number(r.price), last_price: Number(r.last_price) })));
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'salesman'), async (req, res, next) => {
  try {
    const { name, contact, phone, email, address } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const row = await one(
      'INSERT INTO customers (name, contact, phone, email, address) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, contact || null, phone || null, email || null, address || null]
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'salesman'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'contact', 'phone', 'email', 'address'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in (req.body || {})) {
        values.push(req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    }
    if (updates.length) {
      values.push(req.params.id);
      await q(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }
    res.json(await one('SELECT * FROM customers WHERE id = $1', [req.params.id]));
  } catch (e) { next(e); }
});

export default router;
