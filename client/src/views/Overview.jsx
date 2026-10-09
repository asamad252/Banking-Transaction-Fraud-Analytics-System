// The analytics dashboard. One filter row scopes every tile, chart and table
// below it, so the numbers always describe the same slice of transactions.
import { useState } from 'react';
import { api } from '../api.js';
import { navigate, useAsync } from '../hooks.js';
import { channelLabel, CHANNELS, count, longDay, maskAccount, money, moneyCompact, moneyWhole, percent, typeLabel } from '../format.js';
import CountUp from '../bits/CountUp.jsx';
import Icon from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import ScoreMeter from '../ui/ScoreMeter.jsx';
import { PageHeader } from '../components/Shell.jsx';
import ChartCard, { LegendItem } from '../charts/ChartCard.jsx';
import DailyActivity from '../charts/DailyActivity.jsx';
import BarList from '../charts/BarList.jsx';
import Heatmap from '../charts/Heatmap.jsx';
import Scatter from '../charts/Scatter.jsx';

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Stat({ label, value, format, note, change, days, upIsBad = false, action }) {
  const hasChange = change !== null && change !== undefined && Number.isFinite(change);
  const tone = !hasChange || !upIsBad || Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'bad' : 'good';
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <CountUp className="stat-value" value={value} format={format} />
      {hasChange && (
        <span className={`stat-change stat-change-${tone}`}>
          <Icon name={change >= 0 ? 'up' : 'down'} size={13} />
          {percent(Math.abs(change))} vs previous {days} days
        </span>
      )}
      {note && <span className="stat-note">{note}</span>}
      {action}
    </div>
  );
}

const ratio = (now, before) => (before > 0 ? (now - before) / before : null);

