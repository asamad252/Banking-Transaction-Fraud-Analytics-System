// Stroke icons drawn on a 24px grid. `currentColor` lets them follow text colour.
const PATHS = {
  overview: 'M4 19V10M10 19V5M16 19v-7M21 19H3',
  accounts: 'M3 8.5 12 4l9 4.5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18',
  transactions: 'M4 8h13l-3-3M20 16H7l3 3',
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14ZM20 20l-3.5-3.5',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17l9-10',
  alert: 'M12 4 2.8 19.5h18.4L12 4ZM12 10v4.5M12 17.2v.3',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v9H5z',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  signout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  chevron: 'M9 6l6 6-6 6',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  chart: 'M4 19V5M4 19h16M8 15l4-5 3 3 5-7',
  up: 'M12 19V6M6 11l6-6 6 6',
  down: 'M12 5v13M6 13l6 6 6-6',
  replay: 'M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5',
};

export default function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
