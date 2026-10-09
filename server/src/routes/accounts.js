import { Router } from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { HttpError, oneOf, toAmount, toInt, wrap } from '../http.js';

const router = Router();

const ACCOUNT_SELECT = `
  SELECT a.id, a.account_number, a.type, a.currency, a.balance, a.status, a.opened_at,
         c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email,
         c.home_city, c.home_country,
         COALESCE(x.txn_count, 0)::int     AS txn_count,
         COALESCE(x.flagged_count, 0)::int AS flagged_count,
         COALESCE(x.open_alerts, 0)::int   AS open_alerts,
         x.last_activity
  FROM accounts a
  JOIN customers c ON c.id = a.customer_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS txn_count,
           count(*) FILTER (WHERE s.is_anomaly) AS flagged_count,
           count(*) FILTER (WHERE al.status = 'open') AS open_alerts,
           max(t.created_at) AS last_activity
    FROM transactions t
    LEFT JOIN fraud_scores s ON s.transaction_id = t.id
    LEFT JOIN fraud_alerts al ON al.transaction_id = t.id
    WHERE t.account_id = a.id
  ) x ON TRUE`;

const TREND_DAYS = 30;

/** End-of-day balance for each of the last 30 days, worked backwards from today's balance. */
export async function balanceTrends(accountIds) {
  if (accountIds.length === 0) return new Map();
  const { rows } = await query(
    `SELECT account_id,
            (now()::date - created_at::date)::int AS days_ago,
            sum(CASE WHEN type IN ('deposit', 'transfer_in') THEN amount ELSE -amount END)::float8 AS net
     FROM transactions
     WHERE account_id = ANY($1::int[]) AND created_at >= now()::date - $2::int
     GROUP BY 1, 2`,
    [accountIds, TREND_DAYS],
  );
  const netByAccount = new Map();
  for (const row of rows) {
    if (!netByAccount.has(row.account_id)) netByAccount.set(row.account_id, new Array(TREND_DAYS + 1).fill(0));
    if (row.days_ago >= 0 && row.days_ago <= TREND_DAYS) netByAccount.get(row.account_id)[row.days_ago] = row.net;
  }
  return netByAccount;
}

export function withTrend(account, netByDaysAgo) {
  const net = netByDaysAgo || new Array(TREND_DAYS + 1).fill(0);
  const trend = [account.balance];
  // The balance at the end of day d-1 is the balance at the end of day d minus day d's net movement.
  for (let d = 0; d < TREND_DAYS; d += 1) trend.push(trend[d] - net[d]);
  return { ...account, balance_trend: trend.reverse().map((v) => Math.round(v * 100) / 100) };
}

router.get('/', wrap(async (_req, res) => {
  const { rows } = await query(`${ACCOUNT_SELECT} ORDER BY c.full_name, a.id`);
  const trends = await balanceTrends(rows.map((r) => r.id));
  res.json({ items: rows.map((r) => withTrend(r, trends.get(r.id))) });
}));

router.get('/customers', wrap(async (_req, res) => {
  const { rows } = await query('SELECT id, full_name, email, home_city, home_country FROM customers ORDER BY full_name');
  res.json({ items: rows });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id, 'account id');
  const { rows: [account] } = await query(`${ACCOUNT_SELECT} WHERE a.id = $1::int`, [id]);
  if (!account) throw new HttpError(404, 'Account not found');
  const trends = await balanceTrends([id]);
  res.json({ account: withTrend(account, trends.get(id)) });
}));

router.post('/', wrap(async (req, res) => {
  const customerId = toInt(req.body?.customer_id, 'customer_id');
  const type = oneOf(req.body?.type, ['checking', 'savings', 'business'], 'type');
  const opening = req.body?.opening_deposit ? toAmount(req.body.opening_deposit, 'opening_deposit') : 0;

  const accountId = await withTransaction(async (db) => {
    const { rows: [customer] } = await db.query(
      'SELECT id, home_city, home_country FROM customers WHERE id = $1::int',
      [customerId],
    );
    if (!customer) throw new HttpError(404, 'Customer not found');

    // Account numbers are random; ON CONFLICT covers the rare collision.
    let created;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const number = `40${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
      ({ rows: [created] } = await db.query(
        `INSERT INTO accounts (account_number, customer_id, type, balance)
         VALUES ($1::text, $2::int, $3::text, $4::numeric)
         ON CONFLICT (account_number) DO NOTHING
         RETURNING id`,
        [number, customerId, type, opening],
      ));
    }
    if (!created) throw new HttpError(500, 'Could not allocate an account number. Try again.');

    if (opening > 0) {
      await db.query(
        `INSERT INTO transactions (reference, account_id, type, amount, channel, city, country, description)
         VALUES ($1::text, $2::int, 'deposit', $3::numeric, 'branch', $4::text, $5::text, 'Opening deposit')`,
        [`TX-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`, created.id, opening,
          customer.home_city, customer.home_country],
      );
    }
    return created.id;
  });

  const { rows: [account] } = await query(`${ACCOUNT_SELECT} WHERE a.id = $1::int`, [accountId]);
  res.status(201).json({ account: withTrend(account) });
}));

router.patch('/:id/status', wrap(async (req, res) => {
  const id = toInt(req.params.id, 'account id');
  const status = oneOf(req.body?.status, ['active', 'frozen'], 'status');
  const { rows: [updated] } = await query(
    `UPDATE accounts SET status = $2::text WHERE id = $1::int AND status <> 'closed' RETURNING id, status`,
    [id, status],
  );
  if (!updated) throw new HttpError(404, 'Account not found or already closed');
  res.json({ account: updated });
}));

export default router;
