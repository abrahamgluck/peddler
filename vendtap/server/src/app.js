// Express application wiring. Serves the JSON API and, in production, the
// built React frontend from web/dist.
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import './db.js'; // ensure schema is created
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import truckRoutes from './routes/trucks.js';
import reportRoutes from './routes/reports.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'vendtap', time: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/trucks', truckRoutes);
  app.use('/api/reports', reportRoutes);

  // Serve the built SPA if present (production build).
  const dist = join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(dist, 'index.html'));
    });
  }

  // JSON 404 for unknown API routes.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}
