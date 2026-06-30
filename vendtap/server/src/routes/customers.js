// Customer (store) routes.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT * FROM customers';
  const params = [];
  if (search) {
    sql += ' WHERE name LIKE ? OR contact LIKE ? OR phone LIKE ?';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  const invoices = db
    .prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.params.id);
  res.json({ ...customer, invoices });
});

router.post('/', requireRole('admin', 'salesman'), (req, res) => {
  const { name, contact, phone, email, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO customers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)')
    .run(name, contact || null, phone || null, email || null, address || null);
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin', 'salesman'), (req, res) => {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const fields = ['name', 'contact', 'phone', 'email', 'address'];
  const updates = {};
  for (const f of fields) if (f in (req.body || {})) updates[f] = req.body[f];
  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE customers SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

export default router;
