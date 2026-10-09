import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { navigate, useAsync } from '../hooks.js';
import { capitalize, count, day, maskAccount, money } from '../format.js';
import SpotlightCard from '../bits/SpotlightCard.jsx';
import Sparkline from '../charts/Sparkline.jsx';
import Dialog from '../ui/Dialog.jsx';
import Icon from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import { useToast } from '../ui/Toast.jsx';
import { PageHeader } from '../components/Shell.jsx';
import MoveMoneyDialog from '../components/MoveMoneyDialog.jsx';

const PAGE = 18;
const TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'business', label: 'Business' },
];

function AccountCard({ account, onFreeze, onMoveMoney }) {
  const frozen = account.status === 'frozen';
  return (
    <SpotlightCard as="article" className={`card account-card ${frozen ? 'is-frozen' : ''}`}>
      <header>
        <div>
          <h3>{account.customer_name}</h3>
          <p className="tabular">{capitalize(account.type)} {maskAccount(account.account_number)}, {account.home_city}</p>
        </div>
        {frozen && <span className="badge badge-frozen"><Icon name="lock" size={12} /> Frozen</span>}
      </header>

      <div className="account-balance">
        <div>
          <span className="stat-label">Balance</span>
          <strong>{money(account.balance)}</strong>
        </div>
        <Sparkline values={account.balance_trend} label={`Balance over the last 30 days, now ${money(account.balance)}`} />
      </div>

      <dl className="account-facts">
        <div><dt>Transactions</dt><dd>{count(account.txn_count)}</dd></div>
        <div>
          <dt>Flagged</dt>
          <dd>
            {account.flagged_count > 0
              ? <span className="flag-count"><Icon name="alert" size={13} /> {account.flagged_count}</span>
              : 'None'}
          </dd>
        </div>
        <div><dt>Last activity</dt><dd>{account.last_activity ? day(account.last_activity) : 'None yet'}</dd></div>
      </dl>

      <footer>
        <button type="button" className="button button-secondary button-sm" onClick={() => navigate('transactions', { account: account.id })}>
          Transactions
        </button>
        <button type="button" className="button button-secondary button-sm" disabled={frozen} onClick={() => onMoveMoney(account)}>
          Move money
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => onFreeze(account)}
          aria-label={`${frozen ? 'Unfreeze' : 'Freeze'} account ${maskAccount(account.account_number)}`}
          title={frozen ? 'Unfreeze account' : 'Freeze account'}
        >
          <Icon name={frozen ? 'unlock' : 'lock'} size={16} />
        </button>
      </footer>
    </SpotlightCard>
  );
}

function OpenAccountDialog({ open, onClose, onOpened }) {
  const customers = useAsync(() => (open ? api('/accounts/customers') : Promise.resolve(null)), [open]);
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState('checking');
  const [deposit, setDeposit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account } = await api('/accounts', {
        method: 'POST',
        body: { customer_id: Number(customerId), type, opening_deposit: deposit || undefined },
      });
      setCustomerId('');
      setDeposit('');
      onOpened(account);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Open an account">
      <form className="dialog-body" onSubmit={submit}>
        <label className="field">
          <span>Customer</span>
          <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="" disabled>Choose a customer</option>
            {(customers.data?.items || []).map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.home_city})</option>)}
          </select>
        </label>
        <div className="field">
          <span>Account type</span>
          <Segmented label="Account type" options={TYPES} value={type} onChange={setType} />
        </div>
        <label className="field">
          <span>Opening deposit (USD, optional)</span>
          <input inputMode="decimal" placeholder="0.00" pattern="\d+(\.\d{1,2})?" title="An amount with at most two decimals" value={deposit} onChange={(e) => setDeposit(e.target.value.trim())} />
        </label>
        {error && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {error}</p>}
        <footer className="dialog-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Opening…' : 'Open account'}</button>
        </footer>
      </form>
    </Dialog>
  );
}

export default function Accounts({ onQueueChanged }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api('/accounts'), []);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [opening, setOpening] = useState(false);
  const [moving, setMoving] = useState(null);

  const accounts = data?.items || [];
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter === 'flagged' && a.flagged_count === 0) return false;
      if (filter === 'frozen' && a.status !== 'frozen') return false;
      return !term || a.customer_name.toLowerCase().includes(term) || a.account_number.includes(term);
    });
  }, [accounts, search, filter]);

  const totals = useMemo(() => ({
    balance: accounts.reduce((sum, a) => sum + a.balance, 0),
    flagged: accounts.filter((a) => a.flagged_count > 0).length,
    frozen: accounts.filter((a) => a.status === 'frozen').length,
  }), [accounts]);

  const toggleFreeze = async (account) => {
    const next = account.status === 'frozen' ? 'active' : 'frozen';
    try {
      await api(`/accounts/${account.id}/status`, { method: 'PATCH', body: { status: next } });
      toast(next === 'frozen' ? `Froze ${maskAccount(account.account_number)}. It cannot move money until unfrozen.` : `Unfroze ${maskAccount(account.account_number)}.`);
      reload();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title="Accounts"
        lede={data ? `${count(accounts.length)} accounts, ${money(totals.balance)} held` : null}
      >
        <button type="button" className="button button-primary" onClick={() => setOpening(true)}>
          <Icon name="plus" size={16} /> Open account
        </button>
      </PageHeader>

      <div className="filter-row">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search accounts</span>
          <input type="search" placeholder="Search by customer or account number" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} />
        </label>
        <Segmented
          label="Show"
          value={filter}
          onChange={(v) => { setFilter(v); setShown(PAGE); }}
          options={[
            { value: 'all', label: 'All', count: accounts.length },
            { value: 'flagged', label: 'With flags', count: totals.flagged },
            { value: 'frozen', label: 'Frozen', count: totals.frozen },
          ]}
        />
      </div>

      {error && <div className="notice notice-bad" role="alert"><Icon name="alert" /> {error.message}</div>}

      {data && visible.length === 0 && (
        <p className="empty empty-large">
          {accounts.length === 0 ? 'No accounts yet. Open the first one to get started.' : 'No accounts match. Clear the search or switch back to All.'}
        </p>
      )}

      <div className={`account-grid ${loading && data ? 'is-refreshing' : ''}`}>
        {visible.slice(0, shown).map((account) => (
          <AccountCard key={account.id} account={account} onFreeze={toggleFreeze} onMoveMoney={setMoving} />
        ))}
      </div>

      {visible.length > shown && (
        <div className="more">
          <button type="button" className="button button-secondary" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, visible.length - shown)} more
          </button>
          <span>Showing {shown} of {visible.length}</span>
        </div>
      )}

      <OpenAccountDialog
        open={opening}
        onClose={() => setOpening(false)}
        onOpened={(account) => {
          setOpening(false);
          toast(`Opened ${account.type} account ${maskAccount(account.account_number)} for ${account.customer_name}.`);
          reload();
        }}
      />
      <MoveMoneyDialog
        open={Boolean(moving)}
        defaultAccountId={moving?.id}
        onClose={() => setMoving(null)}
        onSaved={() => { reload(); onQueueChanged(); }}
      />
    </>
  );
}
