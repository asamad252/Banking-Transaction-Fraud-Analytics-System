import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { HttpError } from './http.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import transactionRoutes from './routes/transactions.js';
import fraudRoutes from './routes/fraud.js';
import analyticsRoutes from './routes/analytics.js';
import customerRoutes from './routes/me.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'database unreachable' });
  }
});

app.use('/api/auth', authRoutes);
// Staff console: bank-wide data. Customers are kept out of all of it.
const staff = [requireAuth, requireRole('admin', 'analyst')];
app.use('/api/accounts', ...staff, accountRoutes);
app.use('/api/transactions', ...staff, transactionRoutes);
app.use('/api/fraud', ...staff, fraudRoutes);
app.use('/api/analytics', ...staff, analyticsRoutes);
// Customer banking: only ever the signed-in customer's own accounts.
app.use('/api/me', requireAuth, requireRole('customer'), customerRoutes);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'No such endpoint')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.code === '23514' || err.code === '23503') {
    // CHECK / foreign-key violation: the database refused bad data.
    return res.status(422).json({ error: 'That change breaks a data rule and was not saved' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`LedgerLens API listening on http://localhost:${port}`));
