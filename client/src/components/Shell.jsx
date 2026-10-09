// App frame: navigation rail (a bottom bar on small screens) and the page area.
// The active-page marker slides between items on a spring.
import { useLayoutEffect, useRef } from 'react';
import { animated, to, useSpring } from '@react-spring/web';
import Icon from '../ui/Icon.jsx';
import { BrandMark } from '../views/Login.jsx';

export const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'accounts', label: 'Accounts', icon: 'accounts' },
  { id: 'transactions', label: 'Transactions', icon: 'transactions' },
  { id: 'fraud', label: 'Fraud review', icon: 'shield' },
];

export default function Shell({ page, user, openAlerts, onSignOut, children }) {
  const nav = useRef(null);
  const links = useRef({});
  const placed = useRef(false);
  const [marker, api] = useSpring(() => ({ x: 0, y: 0, width: 0, height: 0, opacity: 0, config: { tension: 300, friction: 30 } }));

  useLayoutEffect(() => {
    const place = () => {
      const el = links.current[page];
      if (!el) { api.start({ opacity: 0 }); return; }
      api.start({
        x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, opacity: 1,
        immediate: !placed.current,
      });
      placed.current = true;
    };
    place();
    // Re-measure when the rail flips between sidebar and bottom bar.
    const observer = new ResizeObserver(() => { placed.current = false; place(); });
    observer.observe(nav.current);
    return () => observer.disconnect();
  }, [page, api]);

  return (
    <div className="shell">
      <aside className="rail">
        <a className="brand" href="#/overview"><BrandMark /> <span>LedgerLens</span></a>

        <nav className="rail-nav" ref={nav} aria-label="Main">
          <animated.span
            className="rail-marker"
            aria-hidden="true"
            style={{
              width: marker.width,
              height: marker.height,
              opacity: marker.opacity,
              transform: to([marker.x, marker.y], (x, y) => `translate(${x}px, ${y}px)`),
            }}
          />
          {PAGES.map((item) => (
            <a
              key={item.id}
              href={`#/${item.id}`}
              ref={(el) => { links.current[item.id] = el; }}
              className="rail-link"
              aria-current={page === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'fraud' && openAlerts > 0 && (
                <span className="rail-count" aria-label={`${openAlerts} open alerts`}>{openAlerts}</span>
              )}
            </a>
          ))}
        </nav>

        <div className="rail-user">
          <div>
            <strong>{user.name}</strong>
            <span>{user.role === 'admin' ? 'Admin' : 'Analyst'}</span>
          </div>
          <button type="button" className="icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <Icon name="signout" />
          </button>
        </div>
      </aside>

      <main className="page">{children}</main>
    </div>
  );
}

export function PageHeader({ title, lede, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
