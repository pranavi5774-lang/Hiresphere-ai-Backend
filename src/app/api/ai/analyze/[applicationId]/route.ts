// POST /api/ai/analyze/[applicationId] — re-run the AI pipeline (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { ok, fail, handler, requireAuth, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { runAnalysisForApplication } from '@/lib/ai/analyze-service';
import { AnalysisError } from '@/lib/ai/resume-matcher';
import { serializeAnalysis } from '@/lib/serialize';

export const POST = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { applicationId } = await ctx.params;

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { title: true } },
      resume: { select: { parseStatus: true } },
    },
  });
  if (!application) throw new ApiError('APPLICATION_NOT_FOUND', 'Application not found', 404);

  try {
    await runAnalysisForApplication(applicationId);
  } catch (err) {
    if (err instanceof AnalysisError) {
      return fail('ANALYSIS_FAILED', err.message, 400, { code: err.code });
    }
    throw err;
  }

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'AI_ANALYSIS_RUN',
    entityType: 'APPLICATION',
    entityId: applicationId,
    details: { jobTitle: application.job.title, resumeParseStatus: application.resume.parseStatus },
    ip: clientIp(req),
  });

  const analysis = await db.resumeAnalysis.findUnique({ where: { applicationId } });
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { matchScore: true, tfidfScore: true, skillScore: true },
  });
  return ok({ application: app, analysis: serializeAnalysis(analysis) });
});
