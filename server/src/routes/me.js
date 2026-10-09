// Customer banking. Every query is pinned to req.user.id, so a customer can
// only ever read or move money from their own accounts.
import { Router } from 'express';
import { query } from '../db.js';
import { scoreTransaction } from '../fraud.js';
import { HttpError, oneOf, optionalText, toAmount, toInt, wrap } from '../http.js';
import { balanceTrends, withTrend } from './accounts.js';
import { CATEGORIES, createTransaction, createTransfer } from './transactions.js';

const router = Router();

async function ownAccount(customerId, accountId) {
  const { rows: [account] } = await query(
    'SELECT id, account_number FROM accounts WHERE id = $1::int AND customer_id = $2::int',
    [accountId, customerId],
  );
  if (!account) throw new HttpError(404, 'Account not found');
  return account;
}

// The customer's usual phone, so their own activity is not scored as a new device.
const usualDevice = (accountId) => `dev-${accountId}-a`;

router.get('/accounts', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, account_number, type, currency, balance, status, opened_at
     FROM accounts WHERE customer_id = $1::int ORDER BY id`,
    [req.user.id],
  );
  const trends = await balanceTrends(rows.map((r) => r.id));
  res.json({ items: rows.map((r) => withTrend(r, trends.get(r.id))) });
}));

// Customers see their ledger, not the model's scores: only whether the bank is reviewing a transaction.
router.get('/transactions', wrap(async (req, res) => {
  const page = toInt(req.query.page, 'page', { fallback: 1 });
  const pageSize = toInt(req.query.page_size, 'page_size', { max: 50, fallback: 15 });
  const accountId = req.query.account_id ? toInt(req.query.account_id, 'account_id') : null;

  const [{ rows: [{ total }] }, { rows }] = await Promise.all([
    query(
      `SELECT count(*)::int AS total FROM v_transactions_enriched
       WHERE customer_id = $1::int AND ($2::int IS NULL OR account_id = $2::int)`,
      [req.user.id, accountId],
    ),
    query(
      `SELECT id, reference, created_at, type, amount, signed_amount, description, city, country,
              account_id, account_number, (alert_status = 'open') IS TRUE AS under_review
       FROM v_transactions_enriched
       WHERE customer_id = $1::int AND ($2::int IS NULL OR account_id = $2::int)
       ORDER BY created_at DESC, id DESC
       LIMIT $3::int OFFSET $4::int`,
      [req.user.id, accountId, pageSize, (page - 1) * pageSize],
    ),
  ]);
  res.json({ items: rows, total, page, page_size: pageSize });
}));

// Send money to any account in the bank, identified by its account number.
router.post('/transfer', wrap(async (req, res) => {
  const body = req.body || {};
  const from = await ownAccount(req.user.id, toInt(body.from_account_id, 'from_account_id'));
  const number = String(body.to_account_number || '').replace(/\s/g, '');
  const { rows: [to] } = await query('SELECT id FROM accounts WHERE account_number = $1::text', [number]);
  if (!to) throw new HttpError(404, 'No account with that number');

  const id = await createTransfer({
    fromId: from.id,
    toId: to.id,
    amount: toAmount(body.amount),
    channel: 'mobile',
    deviceId: usualDevice(from.id),
    description: optionalText(body.description, 'description'),
  });
  const fraud = await scoreTransaction(id);
  res.status(201).json({ transaction_id: id, under_review: Boolean(fraud?.is_anomaly) });
}));

router.post('/payment', wrap(async (req, res) => {
  const body = req.body || {};
  const account = await ownAccount(req.user.id, toInt(body.account_id, 'account_id'));
  const id = await createTransaction({
    accountId: account.id,
    type: 'payment',
    amount: toAmount(body.amount),
    channel: 'online',
    category: oneOf(body.merchant_category, CATEGORIES, 'merchant_category', 'groceries'),
    deviceId: usualDevice(account.id),
    description: optionalText(body.description, 'description'),
  });
  const fraud = await scoreTransaction(id);
  res.status(201).json({ transaction_id: id, under_review: Boolean(fraud?.is_anomaly) });
}));

export default router;
