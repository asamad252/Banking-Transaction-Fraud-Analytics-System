import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireRole } from '../auth.js';
import { retrainAll } from '../fraud.js';
import * as ml from '../ml.js';
import { HttpError, oneOf, optionalText, toInt, wrap } from '../http.js';

const router = Router();

const ALERT_COLUMNS = `
  al.id, al.status, al.severity, al.created_at, al.resolved_at, al.resolution_note,
  u.full_name AS resolved_by_name,
  v.id AS transaction_id, v.reference, v.created_at AS transaction_at, v.type, v.amount, v.channel,
  v.merchant_category, v.city, v.country, v.description, v.device_id,
  v.account_id, v.account_number, v.account_status, v.customer_name, v.home_city, v.home_country,
  v.anomaly_score, v.reasons`;

router.get('/alerts', wrap(async (req, res) => {
  const status = oneOf(req.query.status, ['open', 'confirmed', 'dismissed', 'all'], 'status', 'open');
  const page = toInt(req.query.page, 'page', { fallback: 1 });
  const pageSize = toInt(req.query.page_size, 'page_size', { max: 100, fallback: 20 });
  const statusParam = status === 'all' ? null : status;

  const [{ rows }, { rows: counts }] = await Promise.all([
    query(
      `SELECT ${ALERT_COLUMNS}
       FROM fraud_alerts al
       JOIN v_transactions_enriched v ON v.id = al.transaction_id
       LEFT JOIN staff_users u ON u.id = al.resolved_by
       WHERE ($1::text IS NULL OR al.status = $1::text)
       ORDER BY v.anomaly_score DESC NULLS LAST, al.id DESC
       LIMIT $2::int OFFSET $3::int`,
      [statusParam, pageSize, (page - 1) * pageSize],
    ),
    query('SELECT status, count(*)::int AS n FROM fraud_alerts GROUP BY status'),
  ]);

  const byStatus = { open: 0, confirmed: 0, dismissed: 0 };
  for (const row of counts) byStatus[row.status] = row.n;
  const total = status === 'all' ? byStatus.open + byStatus.confirmed + byStatus.dismissed : byStatus[status];
  res.json({ items: rows, counts: byStatus, total, page, page_size: pageSize });
}));

// Resolve (or reopen) an alert. Confirming can freeze the account in the same step.
router.patch('/alerts/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id, 'alert id');
  const status = oneOf(req.body?.status, ['open', 'confirmed', 'dismissed'], 'status');
  const note = optionalText(req.body?.note, 'note', 500);
  const freeze = status === 'confirmed' && req.body?.freeze_account === true;

  const alert = await withTransaction(async (db) => {
    const { rows: [updated] } = await db.query(
      `UPDATE fraud_alerts
       SET status = $2::text,
           resolution_note = $3::text,
           resolved_by = CASE WHEN $2::text = 'open' THEN NULL ELSE $4::int END,
           resolved_at = CASE WHEN $2::text = 'open' THEN NULL ELSE now() END
       WHERE id = $1::int
       RETURNING id, status, transaction_id`,
      [id, status, note, req.user.id],
    );
    if (!updated) throw new HttpError(404, 'Alert not found');
    if (freeze) {
      await db.query(
        `UPDATE accounts SET status = 'frozen'
         WHERE status = 'active' AND id = (SELECT account_id FROM transactions WHERE id = $1::bigint)`,
        [updated.transaction_id],
      );
    }
    return updated;
  });

  res.json({ alert: { ...alert, account_frozen: freeze } });
}));

router.get('/model', wrap(async (_req, res) => {
  const [{ rows: runs }, { rows: histogram }, { rows: [coverage] }, service] = await Promise.all([
    query(
      `SELECT r.id, r.algorithm, r.params, r.features, r.trained_rows, r.flagged_rows, r.threshold,
              r.metrics, r.trained_at, u.full_name AS triggered_by_name
       FROM model_runs r LEFT JOIN staff_users u ON u.id = r.triggered_by
       ORDER BY r.id DESC LIMIT 6`,
    ),
    // 20 equal-width buckets across the 0-1 score range.
    query(
      `SELECT b.bucket::int,
              count(s.transaction_id)::int AS n
       FROM generate_series(0, 19) AS b(bucket)
       LEFT JOIN fraud_scores s ON least(floor(s.anomaly_score * 20), 19) = b.bucket
       GROUP BY b.bucket ORDER BY b.bucket`,
    ),
    query(
      `SELECT count(*)::int AS transactions,
              count(s.transaction_id)::int AS scored
       FROM transactions t LEFT JOIN fraud_scores s ON s.transaction_id = t.id`,
    ),
    ml.health().catch((err) => ({ status: 'down', error: err.message })),
  ]);

  res.json({ current: runs[0] || null, runs, histogram, coverage, service });
}));

router.post('/retrain', requireRole('admin'), wrap(async (req, res) => {
  let contamination;
  if (req.body?.contamination !== undefined) {
    contamination = Number(req.body.contamination);
    if (!(contamination >= 0.001 && contamination <= 0.2)) {
      throw new HttpError(400, 'contamination must be between 0.001 and 0.2');
    }
  }
  try {
    const run = await retrainAll({ userId: req.user.id, contamination });
    res.status(201).json({ run });
  } catch (err) {
    if (err instanceof ml.MlUnavailable) throw new HttpError(503, err.message);
    throw err;
  }
}));

export default router;
