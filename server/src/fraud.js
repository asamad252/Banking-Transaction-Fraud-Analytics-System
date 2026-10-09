// Glue between PostgreSQL and the scoring service: pull rows, send them to the
// model, write scores and alerts back.
import { query, withTransaction } from './db.js';
import * as ml from './ml.js';

const MODEL_COLUMNS = `id, account_id, type, amount, channel, city, country, device_id,
  created_at, home_city, home_country, synthetic_label`;

/** Retrain on every transaction, then replace all scores and refresh the alert queue. */
export async function retrainAll({ userId = null, contamination } = {}) {
  const { rows } = await query(`SELECT ${MODEL_COLUMNS} FROM v_transactions_enriched ORDER BY id`);
  const params = contamination ? { contamination } : undefined;
  const result = await ml.train(rows, params);
  const scores = JSON.stringify(result.scores);

  return withTransaction(async (db) => {
    const run = await db.query(
      `INSERT INTO model_runs (params, features, trained_rows, flagged_rows, threshold, metrics, triggered_by)
       VALUES ($1::jsonb, $2::jsonb, $3::int, $4::int, $5::real, $6::jsonb, $7::int)
       RETURNING *`,
      [
        JSON.stringify(result.model.params),
        JSON.stringify(result.model.features),
        result.model.trained_rows,
        result.model.flagged_rows,
        result.model.threshold,
        JSON.stringify(result.model.metrics),
        userId,
      ],
    );

    await db.query(
      `INSERT INTO fraud_scores (transaction_id, model_run_id, anomaly_score, is_anomaly, reasons, scored_at)
       SELECT s.id, $1::int, s.anomaly_score, s.is_anomaly, s.reasons, now()
       FROM jsonb_to_recordset($2::jsonb) AS s(id bigint, anomaly_score real, is_anomaly boolean, reasons jsonb)
       ON CONFLICT (transaction_id) DO UPDATE
         SET model_run_id = EXCLUDED.model_run_id, anomaly_score = EXCLUDED.anomaly_score,
             is_anomaly = EXCLUDED.is_anomaly, reasons = EXCLUDED.reasons, scored_at = EXCLUDED.scored_at`,
      [run.rows[0].id, scores],
    );

    // Open an alert for each newly flagged transaction. Alerts a person already
    // resolved keep their decision; open alerts just pick up the new severity.
    await db.query(
      `INSERT INTO fraud_alerts (transaction_id, severity, created_at)
       SELECT s.id, s.severity, t.created_at
       FROM jsonb_to_recordset($1::jsonb) AS s(id bigint, is_anomaly boolean, severity text)
       JOIN transactions t ON t.id = s.id
       WHERE s.is_anomaly
       ON CONFLICT (transaction_id) DO UPDATE
         SET severity = EXCLUDED.severity
         WHERE fraud_alerts.status = 'open'`,
      [scores],
    );

    // Open alerts the new model no longer supports are withdrawn.
    await db.query(
      `DELETE FROM fraud_alerts al
       USING fraud_scores s
       WHERE s.transaction_id = al.transaction_id AND NOT s.is_anomaly AND al.status = 'open'`,
    );

    return run.rows[0];
  });
}

/**
 * Score one freshly written transaction. Returns null (and leaves it unscored)
 * if the scoring service is down or untrained - moving money must not depend on it.
 */
export async function scoreTransaction(transactionId) {
  try {
    const { rows: [txn] } = await query(
      `SELECT ${MODEL_COLUMNS} FROM v_transactions_enriched WHERE id = $1::bigint`,
      [transactionId],
    );
    if (!txn) return null;

    const { rows: history } = await query(
      `SELECT ${MODEL_COLUMNS} FROM v_transactions_enriched
       WHERE account_id = $1::int AND id <> $2::bigint AND created_at <= $3::timestamptz
       ORDER BY created_at DESC LIMIT 400`,
      [txn.account_id, txn.id, txn.created_at],
    );

    const result = await ml.score(txn, history);

    await query(
      `INSERT INTO fraud_scores (transaction_id, model_run_id, anomaly_score, is_anomaly, reasons)
       VALUES ($1::bigint, (SELECT max(id) FROM model_runs), $2::real, $3::boolean, $4::jsonb)
       ON CONFLICT (transaction_id) DO UPDATE
         SET model_run_id = EXCLUDED.model_run_id, anomaly_score = EXCLUDED.anomaly_score,
             is_anomaly = EXCLUDED.is_anomaly, reasons = EXCLUDED.reasons, scored_at = now()`,
      [txn.id, result.anomaly_score, result.is_anomaly, JSON.stringify(result.reasons)],
    );
    if (result.is_anomaly) {
      await query(
        `INSERT INTO fraud_alerts (transaction_id, severity) VALUES ($1::bigint, $2::text)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [txn.id, result.severity],
      );
    }
    return result;
  } catch (err) {
    if (err instanceof ml.MlUnavailable) {
      console.warn(`[fraud] transaction ${transactionId} left unscored: ${err.message}`);
      return null;
    }
    throw err;
  }
}
