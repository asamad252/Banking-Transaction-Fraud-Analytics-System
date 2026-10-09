// Review queue on the left, the model that fills it on the right.
import { useState } from 'react';
import { animated, useTransition } from '@react-spring/web';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { channelLabel, count, dateTime, maskAccount, money, percent, typeLabel } from '../format.js';
import Icon from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import ScoreMeter, { SeverityBadge } from '../ui/ScoreMeter.jsx';
import { useToast } from '../ui/Toast.jsx';
import { PageHeader } from '../components/Shell.jsx';
import { LegendItem } from '../charts/ChartCard.jsx';
import SeverityHistogram from '../charts/SeverityHistogram.jsx';

const PAGE_SIZE = 12;

const FEATURE_TEXT = {
  amount_dev: 'How far the amount sits from the account’s usual amounts',
  amount_ratio: 'Amount relative to the account’s median',
  over_max: 'Whether it beats the account’s previous largest amount',
  log_amount: 'Absolute size of the amount',
  is_night: 'Made between midnight and 6am',
  log_gap: 'Time since the account’s previous transaction',
  velocity_1h: 'Transactions on the account in the last hour',
  velocity_24h: 'Transactions on the account in the last 24 hours',
  is_away: 'Made outside the customer’s home city',
  is_foreign: 'Made outside the customer’s home country',
  new_device: 'Device not seen on the account before',
  is_outflow: 'Money leaving rather than arriving',
};

