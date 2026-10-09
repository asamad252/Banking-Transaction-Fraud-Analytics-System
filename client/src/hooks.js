import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Run an async loader whenever `deps` change. While a reload is in flight the
 * previous data stays available, so screens can dim instead of flashing empty.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const run = ++latest.current;
    setState((s) => ({ ...s, loading: true }));
    loader().then(
      (data) => run === latest.current && setState({ data, error: null, loading: false }),
      (error) => run === latest.current && setState((s) => ({ data: s.data, error, loading: false })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Width of an element, kept up to date as it resizes. */
export function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function useDebounced(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Minimal hash router: "#/transactions?account=12" -> { page: 'transactions', query: { account: '12' } }. */
export function useHashRoute(defaultPage) {
  const parse = () => {
    const [path, search = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
    return { page: path || defaultPage, query: Object.fromEntries(new URLSearchParams(search)) };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return route;
}

export const navigate = (page, query) => {
  const search = query ? `?${new URLSearchParams(query)}` : '';
  window.location.hash = `/${page}${search}`;
};
