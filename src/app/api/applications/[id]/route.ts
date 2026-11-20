// GET /api/applications/[id] — full application detail (owner or HR/ADMIN)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { serializeAnalysis, serializeJobSkills, serializeParsedData } from '@/lib/serialize';

export const GET = handler(async (req, ctx) => {
  const session = await requireAuth(req);
  const { id } = await ctx.params;

  const application = await db.application.findUnique({
    where: { id },
    include: {
      job: { include: { department: { select: { id: true, name: true } } } },
      candidate: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
      resume: true,
      analyses: { take: 1 },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      interviews: { orderBy: { scheduledAt: 'asc' } },
      hrReviews: { orderBy: { createdAt: 'desc' } },
      evaluationHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);

  const isStaff = session.role === 'HR' || session.role === 'ADMIN';
  if (!isStaff && application.candidate.userId !== session.sub) {
    throw new ApiError('FORBIDDEN', 'You can only view your own applications', 403);
  }

  const { job, resume, analyses, statusHistory, interviews, hrReviews, evaluationHistory, candidate, ...rest } = application;
  return ok({
    ...rest,
    hrNotes: isStaff ? rest.hrNotes : undefined,
    job: { ...job, ...serializeJobSkills(job) },
    candidate: {
      id: candidate.id,
      name: candidate.user.name,
      email: candidate.user.email,
      phone: candidate.user.phone,
      experienceYears: candidate.experienceYears,
      education: candidate.education,
      headline: candidate.headline,
    },
    resume: {
      id: resume.id,
      fileName: resume.fileName,
      fileSize: resume.fileSize,
      parseStatus: resume.parseStatus,
      parseError: resume.parseError,
      isActive: resume.isActive,
      uploadedAt: resume.uploadedAt,
      extractedText: isStaff ? resume.extractedText : undefined,
      parsedData: serializeParsedData(resume.parsedData),
    },
    analysis: serializeAnalysis(analyses[0] ?? null),
    statusHistory,
    interviews,
    hrReviews: isStaff ? hrReviews : [],
    evaluationHistory: evaluationHistory.map((entry) => ({
      ...entry,
      parameterScores: JSON.parse(entry.parameterScores),
      weights: JSON.parse(entry.weights),
    })),
  });
});
