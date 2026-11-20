// GET /api/jobs/[id]/applications — applications for a job (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, getPagination, paginated, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { APPLICATION_STATUSES } from '@/lib/constants';
import { serializeAnalysis } from '@/lib/serialize';

const SORT: Record<string, string> = {
  appliedat: 'appliedAt',
  matchscore: 'matchScore',
  status: 'status',
  updatedat: 'updatedAt',
};

export const GET = handler(async (req, ctx) => {
  await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;

  const job = await db.job.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

  const p = getPagination(req, { sortBy: 'appliedAt' });
  const statusParam = req.nextUrl.searchParams.get('status');
  if (statusParam && !APPLICATION_STATUSES.includes(statusParam as never)) {
    throw new ApiError('INVALID_STATUS', 'Invalid application status filter', 400);
  }

  const where = { jobId: id, ...(statusParam ? { status: statusParam } : {}) };
  const [applications, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: { [SORT[p.sortBy.toLowerCase()] ?? 'appliedAt']: p.sortDir },
      skip: p.skip,
      take: p.take,
      include: {
        candidate: { include: { user: { select: { name: true, email: true, phone: true } } } },
        resume: { select: { id: true, fileName: true, parseStatus: true, isActive: true } },
        analyses: { take: 1 },
      },
    }),
    db.application.count({ where }),
  ]);

  return ok({
    job: { id: job.id, title: job.title },
    ...paginated(
      applications.map((a) => ({
        id: a.id,
        status: a.status,
        matchScore: a.matchScore,
        tfidfScore: a.tfidfScore,
        skillScore: a.skillScore,
        hrNotes: a.hrNotes,
        appliedAt: a.appliedAt,
        updatedAt: a.updatedAt,
        candidate: {
          name: a.candidate.user.name,
          email: a.candidate.user.email,
          phone: a.candidate.user.phone,
          experienceYears: a.candidate.experienceYears,
        },
        resume: a.resume,
        analysis: serializeAnalysis(a.analyses[0] ?? null),
      })),
      total,
      p
    ),
  });
});
