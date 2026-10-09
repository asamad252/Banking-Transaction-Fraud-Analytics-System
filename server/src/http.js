/** An error that should reach the client with a specific status and message. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
export const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function toInt(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${name} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

/** Money arrives as a number or numeric string; allow at most two decimals. */
export function toAmount(value, name = 'amount', { max = 1_000_000 } = {}) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new HttpError(400, `${name} must be a positive number with at most two decimals`);
  }
  const n = Number(text);
  if (n <= 0) throw new HttpError(400, `${name} must be greater than zero`);
  if (n > max) throw new HttpError(400, `${name} cannot exceed ${max.toLocaleString('en-US')}`);
  return n;
}

export function oneOf(value, allowed, name, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${name} is required`);
  }
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${name} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

export function optionalText(value, name, maxLength = 200) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length > maxLength) throw new HttpError(400, `${name} must be ${maxLength} characters or fewer`);
  return text || null;
}
