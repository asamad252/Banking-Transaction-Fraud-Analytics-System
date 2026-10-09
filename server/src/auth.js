import jwt from 'jsonwebtoken';
import { HttpError } from './http.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET is not set. Copy server/.env.example to server/.env first.');
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, name: user.full_name, email: user.email }, SECRET, {
    expiresIn: '8h',
  });
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Sign in to continue'));
  try {
    const claims = jwt.verify(token, SECRET);
    req.user = { id: Number(claims.sub), role: claims.role, name: claims.name, email: claims.email };
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Sign in again.'));
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : next(new HttpError(403, `Only ${roles.join(' or ')} users can do this`));