function AlertCard({ alert, busy, onResolve }) {
  const resolved = alert.status !== 'open';
  return (
    <article className={`card alert-card alert-${alert.severity}`}>
      <header>
        <div>
          <SeverityBadge severity={alert.severity} />
          <h3>{money(alert.amount)} {typeLabel(alert.type).toLowerCase()}</h3>
          <p>
            {alert.customer_name}, account <span className="tabular">{maskAccount(alert.account_number)}</span>
            {alert.account_status === 'frozen' && <span className="badge badge-frozen"><Icon name="lock" size={12} /> Frozen</span>}
          </p>
        </div>
        <div className="alert-score">
          <span className="stat-label">Anomaly score</span>
          <ScoreMeter score={alert.anomaly_score} />
        </div>
      </header>

      <dl className="alert-facts">
        <div><dt>When</dt><dd className="tabular">{dateTime(alert.transaction_at)} UTC</dd></div>
        <div><dt>Where</dt><dd>{alert.city}, {alert.country}</dd></div>
        <div><dt>Channel</dt><dd>{channelLabel(alert.channel)}</dd></div>
        <div><dt>Reference</dt><dd className="tabular">{alert.reference}</dd></div>
      </dl>

      <ul className="reasons">{alert.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>

      {resolved ? (
        <footer className="alert-resolution">
          <span>
            <Icon name={alert.status === 'confirmed' ? 'alert' : 'check'} size={15} />
            {alert.status === 'confirmed' ? 'Confirmed as fraud' : 'Dismissed as legitimate'}
            {alert.resolved_by_name ? ` by ${alert.resolved_by_name}` : ''}, {dateTime(alert.resolved_at)} UTC
          </span>
          <button type="button" className="button button-ghost button-sm" disabled={busy} onClick={() => onResolve(alert, 'open')}>
            Reopen
          </button>
        </footer>
      ) : (
        <footer className="alert-actions">
          <button type="button" className="button button-danger button-sm" disabled={busy} onClick={() => onResolve(alert, 'confirmed', true)}>
            <Icon name="lock" size={14} /> Confirm fraud and freeze account
          </button>
          <button type="button" className="button button-secondary button-sm" disabled={busy} onClick={() => onResolve(alert, 'confirmed', false)}>
            Confirm fraud
          </button>
          <button type="button" className="button button-ghost button-sm" disabled={busy} onClick={() => onResolve(alert, 'dismissed')}>
            Dismiss as legitimate
          </button>
        </footer>
      )}
    </article>
  );
}

function AlertList({ alerts, busyId, onResolve }) {
  const transitions = useTransition(alerts, {
    keys: (alert) => alert.id,
    from: { opacity: 0, x: 0 },
    enter: { opacity: 1, x: 0 },
    leave: { opacity: 0, x: 64 },
    config: { tension: 260, friction: 28 },
  });
  return transitions((style, alert) => (
    <animated.div style={{ opacity: style.opacity, transform: style.x.to((x) => `translateX(${x}px)`) }}>
      <AlertCard alert={alert} busy={busyId === alert.id} onResolve={onResolve} />
    </animated.div>
  ));
}

function ModelPanel({ user, onRetrained }) {
  const toast = useToast();
  const { data, error, reload } = useAsync(() => api('/fraud/model'), []);
  const [contamination, setContamination] = useState(2);
  const [training, setTraining] = useState(false);

  const retrain = async () => {
    setTraining(true);
    try {
      const { run } = await api('/fraud/retrain', { method: 'POST', body: { contamination: contamination / 100 } });
      toast(`Retrained on ${count(run.trained_rows)} transactions. ${count(run.flagged_rows)} are now flagged.`);
      reload();
      onRetrained();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setTraining(false);
    }
  };

  if (error && !data) return <aside className="card model-panel"><div className="notice notice-bad" role="alert"><Icon name="alert" /> {error.message}</div></aside>;
  if (!data) return <aside className="card model-panel"><div className="skeleton-block" aria-busy="true" /></aside>;

  const run = data.current;
  const metrics = run?.metrics || {};
  const serviceUp = data.service?.status === 'ok';
  const isAdmin = user.role === 'admin';

  return (
    <aside className="card model-panel">
      <header className="chart-head">
        <div>
          <h3>Isolation Forest</h3>
          <p>
            {run
              ? `Trained ${dateTime(run.trained_at)} UTC on ${count(run.trained_rows)} transactions${run.triggered_by_name ? ` by ${run.triggered_by_name}` : ''}.`
              : 'Not trained yet.'}
          </p>
        </div>
        <span className={`status ${serviceUp ? 'status-up' : 'status-down'}`}>
          <span className="status-dot" aria-hidden="true" />
          {serviceUp ? 'Scoring service online' : 'Scoring service offline'}
        </span>
      </header>

      {run && (
        <>
          <dl className="model-facts">
            <div><dt>Flagged</dt><dd>{count(run.flagged_rows)}</dd></div>
            <div><dt>Expected share</dt><dd>{percent(run.params.contamination)}</dd></div>
            <div><dt>Trees</dt><dd>{run.params.n_estimators}</dd></div>
            <div><dt>Scored</dt><dd>{count(data.coverage.scored)} of {count(data.coverage.transactions)}</dd></div>
          </dl>

          {metrics.labelled_anomalies > 0 && (
            <div className="model-grade">
              <h4>Accuracy on {metrics.labelled_anomalies} planted anomalies</h4>
              <div className="grade-row">
                <div>
                  <span className="stat-label">Precision</span>
                  <strong>{percent(metrics.precision, 0)}</strong>
                  <span>{metrics.true_positives} of {metrics.true_positives + metrics.false_positives} flags correct</span>
                </div>
                <div>
                  <span className="stat-label">Recall</span>
                  <strong>{percent(metrics.recall, 0)}</strong>
                  <span>{metrics.true_positives} of {metrics.labelled_anomalies} caught</span>
                </div>
              </div>
            </div>
          )}

          <div className="model-chart">
            <h4>Flags by anomaly score</h4>
            <div className="legend">
              <LegendItem color="var(--warning)">Medium</LegendItem>
              <LegendItem color="var(--serious)">High</LegendItem>
              <LegendItem color="var(--critical)">Critical</LegendItem>
            </div>
            <SeverityHistogram key={run.id} buckets={data.histogram} />
          </div>

          <details className="model-features">
            <summary>What the model looks at ({run.features.length} signals)</summary>
            <ul>
              {run.features.map((f) => <li key={f}>{FEATURE_TEXT[f] || f}</li>)}
            </ul>
          </details>
        </>
      )}

      <div className="retrain">
        <h4>Retrain</h4>
        <label className="field">
          <span>Share of transactions to flag: <strong>{contamination.toFixed(1)}%</strong></span>
          <input
            type="range" min="0.5" max="5" step="0.5" value={contamination} disabled={!isAdmin || training}
            onChange={(e) => setContamination(Number(e.target.value))}
          />
        </label>
        <button type="button" className="button button-primary" disabled={!isAdmin || training || !serviceUp} onClick={retrain}>
          <Icon name="refresh" size={15} className={training ? 'spin' : ''} />
          {training ? 'Training…' : 'Retrain on all transactions'}
        </button>
        {!isAdmin && <small>Admins only.</small>}
        {isAdmin && !serviceUp && <small>Start the scoring service first: <code>python app.py</code> in the ml folder.</small>}
      </div>
    </aside>
  );
}

export default function Fraud({ user, onQueueChanged }) {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const { data, error, loading, reload } = useAsync(
    () => api('/fraud/alerts', { params: { status, page, page_size: PAGE_SIZE } }).then((r) => ({ ...r, status })),
    [status, page],
  );

  const alerts = data?.items || [];
  const counts = data?.counts || { open: 0, confirmed: 0, dismissed: 0 };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const resolve = async (alert, next, freeze = false) => {
    setBusyId(alert.id);
    try {
      await api(`/fraud/alerts/${alert.id}`, { method: 'PATCH', body: { status: next, freeze_account: freeze } });
      const what = { confirmed: 'Confirmed as fraud', dismissed: 'Dismissed as legitimate', open: 'Reopened' }[next];
      toast(freeze ? `${what}. Account ${maskAccount(alert.account_number)} is frozen.` : `${what}.`);
      // Stepping back a page avoids landing on an empty one after clearing the last alert on it.
      if (alerts.length === 1 && page > 1) setPage(page - 1); else reload();
      onQueueChanged();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="Fraud review" />

      <div className="fraud-layout">
        <section className="fraud-queue" aria-label="Alerts">
          <div className="filter-row">
            <Segmented
              label="Alert status"
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[
                { value: 'open', label: 'Open', count: counts.open },
                { value: 'confirmed', label: 'Confirmed', count: counts.confirmed },
                { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
              ]}
            />
          </div>

          {error && <div className="notice notice-bad" role="alert"><Icon name="alert" /> {error.message}</div>}

          {data && alerts.length === 0 && (
            <p className="empty empty-large">
              {status === 'open'
                ? 'The queue is clear.'
                : `No ${status} alerts yet.`}
            </p>
          )}

          <div className={`alert-list ${loading && data ? 'is-refreshing' : ''}`}>
            {/* Keyed by the tab and page the data belongs to: switching tabs swaps the
                list at once, while resolving an alert animates just that card out. */}
            {data && <AlertList key={`${data.status}-${data.page}`} alerts={alerts} busyId={busyId} onResolve={resolve} />}
          </div>

          {data && data.total > PAGE_SIZE && (
            <footer className="pager">
              <span>{count((page - 1) * PAGE_SIZE + 1)}–{count(Math.min(page * PAGE_SIZE, data.total))} of {count(data.total)}</span>
              <div>
                <button type="button" className="button button-secondary button-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="button button-secondary button-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </footer>
          )}
        </section>

        <ModelPanel user={user} onRetrained={() => { setPage(1); reload(); onQueueChanged(); }} />
      </div>
    </>
  );
}
