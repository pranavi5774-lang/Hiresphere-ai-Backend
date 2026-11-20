// POST /api/auth/forgot-password — issues a password reset token.
// Always returns a generic message (no user enumeration). In DEV the
// raw token is returned as `devResetToken` so the flow is testable
// without an email service. Production would email the token instead.

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, parseBody, rateLimit, logAudit, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { generateResetToken, sha256 } from '@/lib/auth';

const schema = z.object({ email: z.email('A valid email is required').max(160) });

export const POST = handler(async (req) => {
  rateLimit(req, 'auth-forgot', 10, 5 * 60 * 1000);
  const body = await parseBody(req, schema);
  const email = body.email.trim().toLowerCase();

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  let devResetToken: string | undefined;

  if (user) {
    // Invalidate previous unused tokens, then issue a fresh one (1h expiry)
    await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = generateResetToken();
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: await sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await logAudit({
      actor: null,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entityType: 'AUTH',
      entityId: user.id,
      details: null, // intentionally no email/token in audit details
      ip: clientIp(req),
    });
    if (process.env.NODE_ENV !== 'production') {
      devResetToken = token; // DEV convenience only — never in production
    }
  }

  const data: Record<string, unknown> = {
    message: 'If an account exists for this email, a password reset link has been sent.',
  };
  if (devResetToken) data.devResetToken = devResetToken;
  return ok(data);
});
