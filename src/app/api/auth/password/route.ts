// POST /api/auth/password — change the authenticated staff member's password

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ApiError, clientIp, handler, logAudit, ok, parseBody, rateLimit, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(72),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(72),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current password',
  });

export const POST = handler(async (req) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  rateLimit(req, 'auth-password-change', 5, 15 * 60 * 1000);
  const body = await parseBody(req, schema);

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new ApiError('SESSION_USER_MISSING', 'Session user no longer exists', 401);
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    throw new ApiError('CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect', 400);
  }

  const passwordHash = await hashPassword(body.newPassword);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
  ]);

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'AUTH_PASSWORD_CHANGED',
    entityType: 'AUTH',
    entityId: user.id,
    details: null,
    ip: clientIp(req),
  });

  return ok({ message: 'Password changed successfully.' });
});
