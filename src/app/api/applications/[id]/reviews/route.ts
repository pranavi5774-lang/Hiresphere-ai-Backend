// POST /api/applications/[id]/reviews — record a human review of the AI recommendation

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'OVERRIDDEN']),
  reason: z.string().trim().max(1000).optional(),
  comments: z.string().trim().max(2000).optional(),
}).refine((body) => body.decision === 'APPROVED' || Boolean(body.reason), {
  path: ['reason'],
  message: 'A reason is required when rejecting or overriding a recommendation',
});

export const POST = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;
  const body = await parseBody(req, reviewSchema);
  const application = await db.application.findUnique({ where: { id }, select: { id: true } });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);

  const review = await db.hRReview.create({
    data: {
      applicationId: id,
      reviewerId: session.sub,
      reviewerName: session.name,
      reviewerRole: session.role,
      decision: body.decision,
      reason: body.reason?.trim() || null,
      comments: body.comments?.trim() || null,
    },
  });
  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'AI_RECOMMENDATION_REVIEWED',
    entityType: 'APPLICATION',
    entityId: id,
    details: { reviewId: review.id, decision: body.decision, reason: body.reason ?? null },
    ip: clientIp(req),
  });
  return ok(review, 201);
});
