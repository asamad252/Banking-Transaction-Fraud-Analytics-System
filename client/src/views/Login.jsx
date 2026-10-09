import { useState } from 'react';
import { api } from '../api.js';
import Icon from '../ui/Icon.jsx';
import IsolationHero from './IsolationHero.jsx';

const DEMO = [
  { role: 'Admin', email: 'admin@ledgerlens.demo' },
  { role: 'Analyst', email: 'analyst@ledgerlens.demo' },
  { role: 'Customer', email: 'customer@ledgerlens.demo' },
];

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (credentials) => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api('/auth/login', { method: 'POST', body: credentials }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-copy">
        <a className="brand" href="#/" aria-label="LedgerLens">
          <BrandMark /> LedgerLens
        </a>

        <section className="login-card" aria-labelledby="login-heading">
          <header className="login-card-head">
            <span className="eyebrow">Secure account access</span>
            <h1 id="login-heading">Welcome back</h1>
            <p>Sign in to manage accounts, activity, and fraud reviews.</p>
          </header>

          <form
            className="login-form"
            onSubmit={(event) => { event.preventDefault(); signIn({ email, password }); }}
          >
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            {error && <p className="form-error" role="alert"><Icon name="alert" size={15} /> {error}</p>}
          </form>

          <div className="login-demo">
            <p>Demo sign-in</p>
            <div className="login-demo-buttons">
              {DEMO.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  className="demo-card"
                  disabled={busy}
                  onClick={() => signIn({ email: demo.email, password: 'demo1234' })}
                >
                  {demo.role}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="login-visual">
        <IsolationHero />
      </div>
    </main>
  );
}

export function BrandMark({ size = 26 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" />
      <path d="M19 4v24M19 14h9" />
      <circle className="brand-out" cx="24.5" cy="8.5" r="2.6" />
      <circle cx="9" cy="17" r="2" />
      <circle cx="13" cy="22" r="2" />
      <circle cx="8" cy="24" r="2" />
    </svg>
  );
}
