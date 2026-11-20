// POST /api/auth/register — candidate self-registration (auto-login)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, parseBody, rateLimit, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { hashPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.email('A valid email is required').max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  phone: z.string().trim().max(24).optional(),
});

export const POST = handler(async (req) => {
  rateLimit(req, 'auth-register', 10, 5 * 60 * 1000);
  const body = await parseBody(req, schema);
  const email = body.email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ApiError('EMAIL_EXISTS', 'An account with this email already exists', 409);

  const passwordHash = await hashPassword(body.password);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, passwordHash, name: body.name, role: 'CANDIDATE', phone: body.phone ?? null },
    });
    await tx.candidateProfile.create({ data: { userId: created.id, phone: body.phone ?? null } });
    return created;
  });

  const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: 'CANDIDATE' });
  await logAudit({
    actor: { id: user.id, name: user.name, role: user.role },
    action: 'AUTH_REGISTER',
    entityType: 'AUTH',
    entityId: user.id,
    details: { email },
    ip: clientIp(req),
  });

  // `token` is also returned in the body so the SPA can attach it as
  // Authorization: Bearer … when cookies are unavailable (preview iframe).
  const response = ok(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token },
    201
  );
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return response;
});
