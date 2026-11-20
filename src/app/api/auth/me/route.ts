// GET /api/auth/me — current session user (any authenticated role)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, ApiError, parseBody, rateLimit, logAudit, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/lib/auth';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  phone: z.string().trim().max(24).optional(),
});

export const GET = handler(async (req) => {
  const session = await requireAuth(req);
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      status: true,
      createdAt: true,
      candidateProfile: true,
    },
  });
  if (!user) throw new ApiError('SESSION_USER_MISSING', 'Session user no longer exists', 401);
  const { candidateProfile, ...rest } = user;
  return ok({
    user: {
      ...rest,
      candidateProfile: user.role === 'CANDIDATE' ? candidateProfile : null,
    },
  });
});

export const PATCH = handler(async (req) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  rateLimit(req, 'auth-profile-update', 20, 15 * 60 * 1000);
  const body = await parseBody(req, profileSchema);

  const user = await db.user.update({
    where: { id: session.sub },
    data: { name: body.name, phone: body.phone || null },
    select: { id: true, email: true, name: true, role: true, phone: true, status: true },
  });
  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: session.role,
  });

  await logAudit({
    actor: { id: user.id, name: user.name, role: session.role },
    action: 'AUTH_PROFILE_UPDATED',
    entityType: 'AUTH',
    entityId: user.id,
    details: { fields: ['name', 'phone'] },
    ip: clientIp(req),
  });

  const response = ok({ user, token });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return response;
});
