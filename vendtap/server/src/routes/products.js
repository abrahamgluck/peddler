// Product + live inventory routes.
import { Router } from 'express';
import { q, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

// List products, optional ?search= and ?low=1 (only items at/below reorder level).
router.get('/', async (req, res, next) => {
  try {
    const { search, low } = req.query;
    const params = [];
    let sql = 'SELECT * FROM products WHERE active = 1';
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR sku ILIKE $${params.length} OR category ILIKE $${params.length})`;
    }
    if (low === '1') sql += ' AND stock <= reorder_level';
    sql += ' ORDER BY name';
    res.json(await q(sql, params));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const ledger = await q(
      'SELECT * FROM inventory_ledger WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json({ ...product, ledger });
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'warehouse'), async (req, res, next) => {
  try {
    const { sku, name, category, unit, cost, price, stock, reorder_level } = req.body || {};
    if (!sku || !name) return res.status(400).json({ error: 'sku and name are required' });
    const row = await one(
      `INSERT INTO products (sku, name, category, unit, cost, price, stock, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [sku, name, category || null, unit || 'each', cost || 0, price || 0, stock || 0, reorder_level || 0]
    );
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'SKU already exists' });
    next(e);
  }
});

router.put('/:id', requireRole('admin', 'warehouse'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['sku', 'name', 'category', 'unit', 'cost', 'price', 'reorder_level', 'active'];
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
      await q(`UPDATE products SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }
    res.json(await one('SELECT * FROM products WHERE id = $1', [req.params.id]));
  } catch (e) { next(e); }
});

// Adjust stock (restock / manual correction). Records a ledger entry.
router.post('/:id/adjust', requireRole('admin', 'warehouse'), async (req, res, next) => {
  try {
    const { change, reason } = req.body || {};
    const delta = Number(change);
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'change must be a non-zero number' });
    }
    const product = await one('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Not found' });

    const updated = await tx(async (client) => {
      const { rows } = await client.query(
        'UPDATE products SET stock = stock + $1 WHERE id = $2 RETURNING *',
        [delta, req.params.id]
      );
      await client.query(
        'INSERT INTO inventory_ledger (product_id, change, reason, ref) VALUES ($1, $2, $3, $4)',
        [req.params.id, delta, reason || 'adjustment', `user:${req.user.id}`]
      );
      return rows[0];
    });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
