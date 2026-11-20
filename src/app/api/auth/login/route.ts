// POST /api/auth/login — email + password sign-in (sets httpOnly session cookie)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, parseBody, rateLimit, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { verifyPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';
import type { Role } from '@/lib/constants';

const schema = z.object({
  email: z.email('A valid email is required').max(160),
  password: z.string().min(1, 'Password is required').max(72),
});

export const POST = handler(async (req) => {
  rateLimit(req, 'auth-login', 10, 5 * 60 * 1000);
  const body = await parseBody(req, schema);
  const email = body.email.trim().toLowerCase();

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password', 401);
  }
  if (user.status !== 'ACTIVE') {
    throw new ApiError('ACCOUNT_DISABLED', 'This account has been deactivated', 403);
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role as Role });
  await logAudit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: 'AUTH_LOGIN',
    entityType: 'AUTH',
    entityId: user.id,
    details: { email },
    ip: clientIp(req),
  });

  // `token` is also returned in the body so the SPA can attach it as
  // Authorization: Bearer … when cookies are unavailable (preview iframe).
  const response = ok({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return response;
});
