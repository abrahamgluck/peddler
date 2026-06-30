// Payment routes: record a payment against an invoice and update balances.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, i.number AS invoice_number, u.name AS received_by_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN users u ON u.id = p.received_by
       ORDER BY p.created_at DESC LIMIT 200`
    )
    .all();
  res.json(rows);
});

// Record a payment. Body: { amount, method }
router.post('/invoice/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
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

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO payments (invoice_id, amount, method, received_by) VALUES (?, ?, ?, ?)')
      .run(invoice.id, amount, method, req.user.id);
    const newPaid = +(invoice.paid + amount).toFixed(2);
    const status = newPaid >= invoice.total - 0.001 ? 'paid' : 'partial';
    db.prepare('UPDATE invoices SET paid = ?, status = ? WHERE id = ?').run(newPaid, status, invoice.id);
    db.prepare('UPDATE customers SET balance = balance - ? WHERE id = ?').run(amount, invoice.customer_id);
  });
  tx();
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id));
});

export default router;
