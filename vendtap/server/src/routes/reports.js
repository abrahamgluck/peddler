// Reporting routes: sales summaries (daily/weekly/monthly) and dashboard stats.
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// Dashboard headline numbers.
router.get('/dashboard', (req, res) => {
  const today = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS invoices
       FROM invoices WHERE status != 'void' AND date(created_at) = date('now')`
    )
    .get();
  const outstanding = db
    .prepare("SELECT COALESCE(SUM(total - paid), 0) AS amount FROM invoices WHERE status IN ('open','partial')")
    .get();
  const lowStock = db
    .prepare('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock <= reorder_level')
    .get();
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE active = 1) AS products,
         (SELECT COUNT(*) FROM customers) AS customers,
         (SELECT COUNT(*) FROM trucks) AS trucks`
    )
    .get();
  res.json({
    todaySales: today.sales,
    todayInvoices: today.invoices,
    outstanding: outstanding.amount,
    lowStock: lowStock.n,
    ...counts,
  });
});

// Sales summary grouped by period. ?period=daily|weekly|monthly
router.get('/sales', (req, res) => {
  const period = req.query.period || 'daily';
  const fmt = { daily: '%Y-%m-%d', weekly: '%Y-W%W', monthly: '%Y-%m' }[period];
  if (!fmt) return res.status(400).json({ error: 'period must be daily, weekly, or monthly' });
  const rows = db
    .prepare(
      `SELECT strftime('${fmt}', created_at) AS bucket,
              COUNT(*) AS invoices,
              COALESCE(SUM(total), 0) AS sales,
              COALESCE(SUM(paid), 0) AS collected
       FROM invoices
       WHERE status != 'void'
       GROUP BY bucket
       ORDER BY bucket DESC
       LIMIT 30`
    )
    .all();
  res.json(rows);
});

// Top selling products by quantity.
router.get('/top-products', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.sku,
              SUM(ii.quantity) AS qty,
              SUM(ii.line_total) AS revenue
       FROM invoice_items ii
       JOIN products p ON p.id = ii.product_id
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.status != 'void'
       GROUP BY p.id
       ORDER BY qty DESC
       LIMIT 10`
    )
    .all();
  res.json(rows);
});

export default router;
