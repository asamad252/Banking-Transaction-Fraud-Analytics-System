import { Fragment, useEffect, useState } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { api } from '../api.js';
import { navigate, useAsync, useDebounced } from '../hooks.js';
import { capitalize, channelLabel, CHANNELS, count, dateTime, maskAccount, money, typeLabel, TYPES } from '../format.js';
import Icon from '../ui/Icon.jsx';
import ScoreMeter, { SeverityBadge } from '../ui/ScoreMeter.jsx';
import { PageHeader } from '../components/Shell.jsx';
import MoveMoneyDialog from '../components/MoveMoneyDialog.jsx';

const PAGE_SIZE = 25;
const RANGES = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

/** Row details ease in when a row is expanded. */
function Details({ txn }) {
  const style = useSpring({ from: { opacity: 0, y: -6 }, to: { opacity: 1, y: 0 }, config: { tension: 280, friction: 26 } });
  return (
    <animated.div className="txn-details" style={{ opacity: style.opacity, transform: style.y.to((y) => `translateY(${y}px)`) }}>
      <dl>
        <div><dt>Reference</dt><dd className="tabular">{txn.reference}</dd></div>
        <div><dt>Where</dt><dd>{txn.city}, {txn.country}{txn.city !== txn.home_city ? ` (home: ${txn.home_city})` : ''}</dd></div>
        <div><dt>Channel</dt><dd>{channelLabel(txn.channel)}</dd></div>
        {txn.merchant_category && <div><dt>Category</dt><dd>{capitalize(txn.merchant_category)}</dd></div>}
      </dl>
      {txn.is_anomaly ? (
        <div className="txn-why">
          <strong>Why the model flagged it</strong>
          <ul className="reasons">{txn.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <a className="button button-secondary button-sm" href="#/fraud">Open fraud review</a>
        </div>
      ) : (
        <p className="txn-why">
          {txn.is_scored ? 'Nothing unusual.' : 'Not scored yet.'}
        </p>
      )}
    </animated.div>
  );
}

export default function Transactions({ query, onQueueChanged }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [channel, setChannel] = useState('');
  const [days, setDays] = useState('');
  const [flagged, setFlagged] = useState(Boolean(query.flagged));
  const [accountId, setAccountId] = useState(query.account || '');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [moving, setMoving] = useState(false);
  const term = useDebounced(search);

  // Links such as "View transactions" on another page arrive as hash parameters.
  useEffect(() => {
    setAccountId(query.account || '');
    setFlagged(Boolean(query.flagged));
    setPage(1);
  }, [query.account, query.flagged]);

  const { data, error, loading, reload } = useAsync(
    () => api('/transactions', {
      params: { q: term, type, channel, days, flagged: flagged ? 'true' : '', account_id: accountId, page, page_size: PAGE_SIZE },
    }),
    [term, type, channel, days, flagged, accountId, page],
  );
  const account = useAsync(() => (accountId ? api(`/accounts/${accountId}`) : Promise.resolve(null)), [accountId]);

  const change = (setter) => (event) => { setter(event.target.value); setPage(1); setExpanded(null); };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = term || type || channel || days || flagged || accountId;

  const clear = () => {
    setSearch(''); setType(''); setChannel(''); setDays(''); setFlagged(false); setPage(1);
    if (accountId) navigate('transactions');
  };

  return (
    <>
      <PageHeader title="Transactions" lede={data ? `${count(data.total)} ${filtered ? 'matching' : 'total'}` : null}>
        <button type="button" className="button button-primary" onClick={() => setMoving(true)}>
          <Icon name="plus" size={16} /> Move money
        </button>
      </PageHeader>

      <div className="filter-row">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search transactions</span>
          <input type="search" placeholder="Search name, account or reference" value={search} onChange={change(setSearch)} />
        </label>
        <label className="select-inline"><span>Type</span>
          <select value={type} onChange={change(setType)}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </label>
        <label className="select-inline"><span>Channel</span>
          <select value={channel} onChange={change(setChannel)}>
            <option value="">All channels</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
          </select>
        </label>
        <label className="select-inline"><span>Period</span>
          <select value={days} onChange={change(setDays)}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={flagged} onChange={(e) => { setFlagged(e.target.checked); setPage(1); }} />
          <span>Flagged only</span>
        </label>
        {filtered && <button type="button" className="button button-ghost button-sm" onClick={clear}>Clear filters</button>}
      </div>

      {accountId && account.data && (
        <div className="scope-chip">
          Showing one account: <strong>{account.data.account.customer_name}</strong>, {account.data.account.type} {maskAccount(account.data.account.account_number)}
          , balance {money(account.data.account.balance)}
          <button type="button" className="icon-button" aria-label="Show all accounts" onClick={() => navigate('transactions')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {error && <div className="notice notice-bad" role="alert"><Icon name="alert" /> {error.message}</div>}

      <section className={`card table-card ${loading && data ? 'is-refreshing' : ''}`}>
        <div className="table-scroll">
          <table className="data-table txn-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Customer</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Anomaly score</th>
                <th><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((txn) => {
                const open = expanded === txn.id;
                const incoming = txn.signed_amount > 0;
                return (
                  <Fragment key={txn.id}>
                    <tr className={`${txn.is_anomaly ? 'row-flagged' : ''} ${open ? 'row-open' : ''}`}>
                      <td className="tabular nowrap">{dateTime(txn.created_at)}</td>
                      <td>
                        <span className="cell-main">{txn.customer_name}</span>
                        <span className="cell-sub tabular">{maskAccount(txn.account_number)}</span>
                      </td>
                      <td>
                        <span className="cell-main">{txn.description}</span>
                        <span className="cell-sub">{typeLabel(txn.type)}, {channelLabel(txn.channel)}, {txn.city}</span>
                      </td>
                      <td className={`num amount ${incoming ? 'amount-in' : ''}`}>
                        {incoming ? '+' : '−'}{money(txn.amount)}
                      </td>
                      <td>
                        <div className="score-cell">
                          <ScoreMeter score={txn.anomaly_score} compact />
                          {txn.is_anomaly && <SeverityBadge severity={txn.alert_severity || 'medium'} />}
                        </div>
                      </td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className={`icon-button expander ${open ? 'is-open' : ''}`}
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} details for ${txn.reference}`}
                          onClick={() => setExpanded(open ? null : txn.id)}
                        >
                          <Icon name="chevron" size={16} />
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="row-details"><td colSpan={6}><Details txn={txn} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {data && data.items.length === 0 && (
          <p className="empty empty-large">
            {filtered ? 'No transactions match these filters.' : 'No transactions yet. Use Move money to record the first one.'}
          </p>
        )}

        {data && data.total > PAGE_SIZE && (
          <footer className="pager">
            <span>
              {count((page - 1) * PAGE_SIZE + 1)}–{count(Math.min(page * PAGE_SIZE, data.total))} of {count(data.total)}
            </span>
            <div>
              <button type="button" className="button button-secondary button-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); setExpanded(null); }}>Previous</button>
              <button type="button" className="button button-secondary button-sm" disabled={page >= pages} onClick={() => { setPage(page + 1); setExpanded(null); }}>Next</button>
            </div>
          </footer>
        )}
      </section>

      <MoveMoneyDialog
        open={moving}
        defaultAccountId={accountId || undefined}
        onClose={() => setMoving(false)}
        onSaved={() => { reload(); account.reload(); onQueueChanged(); }}
      />
    </>
  );
}
