// POST /api/auth/reset-password — consumes a reset token, sets a new password

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, parseBody, rateLimit, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { hashPassword, sha256 } from '@/lib/auth';

const schema = z.object({
  token: z.string().min(10, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

export const POST = handler(async (req) => {
  rateLimit(req, 'auth-reset', 10, 5 * 60 * 1000);
  const body = await parseBody(req, schema);

  const tokenHash = await sha256(body.token.trim());
  const record = await db.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) {
    throw new ApiError('INVALID_RESET_TOKEN', 'This reset link is invalid or has expired', 400);
  }

  const passwordHash = await hashPassword(body.password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await logAudit({
    actor: null,
    action: 'AUTH_PASSWORD_RESET_COMPLETED',
    entityType: 'AUTH',
    entityId: record.userId,
    details: null, // never log tokens or passwords
    ip: clientIp(req),
  });

  return ok({ message: 'Password has been reset. You can now sign in with your new password.' });
});