export default function Overview() {
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState('');
  const { data, error, loading } = useAsync(
    () => api('/analytics/overview', { params: { days, channel } }),
    [days, channel],
  );

  const filters = (
    <div className="filter-row">
      <Segmented label="Date range" options={RANGES} value={days} onChange={setDays} />
      <label className="select-inline">
        <span>Channel</span>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
        </select>
      </label>
    </div>
  );

  if (error && !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="notice notice-bad" role="alert"><Icon name="alert" /> {error.message}</div>
      </>
    );
  }
  if (!data) return <><PageHeader title="Overview" />{filters}<div className="skeleton-block" aria-busy="true" /></>;

  const { kpis, previous, daily, heatmap, by_channel: byChannel, scatter, risky_accounts: risky } = data;
  const scope = data.scope;
  const unscored = kpis.transactions > 0 && kpis.scored === 0;
  const channelRows = [...byChannel]
    .sort((a, b) => b.flagged - a.flagged)
    .map((r) => ({ ...r, key: r.channel, label: channelLabel(r.channel), value: r.flagged }));
  const flaggedPoints = scatter.filter((p) => p.is_anomaly);

  return (
    <>
      <PageHeader title="Overview" />
      {filters}

      {unscored && (
        <div className="notice">
          <Icon name="alert" />
          <span>
            Nothing is scored yet. Train the model from <a href="#/fraud">Fraud review</a>.
          </span>
        </div>
      )}

      {/* While new numbers load the old ones stay on screen, dimmed. */}
      <div className={loading ? 'is-refreshing' : ''}>
        <section className="stat-row" aria-label="Headline figures">
          <Stat label="Money moved" value={kpis.volume} format={moneyCompact} change={ratio(kpis.volume, previous.volume)} days={scope.days} />
          <Stat label="Transactions" value={kpis.transactions} change={ratio(kpis.transactions, previous.transactions)} days={scope.days} />
          <Stat
            label="Flagged"
            value={kpis.flagged}
            upIsBad
            change={ratio(kpis.flagged, previous.flagged)}
            days={scope.days}
            note={kpis.transactions ? `${percent(kpis.flagged / kpis.transactions)} of transactions` : null}
          />
          <Stat label="Flagged value" value={kpis.flagged_amount} format={moneyCompact} />
          <Stat
            label="Open alerts"
            value={kpis.open_alerts}
            action={kpis.open_alerts > 0 && <a className="stat-link" href="#/fraud">Review alerts</a>}
          />
        </section>

        <div className="grid-2-1">
          <ChartCard
            // Remount on a new range so the line draws itself in again.
            key={`daily-${scope.days}-${scope.channel}`}
            title="Daily activity"
            table={{
              columns: [
                { key: 'day', label: 'Day', format: longDay },
                { key: 'transactions', label: 'Transactions', numeric: true, format: count },
                { key: 'volume', label: 'Money moved', numeric: true, format: moneyWhole },
                { key: 'flagged', label: 'Flagged', numeric: true },
              ],
              rows: [...daily].reverse(),
            }}
          >
            <DailyActivity data={daily} />
          </ChartCard>

          <ChartCard
            title="Flags by channel"
            table={{
              columns: [
                { key: 'label', label: 'Channel' },
                { key: 'transactions', label: 'Transactions', numeric: true, format: count },
                { key: 'flagged', label: 'Flagged', numeric: true },
                { key: 'rate', label: 'Share flagged', numeric: true, format: (_, r) => percent(r.transactions ? r.flagged / r.transactions : 0) },
                { key: 'flagged_amount', label: 'Flagged value', numeric: true, format: moneyWhole },
              ],
              rows: channelRows,
            }}
          >
            {channelRows.length === 0 ? <p className="empty">No transactions in this range.</p> : (
              <BarList
                rows={channelRows}
                valueLabel={(r) => (
                  <>
                    <strong>{r.flagged}</strong>
                    <span>{percent(r.transactions ? r.flagged / r.transactions : 0)} of {count(r.transactions)}</span>
                  </>
                )}
              />
            )}
          </ChartCard>
        </div>

        <div className="grid-1-1">
          <ChartCard
            title="When flags happen"
            table={{
              columns: [
                { key: 'when', label: 'Day and hour (UTC)', format: (_, r) => `${DAY_NAMES[r.dow - 1]} ${String(r.hour).padStart(2, '0')}:00` },
                { key: 'flagged', label: 'Flagged', numeric: true },
                { key: 'transactions', label: 'Transactions', numeric: true },
              ],
              rows: heatmap.filter((c) => c.flagged > 0).sort((a, b) => b.flagged - a.flagged || a.dow - b.dow || a.hour - b.hour),
              note: 'Hours with no flagged transactions are left out.',
            }}
          >
            <Heatmap cells={heatmap} />
          </ChartCard>

          <ChartCard
            key={`scatter-${scope.days}-${scope.channel}`}
            title="Amount against anomaly score"
            legend={(
              <>
                <LegendItem shape="dot" color="var(--dot-ordinary)">Ordinary</LegendItem>
                <LegendItem shape="diamond" color="var(--critical)">Flagged</LegendItem>
              </>
            )}
            table={{
              columns: [
                { key: 'customer_name', label: 'Customer' },
                { key: 'type', label: 'Type', format: typeLabel },
                { key: 'amount', label: 'Amount', numeric: true, format: money },
                { key: 'anomaly_score', label: 'Score', numeric: true, format: (v) => v.toFixed(2) },
              ],
              rows: flaggedPoints.slice(0, 100),
              note: flaggedPoints.length > 100
                ? `Showing the 100 highest-scoring of ${flaggedPoints.length} flagged transactions.`
                : 'Flagged transactions only, highest score first.',
            }}
          >
            {scatter.length === 0 ? <p className="empty">Nothing scored in this range yet.</p> : <Scatter points={scatter} />}
          </ChartCard>
        </div>

        <section className="card">
          <header className="chart-head">
            <div>
              <h3>Accounts with the most flags</h3>
            </div>
          </header>
          {risky.length === 0 ? <p className="empty">No flagged transactions in this range.</p> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Account</th>
                    <th className="num">Flagged</th>
                    <th className="num">Flagged value</th>
                    <th>Highest score</th>
                    <th className="num">Open alerts</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {risky.map((row) => (
                    <tr key={row.account_id}>
                      <td>
                        {row.customer_name}
                        {row.account_status === 'frozen' && <span className="badge badge-frozen"><Icon name="lock" size={12} /> Frozen</span>}
                      </td>
                      <td className="tabular">{maskAccount(row.account_number)}</td>
                      <td className="num">{row.flagged}</td>
                      <td className="num">{money(row.flagged_amount)}</td>
                      <td><ScoreMeter score={row.max_score} compact /></td>
                      <td className="num">{row.open_alerts}</td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className="button button-ghost button-sm"
                          onClick={() => navigate('transactions', { account: row.account_id, flagged: 1 })}
                        >
                          View transactions
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
