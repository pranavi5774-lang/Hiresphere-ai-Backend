// PATCH /api/applications/[id]/status — pipeline transition (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, notify, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { APPLICATION_STATUSES, APPLICATION_TRANSITIONS, LABELS } from '@/lib/constants';

const schema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  note: z.string().trim().max(1000).optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);

  const application = await db.application.findUnique({
    where: { id },
    include: {
      job: { select: { title: true } },
      candidate: { select: { userId: true } },
    },
  });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);

  const allowed = APPLICATION_TRANSITIONS[application.status] ?? [];
  if (!allowed.includes(body.status)) {
    throw new ApiError(
      'INVALID_TRANSITION',
      `Cannot move from ${application.status} to ${body.status}`,
      400,
      { from: application.status, to: body.status, allowed }
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const app = await tx.application.update({
      where: { id },
      data: { status: body.status },
    });
    await tx.applicationStatusHistory.create({
      data: {
        applicationId: id,
        fromStatus: application.status,
        toStatus: body.status,
        actorId: session.sub,
        actorName: session.name,
        actorRole: session.role,
        note: body.note ?? null,
      },
    });
    return app;
  });

  await notify(
    application.candidate.userId,
    'Application status updated',
    `Your application for ${application.job.title} is now "${LABELS[body.status] ?? body.status}".`,
    'APPLICATION_UPDATE',
    '#/portal/applications'
  );
  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'APPLICATION_STATUS_CHANGED',
    entityType: 'APPLICATION',
    entityId: id,
    details: { from: application.status, to: body.status, note: body.note ?? null },
    ip: clientIp(req),
  });

  return ok(updated);
});
