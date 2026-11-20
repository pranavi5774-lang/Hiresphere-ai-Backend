// GET  /api/applications — role-scoped list (CANDIDATE own; HR/ADMIN all)
// POST /api/applications — candidate applies to a job (runs AI pipeline synchronously)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, getPagination, paginated, logAudit, notify, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { APPLICATION_STATUSES, LABELS } from '@/lib/constants';
import { serializeAnalysis } from '@/lib/serialize';
import { runAnalysisForApplication } from '@/lib/ai/analyze-service';

const SORT: Record<string, string> = {
  appliedat: 'appliedAt',
  matchscore: 'matchScore',
  status: 'status',
  updatedat: 'updatedAt',
};

export const GET = handler(async (req) => {
  const session = await requireAuth(req);
  const isStaff = session.role === 'HR' || session.role === 'ADMIN';
  const p = getPagination(req, { sortBy: 'appliedAt' });
  const sp = req.nextUrl.searchParams;

  const statusParam = sp.get('status');
  if (statusParam && !APPLICATION_STATUSES.includes(statusParam as never)) {
    throw new ApiError('INVALID_STATUS', 'Invalid application status filter', 400);
  }
  const jobId = sp.get('jobId') ?? undefined;

  let where: Record<string, unknown> = {
    ...(statusParam ? { status: statusParam } : {}),
    ...(jobId ? { jobId } : {}),
  };

  if (!isStaff) {
    const profile = await db.candidateProfile.findUnique({ where: { userId: session.sub }, select: { id: true } });
    where = { ...where, candidateId: profile?.id ?? 'none' };
  } else if (p.search) {
    where = { ...where, candidate: { user: { OR: [{ name: { contains: p.search } }, { email: { contains: p.search } }] } } };
  }

  const [applications, total] = await Promise.all([
    db.application.findMany({
      where,
      orderBy: { [SORT[p.sortBy.toLowerCase()] ?? 'appliedAt']: p.sortDir },
      skip: p.skip,
      take: p.take,
      include: {
        job: { include: { department: { select: { id: true, name: true } } } },
        candidate: { include: { user: { select: { name: true, email: true } } } },
        resume: { select: { id: true, fileName: true, parseStatus: true } },
        analyses: { take: 1 },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    }),
    db.application.count({ where }),
  ]);

  return ok(
    paginated(
      applications.map((a) => ({
        id: a.id,
        status: a.status,
        statusLabel: LABELS[a.status] ?? a.status,
        matchScore: a.matchScore,
        tfidfScore: a.tfidfScore,
        skillScore: a.skillScore,
        hrNotes: isStaff ? a.hrNotes : undefined,
        appliedAt: a.appliedAt,
        updatedAt: a.updatedAt,
        job: {
          id: a.job.id,
          title: a.job.title,
          location: a.job.location,
          employmentType: a.job.employmentType,
          status: a.job.status,
          department: a.job.department,
        },
        candidate: isStaff ? { name: a.candidate.user.name, email: a.candidate.user.email } : undefined,
        resume: a.resume,
        analysis: serializeAnalysis(a.analyses[0] ?? null),
        statusHistory: a.statusHistory.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          actorName: h.actorName,
          actorRole: h.actorRole,
          note: h.note,
          createdAt: h.createdAt,
        })),
      })),
      total,
      p
    )
  );
});

const applySchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  resumeId: z.string().min(1).optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handler(async (req) => {
  const session = await requireAuth(req, ['CANDIDATE']);
  const body = await parseBody(req, applySchema);

  const job = await db.job.findUnique({ where: { id: body.jobId } });
  if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
  if (job.status !== 'OPEN') throw new ApiError('JOB_CLOSED', 'This job is no longer accepting applications', 409);

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.sub },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!profile) throw new ApiError('CANDIDATE_PROFILE_MISSING', 'No candidate profile is linked to this account', 400);

  // Resolve resume: explicit resumeId (must be owned) or the candidate's active resume
  let resume;
  if (body.resumeId) {
    resume = await db.resume.findUnique({ where: { id: body.resumeId } });
    if (!resume || resume.candidateId !== profile.id) {
      throw new ApiError('INVALID_RESUME', 'Resume not found or does not belong to you', 403);
    }
  } else {
    resume = await db.resume.findFirst({
      where: { candidateId: profile.id, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!resume) throw new ApiError('NO_RESUME', 'Upload a resume before applying', 400);
  }

  // Duplicate guard: same job + candidate with a live application
  const existing = await db.application.findUnique({
    where: { jobId_candidateId: { jobId: job.id, candidateId: profile.id } },
  });
  if (existing && existing.status !== 'WITHDRAWN') {
    throw new ApiError('DUPLICATE_APPLICATION', 'You have already applied to this job', 409);
  }

  const application = await db.$transaction(async (tx) => {
    const app = existing
      ? await tx.application.update({
          where: { id: existing.id },
          data: {
            status: 'APPLIED',
            resumeId: resume.id,
            appliedAt: new Date(),
            matchScore: null,
            tfidfScore: null,
            skillScore: null,
            hrNotes: null,
          },
        })
      : await tx.application.create({
          data: { jobId: job.id, candidateId: profile.id, resumeId: resume.id, status: 'APPLIED' },
        });
    await tx.applicationStatusHistory.create({
      data: {
        applicationId: app.id,
        fromStatus: existing ? existing.status : null,
        toStatus: 'APPLIED',
        actorId: session.sub,
        actorName: session.name,
        actorRole: session.role,
      },
    });
    return app;
  });

  // Notify all active HR users
  const hrUsers = await db.user.findMany({ where: { role: 'HR', status: 'ACTIVE' }, select: { id: true } });
  await Promise.all(
    hrUsers.map((u) =>
      notify(u.id, 'New application received', `${session.name} applied for ${job.title}.`, 'HR_ACTION', '#/hr/applications')
    )
  );
  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'APPLICATION_SUBMITTED',
    entityType: 'APPLICATION',
    entityId: application.id,
    details: { jobId: job.id, jobTitle: job.title, resumeId: resume.id },
    ip: clientIp(req),
  });

  // Synchronous AI scoring — must never block applying
  try {
    await runAnalysisForApplication(application.id);
  } catch (err) {
    console.error('[AI] Analysis failed for application', application.id, err instanceof Error ? err.message : err);
  }

  const full = await db.application.findUnique({
    where: { id: application.id },
    include: {
      job: { select: { id: true, title: true, location: true, status: true } },
      resume: { select: { id: true, fileName: true, parseStatus: true } },
      analyses: { take: 1 },
      statusHistory: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!full) throw new ApiError('INTERNAL_ERROR', 'Application could not be loaded after creation', 500);

  return ok(
    {
      id: full.id,
      jobId: full.jobId,
      status: full.status,
      matchScore: full.matchScore,
      tfidfScore: full.tfidfScore,
      skillScore: full.skillScore,
      appliedAt: full.appliedAt,
      job: full.job,
      resume: full.resume,
      analysis: serializeAnalysis(full.analyses[0] ?? null),
      statusHistory: full.statusHistory,
    },
    201
  );
});
