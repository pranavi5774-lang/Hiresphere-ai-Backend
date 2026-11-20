// PATCH /api/applications/[id]/notes — HR notes on an application (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';

const schema = z.object({ hrNotes: z.string().trim().max(4000) });

export const PATCH = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);

  const application = await db.application.findUnique({ where: { id }, select: { id: true } });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);

  const updated = await db.application.update({
    where: { id },
    data: { hrNotes: body.hrNotes },
    select: { id: true, hrNotes: true, updatedAt: true },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'APPLICATION_NOTES_UPDATED',
    entityType: 'APPLICATION',
    entityId: id,
    ip: clientIp(req),
  });
  return ok(updated);
});
