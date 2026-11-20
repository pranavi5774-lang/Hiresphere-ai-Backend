// POST /api/applications/[id]/interviews — schedule an interview (HR/ADMIN)
// Also advances the application to INTERVIEW when the transition is legal.

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, notify, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { INTERVIEW_MODES, APPLICATION_TRANSITIONS, LABELS } from '@/lib/constants';

const schema = z.object({
  scheduledAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'scheduledAt must be a valid ISO datetime'),
  mode: z.enum(INTERVIEW_MODES).default('ONLINE'),
  locationOrLink: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const POST = handler(async (req, ctx) => {
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

  const scheduledAt = new Date(body.scheduledAt);

  const { interview, applicationStatus } = await db.$transaction(async (tx) => {
    const created = await tx.interview.create({
      data: {
        applicationId: id,
        scheduledAt,
        mode: body.mode,
        locationOrLink: body.locationOrLink ?? null,
        notes: body.notes ?? null,
        status: 'SCHEDULED',
      },
    });
    // Advance the pipeline only when legal from the current status
    const allowed = APPLICATION_TRANSITIONS[application.status] ?? [];
    let status = application.status;
    if (allowed.includes('INTERVIEW') && application.status !== 'INTERVIEW') {
      await tx.application.update({ where: { id }, data: { status: 'INTERVIEW' } });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: 'INTERVIEW',
          actorId: session.sub,
          actorName: session.name,
          actorRole: session.role,
          note: 'Interview scheduled',
        },
      });
      status = 'INTERVIEW';
    }
    return { interview: created, applicationStatus: status };
  });

  await notify(
    application.candidate.userId,
    'Interview scheduled',
    `Your interview for ${application.job.title} is scheduled for ${scheduledAt.toISOString()} (${LABELS[body.mode] ?? body.mode}).`,
    'INTERVIEW',
    '#/portal/applications'
  );
  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'INTERVIEW_SCHEDULED',
    entityType: 'APPLICATION',
    entityId: id,
    details: { interviewId: interview.id, scheduledAt: scheduledAt.toISOString(), mode: body.mode },
    ip: clientIp(req),
  });

  return ok({ interview, applicationStatus }, 201);
});
