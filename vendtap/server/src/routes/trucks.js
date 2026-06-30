// Truck routes: manage delivery trucks and their status.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS driver_name
       FROM trucks t LEFT JOIN users u ON u.id = t.driver_id
       ORDER BY t.name`
    )
    .all();
  res.json(rows);
});

router.post('/', requireRole('admin', 'warehouse'), (req, res) => {
  const { name, plate, driver_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO trucks (name, plate, driver_id) VALUES (?, ?, ?)')
    .run(name, plate || null, driver_id || null);
  res.status(201).json(db.prepare('SELECT * FROM trucks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin', 'warehouse'), (req, res) => {
  const existing = db.prepare('SELECT * FROM trucks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const fields = ['name', 'plate', 'driver_id', 'status'];
  const updates = {};
  for (const f of fields) if (f in (req.body || {})) updates[f] = req.body[f];
  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE trucks SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM trucks WHERE id = ?').get(req.params.id));
});

export default router;
