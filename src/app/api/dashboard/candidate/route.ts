// GET /api/dashboard/candidate — candidate home metrics (CANDIDATE only)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { LABELS } from '@/lib/constants';

export const GET = handler(async (req) => {
  const session = await requireAuth(req, ['CANDIDATE']);

  const profile = await db.candidateProfile.findUnique({ where: { userId: session.sub } });
  if (!profile) throw new ApiError('CANDIDATE_PROFILE_MISSING', 'No candidate profile is linked to this account', 400);

  const [activeJobs, myApplications, myShortlisted, hasResume, latestHistory] = await Promise.all([
    db.job.count({ where: { status: 'OPEN' } }),
    db.application.count({ where: { candidateId: profile.id } }),
    db.application.count({ where: { candidateId: profile.id, status: 'SHORTLISTED' } }),
    db.resume.count({ where: { candidateId: profile.id } }),
    db.applicationStatusHistory.findFirst({
      where: { application: { candidateId: profile.id } },
      orderBy: { createdAt: 'desc' },
      include: { application: { include: { job: { select: { title: true } } } } },
    }),
  ]);

  // profileCompleteness: resume 40, phone 15, headline 15, education 15, summary 15
  let completeness = 0;
  if (hasResume > 0) completeness += 40;
  if (profile.phone) completeness += 15;
  if (profile.headline) completeness += 15;
  if (profile.education) completeness += 15;
  if (profile.summary) completeness += 15;

  return ok({
    activeJobs,
    myApplications,
    myShortlisted,
    profileCompleteness: Math.min(100, completeness),
    recentStatus: latestHistory
      ? {
          applicationId: latestHistory.applicationId,
          jobTitle: latestHistory.application.job.title,
          toStatus: latestHistory.toStatus,
          statusLabel: LABELS[latestHistory.toStatus] ?? latestHistory.toStatus,
          actorRole: latestHistory.actorRole,
          actorName: latestHistory.actorName,
          note: latestHistory.note,
          createdAt: latestHistory.createdAt,
        }
      : null,
  });
});
