// Record a deposit, withdrawal, card payment or transfer. After saving, the
// dialog shows what the fraud model made of it.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { capitalize, CATEGORIES, channelLabel, maskAccount, money } from '../format.js';
import Dialog from '../ui/Dialog.jsx';
import Icon from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import ScoreMeter, { SeverityBadge } from '../ui/ScoreMeter.jsx';

const KINDS = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdraw' },
  { value: 'payment', label: 'Card payment' },
  { value: 'transfer', label: 'Transfer' },
];
const CHANNELS_FOR = {
  deposit: ['branch', 'atm', 'mobile'],
  withdrawal: ['atm', 'branch'],
  payment: ['pos', 'online', 'mobile'],
  transfer: ['online', 'mobile', 'branch'],
};
const SUBMIT_LABEL = {
  deposit: 'Record deposit', withdrawal: 'Record withdrawal', payment: 'Record payment', transfer: 'Send transfer',
};
const accountLabel = (a) => `${a.customer_name}, ${a.type} ${maskAccount(a.account_number)}`;
const EMPTY = { kind: 'deposit', accountId: '', toAccountId: '', amount: '', channel: 'branch', category: 'groceries', city: '', country: '', deviceId: '' };

export default function MoveMoneyDialog({ open, onClose, onSaved, defaultAccountId }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, accountId: defaultAccountId ? String(defaultAccountId) : '' });
    setResult(null);
    setError(null);
    setShowContext(false);
    api('/accounts').then((r) => setAccounts(r.items.filter((a) => a.status === 'active'))).catch((e) => setError(e.message));
  }, [open, defaultAccountId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setKind = (kind) => set({ kind, channel: CHANNELS_FOR[kind][0] });
  const source = accounts.find((a) => String(a.id) === form.accountId);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const context = { city: form.city || undefined, country: form.country || undefined, device_id: form.deviceId || undefined };
    try {
      const saved = form.kind === 'transfer'
        ? await api('/transactions/transfer', {
          method: 'POST',
          body: { from_account_id: Number(form.accountId), to_account_id: Number(form.toAccountId), amount: form.amount, channel: form.channel, ...context },
        })
        : await api('/transactions', {
          method: 'POST',
          body: {
            account_id: Number(form.accountId), type: form.kind, amount: form.amount, channel: form.channel,
            merchant_category: form.kind === 'payment' ? form.category : undefined, ...context,
          },
        });
      setResult(saved);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const accountOptions = accounts.map((a) => (
    <option key={a.id} value={a.id}>{accountLabel(a)}</option>
  ));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={result ? 'Transaction recorded' : 'Move money'}
    >
      {result ? (
        <div className="dialog-body">
          <div className="receipt">
            <span className="receipt-amount">{money(result.transaction.amount)}</span>
            <span>{result.transaction.description}</span>
            <span>{result.transaction.customer_name}, account {maskAccount(result.transaction.account_number)}</span>
            <span className="receipt-ref">{result.transaction.reference}</span>
          </div>

          {result.fraud ? (
            <div className={`verdict ${result.fraud.is_anomaly ? 'verdict-flagged' : ''}`}>
              <div className="verdict-head">
                <strong>{result.fraud.is_anomaly ? 'Flagged for review' : 'Looks ordinary'}</strong>
                {result.fraud.is_anomaly && <SeverityBadge severity={result.fraud.severity} />}
              </div>
              <ScoreMeter score={result.fraud.anomaly_score} />
              {result.fraud.is_anomaly ? (
                <ul className="reasons">
                  {result.fraud.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              ) : (
                <p>No alert raised.</p>
              )}
            </div>
          ) : (
            <div className="notice">
              <Icon name="alert" />
              <span>Saved, not scored: the scoring service is offline.</span>
            </div>
          )}

          <footer className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={() => { setResult(null); set({ amount: '' }); }}>
              Record another
            </button>
            {result.fraud?.is_anomaly && (
              <a className="button button-secondary" href="#/fraud" onClick={onClose}>Open fraud review</a>
            )}
            <button type="button" className="button button-primary" data-autofocus onClick={onClose}>Done</button>
          </footer>
        </div>
      ) : (
        <form className="dialog-body" onSubmit={submit}>
          <Segmented label="Kind of transaction" options={KINDS} value={form.kind} onChange={setKind} />

          <label className="field">
            <span>{form.kind === 'transfer' ? 'From account' : 'Account'}</span>
            <select required value={form.accountId} onChange={(e) => set({ accountId: e.target.value })}>
              <option value="" disabled>Choose an account</option>
              {accountOptions}
            </select>
            {source && <small>Available balance {money(source.balance)}</small>}
          </label>

          {form.kind === 'transfer' && (
            <label className="field">
              <span>To account</span>
              <select required value={form.toAccountId} onChange={(e) => set({ toAccountId: e.target.value })}>
                <option value="" disabled>Choose an account</option>
                {accounts.filter((a) => String(a.id) !== form.accountId).map((a) => (
                  <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                ))}
              </select>
            </label>
          )}

          <div className="field-row">
            <label className="field">
              <span>Amount (USD)</span>
              <input
                required
                inputMode="decimal"
                placeholder="0.00"
                pattern="\d+(\.\d{1,2})?"
                title="A positive amount with at most two decimals"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value.trim() })}
              />
            </label>
            <label className="field">
              <span>Channel</span>
              <select value={form.channel} onChange={(e) => set({ channel: e.target.value })}>
                {CHANNELS_FOR[form.kind].map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
              </select>
            </label>
          </div>

          {form.kind === 'payment' && (
            <label className="field">
              <span>Merchant category</span>
              <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
              </select>
            </label>
          )}

          <button type="button" className="disclosure" aria-expanded={showContext} onClick={() => setShowContext((s) => !s)}>
            <Icon name="chevron" size={15} /> Location and device
          </button>
          {showContext && (
            <div className="context-fields">
              <div className="field-row">
                <label className="field"><span>City</span><input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder={source?.home_city || ''} /></label>
                <label className="field"><span>Country</span><input value={form.country} onChange={(e) => set({ country: e.target.value })} placeholder={source?.home_country || ''} /></label>
              </div>
              <label className="field"><span>Device name</span><input value={form.deviceId} onChange={(e) => set({ deviceId: e.target.value })} placeholder="e.g. unknown-laptop" /></label>
            </div>
          )}

          {error && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {error}</p>}

          <footer className="dialog-actions">
            <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Saving…' : SUBMIT_LABEL[form.kind]}
            </button>
          </footer>
        </form>
      )}
    </Dialog>
  );
}
