// Payment routes: record a payment against an invoice and update balances.
import { Router } from 'express';
import { q, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT p.*, i.number AS invoice_number, u.name AS received_by_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN users u ON u.id = p.received_by
       ORDER BY p.created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// Record a payment. Body: { amount, method }
router.post('/invoice/:id', async (req, res, next) => {
  try {
    const invoice = await one('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Invoice is void' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const outstanding = +(invoice.total - invoice.paid).toFixed(2);
    if (amount > outstanding + 0.001) {
      return res.status(400).json({ error: `Amount exceeds outstanding balance of ${outstanding}` });
    }
    const method = req.body?.method || 'cash';

    const updated = await tx(async (client) => {
      await client.query(
        'INSERT INTO payments (invoice_id, amount, method, received_by) VALUES ($1, $2, $3, $4)',
        [invoice.id, amount, method, req.user.id]
      );
      const newPaid = +(invoice.paid + amount).toFixed(2);
      const status = newPaid >= invoice.total - 0.001 ? 'paid' : 'partial';
      const { rows } = await client.query(
        'UPDATE invoices SET paid = $1, status = $2 WHERE id = $3 RETURNING *',
        [newPaid, status, invoice.id]
      );
      await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [amount, invoice.customer_id]);
      return rows[0];
    });
    res.status(201).json(updated);
  } catch (e) { next(e); }
});

export default router;
