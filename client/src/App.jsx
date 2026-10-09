import { useCallback, useEffect, useState } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { api, loadSession, saveSession, setToken, SIGNED_OUT_EVENT } from './api.js';
import { useHashRoute } from './hooks.js';
import { ToastProvider } from './ui/Toast.jsx';
import Shell from './components/Shell.jsx';
import Login from './views/Login.jsx';
import Overview from './views/Overview.jsx';
import Accounts from './views/Accounts.jsx';
import Transactions from './views/Transactions.jsx';
import Fraud from './views/Fraud.jsx';
import CustomerHome from './views/CustomerHome.jsx';

const VIEWS = { overview: Overview, accounts: Accounts, transactions: Transactions, fraud: Fraud };

function PageEnter({ children }) {
  const style = useSpring({ from: { opacity: 0, y: 8 }, to: { opacity: 1, y: 0 }, config: { tension: 260, friction: 28 } });
  return (
    <animated.div className="page-inner" style={{ opacity: style.opacity, transform: style.y.to((y) => `translateY(${y}px)`) }}>
      {children}
    </animated.div>
  );
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const route = useHashRoute('overview');
  const [openAlerts, setOpenAlerts] = useState(0);

  const signOut = useCallback(() => {
    saveSession(null);
    setToken(null);
    setSession(null);
  }, []);

  const signIn = (next) => {
    saveSession(next);
    setToken(next.token);
    setSession(next);
  };

  // The API answers 401 when a token expires; drop back to the sign-in page.
  useEffect(() => {
    window.addEventListener(SIGNED_OUT_EVENT, signOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signOut);
  }, [signOut]);

  // Badge on the "Fraud review" link. Views call this after anything that changes the queue.
  const refreshAlertCount = useCallback(() => {
    api('/fraud/alerts', { params: { status: 'open', page_size: 1 } })
      .then((result) => setOpenAlerts(result.counts.open))
      .catch(() => {});
  }, []);
  const isCustomer = session?.user.role === 'customer';
  useEffect(() => { if (session && !isCustomer) refreshAlertCount(); }, [session, isCustomer, refreshAlertCount]);

  const page = VIEWS[route.page] ? route.page : 'overview';
  const View = VIEWS[page];

  if (!session) return <Login onSignedIn={signIn} />;
  if (isCustomer) {
    return (
      <ToastProvider>
        <CustomerHome user={session.user} onSignOut={signOut} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <Shell page={page} user={session.user} openAlerts={openAlerts} onSignOut={signOut}>
        {/* Keyed by page, so each navigation mounts a fresh wrapper that eases in. */}
        <PageEnter key={page}>
          <View user={session.user} query={route.query} onQueueChanged={refreshAlertCount} />
        </PageEnter>
      </Shell>
    </ToastProvider>
  );
}
