// GET /api/ai/analysis/[applicationId] — stored analysis (owner candidate or HR/ADMIN)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { serializeAnalysis } from '@/lib/serialize';

export const GET = handler(async (req, ctx) => {
  const session = await requireAuth(req);
  const { applicationId } = await ctx.params;

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      analyses: { take: 1 },
      candidate: { select: { userId: true } },
    },
  });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);

  const isStaff = session.role === 'HR' || session.role === 'ADMIN';
  if (!isStaff && application.candidate.userId !== session.sub) {
    throw new ApiError('FORBIDDEN', 'You can only view analysis for your own applications', 403);
  }
  if (!application.analyses[0]) throw new ApiError('NO_ANALYSIS', 'No AI analysis is available for this application yet', 404);

  return ok(serializeAnalysis(application.analyses[0]));
});
