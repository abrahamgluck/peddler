// Reporting routes: sales summaries (daily/weekly/monthly) and dashboard stats.
import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// Dashboard headline numbers.
router.get('/dashboard', async (req, res, next) => {
  try {
    const today = await one(
      `SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*)::int AS invoices
       FROM invoices WHERE status <> 'void' AND created_at::date = CURRENT_DATE`
    );
    const outstanding = await one(
      "SELECT COALESCE(SUM(total - paid), 0) AS amount FROM invoices WHERE status IN ('open','partial')"
    );
    const lowStock = await one(
      'SELECT COUNT(*)::int AS n FROM products WHERE active = 1 AND stock <= reorder_level'
    );
    const counts = await one(
      `SELECT
         (SELECT COUNT(*)::int FROM products WHERE active = 1) AS products,
         (SELECT COUNT(*)::int FROM customers) AS customers,
         (SELECT COUNT(*)::int FROM trucks) AS trucks`
    );
    res.json({
      todaySales: Number(today.sales),
      todayInvoices: today.invoices,
      outstanding: Number(outstanding.amount),
      lowStock: lowStock.n,
      ...counts,
    });
  } catch (e) { next(e); }
});

// Sales summary grouped by period. ?period=daily|weekly|monthly
router.get('/sales', async (req, res, next) => {
  try {
    const period = req.query.period || 'daily';
    const fmt = { daily: 'YYYY-MM-DD', weekly: 'IYYY-"W"IW', monthly: 'YYYY-MM' }[period];
    if (!fmt) return res.status(400).json({ error: 'period must be daily, weekly, or monthly' });
    const rows = await q(
      `SELECT to_char(created_at, $1) AS bucket,
              COUNT(*)::int AS invoices,
              COALESCE(SUM(total), 0) AS sales,
              COALESCE(SUM(paid), 0) AS collected
       FROM invoices
       WHERE status <> 'void'
       GROUP BY bucket
       ORDER BY bucket DESC
       LIMIT 30`,
      [fmt]
    );
    res.json(rows.map((r) => ({ ...r, sales: Number(r.sales), collected: Number(r.collected) })));
  } catch (e) { next(e); }
});

// Top selling products by quantity.
router.get('/top-products', async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT p.id, p.name, p.sku,
              SUM(ii.quantity)::int AS qty,
              SUM(ii.line_total) AS revenue
       FROM invoice_items ii
       JOIN products p ON p.id = ii.product_id
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.status <> 'void'
       GROUP BY p.id
       ORDER BY qty DESC
       LIMIT 10`
    );
    res.json(rows.map((r) => ({ ...r, revenue: Number(r.revenue) })));
  } catch (e) { next(e); }
});

export default router;
