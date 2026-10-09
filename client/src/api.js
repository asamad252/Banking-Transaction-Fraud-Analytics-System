// Small fetch wrapper: attaches the session token, parses JSON, and turns
// non-2xx responses into Errors carrying the server's message.
const SESSION_KEY = 'ledgerlens.session';
export const SIGNED_OUT_EVENT = 'ledgerlens:signed-out';

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be unavailable (private windows); the session then lasts until reload.
  }
}

let currentToken = loadSession()?.token || null;
export const setToken = (token) => { currentToken = token; };

export async function api(path, { method = 'GET', body, params } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, value);
  }
  const qs = search.toString();
  const url = `/api${path}${qs ? `?${qs}` : ''}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the API is running on port 4000.');
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
