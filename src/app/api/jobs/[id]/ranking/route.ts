// GET /api/jobs/[id]/ranking — AI-scored candidate ranking for a job (HR/ADMIN)
// Returns ALL applications ranked by matchScore (desc, nulls last) by default.
// Filters: ?minScore=&skill=&status=   Sorting: ?sortBy=&sortDir=

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { APPLICATION_STATUSES } from '@/lib/constants';
import { serializeAnalysis, serializeJobSkills } from '@/lib/serialize';

interface RankItem {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  matchScore: number | null;
  tfidfScore: number | null;
  skillScore: number | null;
  matchedSkills: { skill: string; alias?: string; evidence?: string; required?: boolean }[];
  missingSkills: string[];
  extraSkills: string[];
  experienceYears: number | null;
  education: string | null;
  resumeParseStatus: string;
  appliedAt: Date;
  recommendation: string;
  parameterScores: { key: string; score: number; weight: number; contribution: number }[];
  evaluationDate: Date | null;
}

export const GET = handler(async (req, ctx) => {
  await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  const job = await db.job.findUnique({ where: { id } });
  if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

  const statusParam = sp.get('status');
  if (statusParam && !APPLICATION_STATUSES.includes(statusParam as never)) {
    throw new ApiError('INVALID_STATUS', 'Invalid application status filter', 400);
  }
  const minScoreParam = sp.get('minScore');
  const minScore = minScoreParam !== null && minScoreParam !== '' ? Number(minScoreParam) : null;
  if (minScore !== null && (Number.isNaN(minScore) || minScore < 0 || minScore > 1)) {
    throw new ApiError('INVALID_MIN_SCORE', 'minScore must be a number between 0 and 1', 400);
  }
  const skillFilter = (sp.get('skill') ?? '').trim().toLowerCase();

  const applications = await db.application.findMany({
    where: { jobId: id, ...(statusParam ? { status: statusParam } : {}) },
    include: {
      candidate: { include: { user: { select: { name: true, email: true } } } },
      resume: { select: { parseStatus: true } },
      analyses: { take: 1 },
    },
  });

  let items: RankItem[] = applications.map((a) => {
    const analysis = serializeAnalysis(a.analyses[0] ?? null);
    const info = (analysis?.extractedInfo ?? null) as { experienceYears?: number | null; education?: string | null; skills?: string[] } | null;
    return {
      applicationId: a.id,
      candidateName: a.candidate.user.name,
      candidateEmail: a.candidate.user.email,
      status: a.status,
      matchScore: a.matchScore,
      tfidfScore: a.tfidfScore,
      skillScore: a.skillScore,
      matchedSkills: analysis?.matchedSkills ?? [],
      missingSkills: analysis?.missingSkills ?? [],
      extraSkills: analysis?.extraSkills ?? [],
      experienceYears: info?.experienceYears ?? a.candidate.experienceYears ?? null,
      education: info?.education ?? a.candidate.education ?? null,
      resumeParseStatus: a.resume.parseStatus,
      appliedAt: a.appliedAt,
      recommendation: analysis?.recommendation ?? 'UNEVALUATED',
      parameterScores: analysis?.parameterScores ?? [],
      evaluationDate: analysis?.createdAt ?? null,
    };
  });

  const dashboard = {
    totalApplications: items.length,
    evaluatedResumes: items.filter((item) => item.recommendation !== 'UNEVALUATED').length,
    strongMatches: items.filter((item) => item.recommendation === 'STRONG_MATCH').length,
    potentialMatches: items.filter((item) => item.recommendation === 'POTENTIAL_MATCH').length,
    moderateMatches: items.filter((item) => item.recommendation === 'MODERATE_MATCH').length,
    lowMatches: items.filter((item) => item.recommendation === 'LOW_MATCH').length,
    averageScore: items.filter((item) => item.matchScore !== null).reduce((sum, item) => sum + (item.matchScore ?? 0), 0) /
      Math.max(1, items.filter((item) => item.matchScore !== null).length),
  };

  // ---- filters ----
  if (minScore !== null) items = items.filter((i) => i.matchScore !== null && i.matchScore >= minScore);
  if (skillFilter) {
    items = items.filter(
      (i) =>
        i.matchedSkills.some((m) => m.skill.toLowerCase().includes(skillFilter)) ||
        i.extraSkills.some((s) => s.toLowerCase().includes(skillFilter))
    );
  }

  // ---- sorting (default matchScore desc, nulls last) ----
  const sortBy = (sp.get('sortBy') ?? 'matchScore').toLowerCase();
  const dir = sp.get('sortDir') === 'asc' ? 1 : -1;
  const numericGetters: Record<string, (i: RankItem) => number | null> = {
    matchscore: (i) => i.matchScore,
    tfidfscore: (i) => i.tfidfScore,
    skillscore: (i) => i.skillScore,
    experienceyears: (i) => i.experienceYears,
  };
  if (numericGetters[sortBy]) {
    const get = numericGetters[sortBy];
    items.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last regardless of direction
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  } else if (sortBy === 'candidate' || sortBy === 'candidatename') {
    items.sort((a, b) => a.candidateName.localeCompare(b.candidateName) * dir);
  } else if (sortBy === 'appliedat') {
    items.sort((a, b) => (a.appliedAt.getTime() - b.appliedAt.getTime()) * dir);
  } else {
    // default: matchScore desc, nulls last
    items.sort((a, b) => {
      if (a.matchScore === null && b.matchScore === null) return 0;
      if (a.matchScore === null) return 1;
      if (b.matchScore === null) return -1;
      return b.matchScore - a.matchScore;
    });
  }

  return ok({
    job: { id: job.id, title: job.title, ...serializeJobSkills(job) },
    total: items.length,
    dashboard,
    items,
  });
});
