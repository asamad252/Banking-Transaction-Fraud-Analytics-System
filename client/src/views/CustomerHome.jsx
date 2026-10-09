// What a bank customer sees: their own accounts, recent activity, and two
// actions - send money and pay. No scores, no other customers.
import { useState } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { capitalize, CATEGORIES, count, dateTime, maskAccount, money } from '../format.js';
import CountUp from '../bits/CountUp.jsx';
import SpotlightCard from '../bits/SpotlightCard.jsx';
import Sparkline from '../charts/Sparkline.jsx';
import Dialog from '../ui/Dialog.jsx';
import Icon from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import { useToast } from '../ui/Toast.jsx';
import { BrandMark } from './Login.jsx';

const PAGE_SIZE = 12;

function PayDialog({ open, onClose, accounts, onDone }) {
  const [kind, setKind] = useState('transfer');
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('groceries');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const active = accounts.filter((a) => a.status === 'active');
  const from = accountId || String(active[0]?.id || '');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = kind === 'transfer'
        ? await api('/me/transfer', { method: 'POST', body: { from_account_id: Number(from), to_account_number: to, amount } })
        : await api('/me/payment', { method: 'POST', body: { account_id: Number(from), merchant_category: category, amount } });
      setAmount('');
      setTo('');
      onDone(result, kind);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Move money" width={460}>
      <form className="dialog-body" onSubmit={submit}>
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[{ value: 'transfer', label: 'Send money' }, { value: 'payment', label: 'Pay' }]}
        />
        <label className="field">
          <span>From</span>
          <select required value={from} onChange={(e) => setAccountId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>{capitalize(a.type)} {maskAccount(a.account_number)} ({money(a.balance)})</option>
            ))}
          </select>
        </label>
        {kind === 'transfer' ? (
          <label className="field">
            <span>To account number</span>
            <input required inputMode="numeric" pattern="\d{10}" title="A 10-digit account number" placeholder="10 digits" value={to} onChange={(e) => setTo(e.target.value.trim())} />
          </label>
        ) : (
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Amount (USD)</span>
          <input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" title="An amount with at most two decimals" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
        </label>
        {error && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {error}</p>}
        <footer className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || active.length === 0}>
            {busy ? 'Sending…' : kind === 'transfer' ? 'Send money' : 'Pay'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export default function CustomerHome({ user, onSignOut }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [paying, setPaying] = useState(false);
  const accounts = useAsync(() => api('/me/accounts'), []);
  const activity = useAsync(
    () => api('/me/transactions', { params: { page, page_size: PAGE_SIZE, account_id: filter } }),
    [page, filter],
  );
  const enter = useSpring({ from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0 }, config: { tension: 220, friction: 26 } });

  const items = accounts.data?.items || [];
  const total = items.reduce((sum, a) => sum + a.balance, 0);
  const pages = activity.data ? Math.max(1, Math.ceil(activity.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="customer">
      <header className="customer-bar">
        <span className="brand"><BrandMark /> LedgerLens</span>
        <div className="customer-who">
          <span>{user.name}</span>
          <button type="button" className="icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <Icon name="signout" />
          </button>
        </div>
      </header>

      <animated.main className="customer-main" style={{ opacity: enter.opacity, transform: enter.y.to((y) => `translateY(${y}px)`) }}>
        <section className="customer-hero">
          <div>
            <span className="stat-label">Total balance</span>
            <CountUp className="customer-total" value={total} format={money} />
          </div>
          <button type="button" className="button button-primary" onClick={() => setPaying(true)} disabled={items.length === 0}>
            <Icon name="transactions" size={16} /> Move money
          </button>
        </section>

        {accounts.error && <div className="notice notice-bad" role="alert"><Icon name="alert" /> {accounts.error.message}</div>}

        <div className="account-grid">
          {items.map((account) => (
            <SpotlightCard as="article" key={account.id} className={`card account-card ${account.status === 'frozen' ? 'is-frozen' : ''}`}>
              <header>
                <div>
                  <h3>{capitalize(account.type)}</h3>
                  <p className="tabular">{account.account_number}</p>
                </div>
                {account.status === 'frozen' && <span className="badge badge-frozen"><Icon name="lock" size={12} /> Frozen</span>}
              </header>
              <div className="account-balance">
                <strong>{money(account.balance)}</strong>
                <Sparkline values={account.balance_trend} label="Balance over the last 30 days" />
              </div>
            </SpotlightCard>
          ))}
        </div>

        <section className={`card table-card ${activity.loading && activity.data ? 'is-refreshing' : ''}`}>
          <header className="customer-activity-head">
            <h2>Activity</h2>
            {items.length > 1 && (
              <label className="select-inline">
                <span className="sr-only">Account</span>
                <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
                  <option value="">All accounts</option>
                  {items.map((a) => <option key={a.id} value={a.id}>{capitalize(a.type)} {maskAccount(a.account_number)}</option>)}
                </select>
              </label>
            )}
          </header>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>When</th><th>Description</th><th>Account</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {(activity.data?.items || []).map((txn) => (
                  <tr key={txn.id}>
                    <td className="tabular nowrap">{dateTime(txn.created_at)}</td>
                    <td>
                      {txn.description}
                      {txn.under_review && <span className="badge badge-medium badge-inline"><span className="badge-mark" aria-hidden="true" /> Under review</span>}
                    </td>
                    <td className="tabular">{maskAccount(txn.account_number)}</td>
                    <td className={`num amount ${txn.signed_amount > 0 ? 'amount-in' : ''}`}>
                      {txn.signed_amount > 0 ? '+' : '−'}{money(txn.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {activity.data && activity.data.items.length === 0 && <p className="empty empty-large">No activity yet.</p>}
          {activity.data && activity.data.total > PAGE_SIZE && (
            <footer className="pager">
              <span>Page {page} of {count(pages)}</span>
              <div>
                <button type="button" className="button button-secondary button-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="button button-secondary button-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </footer>
          )}
        </section>
      </animated.main>

      <PayDialog
        open={paying}
        onClose={() => setPaying(false)}
        accounts={items}
        onDone={(result, kind) => {
          setPaying(false);
          toast(result.under_review
            ? 'Done. The bank is reviewing this transaction.'
            : kind === 'transfer' ? 'Money sent.' : 'Payment made.');
          accounts.reload();
          setPage(1);
          activity.reload();
        }}
      />
    </div>
  );
}
