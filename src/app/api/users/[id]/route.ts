// PATCH /api/users/[id] — update name/phone/role/status (ADMIN only)
// DELETE /api/users/[id] — deactivate (soft: status=SUSPENDED, ADMIN only)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { ROLES, USER_STATUS } from '@/lib/constants';

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(24).nullish(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUS).optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['ADMIN']);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found', 404);

  // Admin cannot demote or deactivate themselves
  if (id === session.sub && (body.role !== undefined || body.status !== undefined)) {
    throw new ApiError('CANNOT_MODIFY_SELF', 'You cannot change your own role or status', 400);
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      phone: true, lastLoginAt: true, createdAt: true,
    },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'USER_UPDATED',
    entityType: 'USER',
    entityId: id,
    details: { changes: Object.keys(body) },
    ip: clientIp(req),
  });
  return ok(updated);
});

export const DELETE = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['ADMIN']);
  const { id } = await ctx.params;

  if (id === session.sub) {
    throw new ApiError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account', 400);
  }
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found', 404);

  const updated = await db.user.update({
    where: { id },
    data: { status: 'SUSPENDED' },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'USER_DEACTIVATED',
    entityType: 'USER',
    entityId: id,
    details: { email: user.email },
    ip: clientIp(req),
  });
  return ok(updated);
});
