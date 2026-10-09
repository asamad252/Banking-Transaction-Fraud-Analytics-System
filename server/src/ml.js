// Thin client for the Python scoring service (ml/app.py).
const ML_URL = (process.env.ML_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

export class MlUnavailable extends Error {}

async function call(path, { body, timeoutMs }) {
  let response;
  try {
    response = await fetch(`${ML_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new MlUnavailable(`Scoring service did not respond at ${ML_URL} (${err.name})`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MlUnavailable(payload.error || `Scoring service returned ${response.status}`);
  }
  return payload;
}

export const health = () => call('/health', { timeoutMs: 2_000 });
export const train = (transactions, params) => call('/train', { body: { transactions, params }, timeoutMs: 180_000 });
export const score = (transaction, history) => call('/score', { body: { transaction, history }, timeoutMs: 8_000 });
