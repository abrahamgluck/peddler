// Product + live inventory routes.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

// List products, optional ?search= and ?low=1 (only items at/below reorder level).
router.get('/', (req, res) => {
  const { search, low } = req.query;
  let sql = 'SELECT * FROM products WHERE active = 1';
  const params = [];
  if (search) {
    sql += ' AND (name LIKE ? OR sku LIKE ? OR category LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (low === '1') sql += ' AND stock <= reorder_level';
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const ledger = db
    .prepare('SELECT * FROM inventory_ledger WHERE product_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.params.id);
  res.json({ ...product, ledger });
});

router.post('/', requireRole('admin', 'warehouse'), (req, res) => {
  const { sku, name, category, unit, cost, price, stock, reorder_level } = req.body || {};
  if (!sku || !name) return res.status(400).json({ error: 'sku and name are required' });
  try {
    const info = db
      .prepare(
        `INSERT INTO products (sku, name, category, unit, cost, price, stock, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sku, name, category || null, unit || 'each', cost || 0, price || 0, stock || 0, reorder_level || 0);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', requireRole('admin', 'warehouse'), (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const fields = ['sku', 'name', 'category', 'unit', 'cost', 'price', 'reorder_level', 'active'];
  const updates = {};
  for (const f of fields) if (f in (req.body || {})) updates[f] = req.body[f];
  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE products SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

// Adjust stock (restock / manual correction). Records a ledger entry.
router.post('/:id/adjust', requireRole('admin', 'warehouse'), (req, res) => {
  const { change, reason } = req.body || {};
  const delta = Number(change);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'change must be a non-zero number' });
  }
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, req.params.id);
    db.prepare('INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES (?, ?, ?, ?)')
      .run(req.params.id, delta, reason || 'adjustment', `user:${req.user.id}`);
  });
  tx();
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

export default router;
