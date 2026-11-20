// POST /api/applications/[id]/withdraw — candidate withdraws own application

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { LABELS } from '@/lib/constants';

export const POST = handler(async (req, ctx) => {
  const session = await requireAuth(req);
  const { id } = await ctx.params;

  const application = await db.application.findUnique({
    where: { id },
    include: {
      job: { select: { title: true } },
      candidate: { select: { userId: true } },
    },
  });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);
  if (application.candidate.userId !== session.sub) {
    throw new ApiError('FORBIDDEN', 'You can only withdraw your own applications', 403);
  }
  if (['WITHDRAWN', 'HIRED', 'REJECTED'].includes(application.status)) {
    throw new ApiError('INVALID_TRANSITION', `A ${LABELS[application.status] ?? application.status} application cannot be withdrawn`, 400);
  }

  const updated = await db.$transaction(async (tx) => {
    const app = await tx.application.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    });
    await tx.applicationStatusHistory.create({
      data: {
        applicationId: id,
        fromStatus: application.status,
        toStatus: 'WITHDRAWN',
        actorId: session.sub,
        actorName: session.name,
        actorRole: session.role,
      },
    });
    return app;
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'APPLICATION_WITHDRAWN',
    entityType: 'APPLICATION',
    entityId: id,
    details: { from: application.status, to: 'WITHDRAWN', jobTitle: application.job.title },
    ip: clientIp(req),
  });

  return ok(updated);
});
