// GET /api/resumes/mine — candidate's own resumes

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, getPagination, paginated, ApiError } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  const session = await requireAuth(req, ['CANDIDATE']);
  const profile = await db.candidateProfile.findUnique({ where: { userId: session.sub }, select: { id: true } });
  if (!profile) throw new ApiError('CANDIDATE_PROFILE_MISSING', 'No candidate profile is linked to this account', 400);

  const p = getPagination(req);
  const [items, total] = await Promise.all([
    db.resume.findMany({
      where: { candidateId: profile.id },
      orderBy: { uploadedAt: 'desc' },
      skip: p.skip,
      take: p.take,
      select: { id: true, fileName: true, fileSize: true, parseStatus: true, isActive: true, uploadedAt: true },
    }),
    db.resume.count({ where: { candidateId: profile.id } }),
  ]);
  return ok(paginated(items, total, p));
});
