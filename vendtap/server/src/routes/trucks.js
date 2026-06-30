// Truck routes: manage delivery trucks and their status.
import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT t.*, u.name AS driver_name
       FROM trucks t LEFT JOIN users u ON u.id = t.driver_id
       ORDER BY t.name`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'warehouse'), async (req, res, next) => {
  try {
    const { name, plate, driver_id } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const row = await one(
      'INSERT INTO trucks (name, plate, driver_id) VALUES ($1, $2, $3) RETURNING *',
      [name, plate || null, driver_id || null]
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin', 'warehouse'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM trucks WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const fields = ['name', 'plate', 'driver_id', 'status'];
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
      await q(`UPDATE trucks SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }
    res.json(await one('SELECT * FROM trucks WHERE id = $1', [req.params.id]));
  } catch (e) { next(e); }
});

export default router;
