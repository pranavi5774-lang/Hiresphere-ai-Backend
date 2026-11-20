// GET /api/dashboard/stats — headline recruitment metrics (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  await requireAuth(req, ['HR', 'ADMIN']);

  const now = new Date();
  const [
    totalJobs,
    activeJobs,
    totalCandidates,
    totalApplications,
    pendingApplications,
    shortlisted,
    interviewsScheduled,
    hired,
  ] = await Promise.all([
    db.job.count(),
    db.job.count({ where: { status: 'OPEN' } }),
    db.user.count({ where: { role: 'CANDIDATE' } }),
    db.application.count(),
    db.application.count({ where: { status: { in: ['APPLIED', 'UNDER_REVIEW'] } } }),
    db.application.count({ where: { status: 'SHORTLISTED' } }),
    db.interview.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: now } } }),
    db.application.count({ where: { status: 'HIRED' } }),
  ]);

  return ok({
    totalJobs,
    activeJobs,
    totalCandidates,
    totalApplications,
    pendingApplications,
    shortlisted,
    interviewsScheduled,
    hired,
    generatedAt: now.toISOString(),
  });
});
