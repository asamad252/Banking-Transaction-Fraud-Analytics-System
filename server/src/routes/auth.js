import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { HttpError, wrap } from '../http.js';

const router = Router();

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Enter your email and password');

  let { rows: [user] } = await query(
    'SELECT id, email, full_name, role, password_hash FROM staff_users WHERE email = $1::text',
    [email],
  );
  // Bank customers sign in through the same form and get the 'customer' role.
  if (!user) {
    ({ rows: [user] } = await query(
      `SELECT id, email, full_name, 'customer' AS role, password_hash
       FROM customers WHERE lower(email) = $1::text AND password_hash IS NOT NULL`,
      [email],
    ));
  }
  // Same message either way, so the form does not reveal which emails exist.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect');
  }

  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.full_name, role: user.role },
  });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
