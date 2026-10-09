import { Router } from 'express';
import { query } from '../db.js';
import { oneOf, toInt, wrap } from '../http.js';

const router = Router();
const CHANNELS = ['branch', 'atm', 'online', 'mobile', 'pos'];

// Every query below is scoped by the same two parameters, so all tiles and
// charts on the dashboard describe the same slice:
//   $1 = days back from now, $2 = channel (NULL means every channel)
const SCOPE = `created_at >= now() - make_interval(days => $1::int) AND ($2::text IS NULL OR channel = $2::text)`;

router.get('/overview', wrap(async (req, res) => {
  const days = toInt(req.query.days, 'days', { max: 365, fallback: 30 });
  const channel = oneOf(req.query.channel, CHANNELS, 'channel', null);
  const scope = [days, channel];

  const [kpis, previous, daily, heatmap, byChannel, byType, scatter, risky] = await Promise.all([
    query(
      `SELECT count(*)::int                                              AS transactions,
              COALESCE(sum(amount), 0)::float8                           AS volume,
              count(*) FILTER (WHERE is_anomaly)::int                    AS flagged,
              COALESCE(sum(amount) FILTER (WHERE is_anomaly), 0)::float8 AS flagged_amount,
              count(*) FILTER (WHERE is_scored)::int                     AS scored,
              count(*) FILTER (WHERE alert_status = 'open')::int         AS open_alerts,
              count(*) FILTER (WHERE alert_status = 'confirmed')::int    AS confirmed_alerts
       FROM v_transactions_enriched WHERE ${SCOPE}`,
      scope,
    ),
    // The equally long period immediately before, for "vs previous period".
    query(
      `SELECT count(*)::int                           AS transactions,
              COALESCE(sum(amount), 0)::float8        AS volume,
              count(*) FILTER (WHERE is_anomaly)::int AS flagged
       FROM v_transactions_enriched
       WHERE created_at >= now() - make_interval(days => 2 * $1::int)
         AND created_at <  now() - make_interval(days => $1::int)
         AND ($2::text IS NULL OR channel = $2::text)`,
      scope,
    ),
    // One row per calendar day, including days with no activity.
    query(
      `SELECT to_char(d.day, 'YYYY-MM-DD')                AS day,
              count(v.id)::int                            AS transactions,
              COALESCE(sum(v.amount), 0)::float8          AS volume,
              count(v.id) FILTER (WHERE v.is_anomaly)::int AS flagged
       FROM generate_series((now() - make_interval(days => $1::int))::date, now()::date, interval '1 day') AS d(day)
       LEFT JOIN v_transactions_enriched v
         ON v.created_at::date = d.day::date
        AND v.created_at >= now() - make_interval(days => $1::int)
        AND ($2::text IS NULL OR v.channel = $2::text)
       GROUP BY d.day ORDER BY d.day`,
      scope,
    ),
    // Day of week (1 = Monday ... 7 = Sunday) by hour of day.
    query(
      `SELECT extract(isodow FROM created_at)::int AS dow,
              extract(hour FROM created_at)::int   AS hour,
              count(*)::int                        AS transactions,
              count(*) FILTER (WHERE is_anomaly)::int AS flagged
       FROM v_transactions_enriched WHERE ${SCOPE}
       GROUP BY 1, 2`,
      scope,
    ),
    query(
      `SELECT channel,
              count(*)::int                           AS transactions,
              count(*) FILTER (WHERE is_anomaly)::int AS flagged,
              COALESCE(sum(amount) FILTER (WHERE is_anomaly), 0)::float8 AS flagged_amount
       FROM v_transactions_enriched WHERE ${SCOPE}
       GROUP BY channel ORDER BY channel`,
      scope,
    ),
    query(
      `SELECT type,
              count(*)::int                           AS transactions,
              count(*) FILTER (WHERE is_anomaly)::int AS flagged
       FROM v_transactions_enriched WHERE ${SCOPE}
       GROUP BY type ORDER BY type`,
      scope,
    ),
    // Every flagged transaction plus a random sample of ordinary ones.
    query(
      `(SELECT id, amount::float8 AS amount, anomaly_score, is_anomaly, type, customer_name
        FROM v_transactions_enriched WHERE ${SCOPE} AND is_anomaly
        ORDER BY anomaly_score DESC LIMIT 300)
       UNION ALL
       (SELECT id, amount::float8 AS amount, anomaly_score, is_anomaly, type, customer_name
        FROM v_transactions_enriched WHERE ${SCOPE} AND is_scored AND NOT is_anomaly
        ORDER BY md5(id::text) LIMIT 500)`,
      scope,
    ),
    query(
      `SELECT account_id, account_number, customer_name, account_status,
              count(*) FILTER (WHERE is_anomaly)::int            AS flagged,
              COALESCE(sum(amount) FILTER (WHERE is_anomaly), 0)::float8 AS flagged_amount,
              round(max(anomaly_score)::numeric, 4)::float8      AS max_score,
              count(*) FILTER (WHERE alert_status = 'open')::int AS open_alerts
       FROM v_transactions_enriched WHERE ${SCOPE}
       GROUP BY account_id, account_number, customer_name, account_status
       HAVING count(*) FILTER (WHERE is_anomaly) > 0
       ORDER BY flagged DESC, max_score DESC
       LIMIT 8`,
      scope,
    ),
  ]);

  res.json({
    scope: { days, channel },
    kpis: kpis.rows[0],
    previous: previous.rows[0],
    daily: daily.rows,
    heatmap: heatmap.rows,
    by_channel: byChannel.rows,
    by_type: byType.rows,
    scatter: scatter.rows,
    risky_accounts: risky.rows,
  });
}));

export default router;
