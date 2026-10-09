import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { scoreTransaction } from '../fraud.js';
import { HttpError, oneOf, optionalText, toAmount, toInt, wrap } from '../http.js';

const router = Router();

const TYPES = ['deposit', 'withdrawal', 'payment', 'transfer_in', 'transfer_out'];
const CHANNELS = ['branch', 'atm', 'online', 'mobile', 'pos'];
export const CATEGORIES = ['groceries', 'dining', 'fuel', 'utilities', 'travel', 'electronics', 'health', 'entertainment'];

const LIST_COLUMNS = `id, reference, created_at, type, amount, signed_amount, channel, merchant_category,
  city, country, description, account_id, account_number, customer_name, home_city,
  anomaly_score, is_anomaly, is_scored, reasons, alert_id, alert_status, alert_severity`;

const newReference = () => `TX-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

router.get('/', wrap(async (req, res) => {
  const page = toInt(req.query.page, 'page', { fallback: 1 });
  const pageSize = toInt(req.query.page_size, 'page_size', { max: 100, fallback: 25 });

  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (req.query.account_id) add('account_id = ?::int', toInt(req.query.account_id, 'account_id'));
  if (req.query.type) add('type = ?::text', oneOf(req.query.type, TYPES, 'type'));
  if (req.query.channel) add('channel = ?::text', oneOf(req.query.channel, CHANNELS, 'channel'));
  if (req.query.days) add('created_at >= now() - make_interval(days => ?::int)', toInt(req.query.days, 'days', { max: 3650 }));
  if (req.query.flagged === 'true') where.push('is_anomaly');
  if (req.query.q) {
    const term = String(req.query.q).trim().slice(0, 80);
    // Escape LIKE wildcards so a search for "50%" means the literal text.
    add(
      `(reference ILIKE ? OR customer_name ILIKE ? OR account_number ILIKE ? OR description ILIKE ?)`,
      `%${term.replace(/[\\%_]/g, '\\$&')}%`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [{ rows: [{ total }] }, { rows }] = await Promise.all([
    query(`SELECT count(*)::int AS total FROM v_transactions_enriched ${whereSql}`, params),
    query(
      `SELECT ${LIST_COLUMNS} FROM v_transactions_enriched ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length + 1}::int OFFSET $${params.length + 2}::int`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
  ]);

  res.json({ items: rows, total, page, page_size: pageSize });
}));

async function loadTransaction(id) {
  const { rows: [row] } = await query(
    `SELECT ${LIST_COLUMNS} FROM v_transactions_enriched WHERE id = $1::bigint`,
    [id],
  );
  return row;
}

/** Lock an account row for the rest of the transaction and check it can move money. */
async function lockAccount(db, id, label = 'Account') {
  const { rows: [account] } = await db.query(
    `SELECT a.id, a.balance, a.status, a.account_number, c.home_city, c.home_country
     FROM accounts a JOIN customers c ON c.id = a.customer_id
     WHERE a.id = $1::int
     FOR UPDATE OF a`,
    [id],
  );
  if (!account) throw new HttpError(404, `${label} not found`);
  if (account.status !== 'active') {
    throw new HttpError(422, `${label} ${account.account_number} is ${account.status} and cannot move money`);
  }
  return account;
}

/** Deposit, withdrawal or card payment on one account. Returns the new transaction id. */
export function createTransaction({ accountId, type, amount, channel, category, city, country, deviceId, description }) {
  return withTransaction(async (db) => {
    const account = await lockAccount(db, accountId);
    const delta = type === 'deposit' ? amount : -amount;
    if (account.balance + delta < 0) {
      throw new HttpError(422, `Insufficient funds: available balance is ${account.balance.toFixed(2)}`);
    }
    await db.query('UPDATE accounts SET balance = balance + $2::numeric WHERE id = $1::int', [accountId, delta]);
    const { rows: [created] } = await db.query(
      `INSERT INTO transactions
         (reference, account_id, type, amount, channel, merchant_category, city, country, device_id, description)
       VALUES ($1::text, $2::int, $3::text, $4::numeric, $5::text, $6::text, $7::text, $8::text, $9::text, $10::text)
       RETURNING id`,
      [newReference(), accountId, type, amount, channel, category,
        city || account.home_city, country || account.home_country, deviceId,
        description || { deposit: 'Deposit', withdrawal: 'Cash withdrawal', payment: 'Card payment' }[type]],
    );
    return created.id;
  });
}

/** Move money between two accounts, writing both ledger rows atomically. Returns the outgoing row's id. */
export function createTransfer({ fromId, toId, amount, channel, city, country, deviceId, description }) {
  if (fromId === toId) throw new HttpError(400, 'Choose two different accounts');
  return withTransaction(async (db) => {
    // Always lock the lower id first so two opposite transfers cannot deadlock.
    const [first, second] = fromId < toId ? [fromId, toId] : [toId, fromId];
    const locked = {
      [first]: await lockAccount(db, first, first === fromId ? 'Sending account' : 'Receiving account'),
      [second]: await lockAccount(db, second, second === fromId ? 'Sending account' : 'Receiving account'),
    };
    const sender = locked[fromId];
    const receiver = locked[toId];
    if (sender.balance < amount) {
      throw new HttpError(422, `Insufficient funds: available balance is ${sender.balance.toFixed(2)}`);
    }

    await db.query('UPDATE accounts SET balance = balance - $2::numeric WHERE id = $1::int', [fromId, amount]);
    await db.query('UPDATE accounts SET balance = balance + $2::numeric WHERE id = $1::int', [toId, amount]);

    const reference = newReference();
    const { rows: [out] } = await db.query(
      `INSERT INTO transactions
         (reference, account_id, type, amount, channel, counterparty_account_id, city, country, device_id, description)
       VALUES ($1::text, $2::int, 'transfer_out', $3::numeric, $4::text, $5::int, $6::text, $7::text, $8::text, $9::text)
       RETURNING id`,
      [reference, fromId, amount, channel, toId, city || sender.home_city, country || sender.home_country,
        deviceId, description || `Transfer to ${receiver.account_number}`],
    );
    await db.query(
      `INSERT INTO transactions
         (reference, account_id, type, amount, channel, counterparty_account_id, city, country, description)
       VALUES ($1::text, $2::int, 'transfer_in', $3::numeric, $4::text, $5::int, $6::text, $7::text, $8::text)`,
      [reference, toId, amount, channel, fromId, receiver.home_city, receiver.home_country,
        `Transfer from ${sender.account_number}`],
    );
    return out.id;
  });
}

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const type = oneOf(body.type, ['deposit', 'withdrawal', 'payment'], 'type');
  const id = await createTransaction({
    accountId: toInt(body.account_id, 'account_id'),
    type,
    amount: toAmount(body.amount),
    channel: oneOf(body.channel, CHANNELS, 'channel', type === 'payment' ? 'pos' : 'branch'),
    category: type === 'payment' ? oneOf(body.merchant_category, CATEGORIES, 'merchant_category', 'groceries') : null,
    city: optionalText(body.city, 'city', 80),
    country: optionalText(body.country, 'country', 80),
    deviceId: optionalText(body.device_id, 'device_id', 80),
    description: optionalText(body.description, 'description'),
  });
  const fraud = await scoreTransaction(id);
  res.status(201).json({ transaction: await loadTransaction(id), fraud });
}));

router.post('/transfer', wrap(async (req, res) => {
  const body = req.body || {};
  const outId = await createTransfer({
    fromId: toInt(body.from_account_id, 'from_account_id'),
    toId: toInt(body.to_account_id, 'to_account_id'),
    amount: toAmount(body.amount),
    channel: oneOf(body.channel, ['online', 'mobile', 'branch'], 'channel', 'online'),
    city: optionalText(body.city, 'city', 80),
    country: optionalText(body.country, 'country', 80),
    deviceId: optionalText(body.device_id, 'device_id', 80),
    description: optionalText(body.description, 'description'),
  });
  const fraud = await scoreTransaction(outId);
  res.status(201).json({ transaction: await loadTransaction(outId), fraud });
}));

export default router;
