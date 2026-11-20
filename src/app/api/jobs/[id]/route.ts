// GET /api/jobs/[id] — public if OPEN; DRAFT/CLOSED visible to HR/ADMIN only
// PATCH /api/jobs/[id] — update job (HR/ADMIN)
// DELETE /api/jobs/[id] — delete job with zero applications (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, getSession, requireAuth, parseBody, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { JOB_STATUS, EMPLOYMENT_TYPES } from '@/lib/constants';
import { serializeJobEvaluation, serializeJobSkills } from '@/lib/serialize';
import { DEFAULT_EVALUATION_WEIGHTS } from '@/lib/constants';

async function loadJobWithMeta(id: string) {
  const job = await db.job.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
      creator: { select: { id: true, name: true } },
    },
  });
  return job;
}

export const GET = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const job = await loadJobWithMeta(id);
  if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

  if (job.status !== 'OPEN') {
    const session = await getSession(req);
    const isStaff = session?.role === 'HR' || session?.role === 'ADMIN';
    if (!isStaff) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404); // don't leak drafts
  }
  return ok({ ...job, ...serializeJobSkills(job), ...serializeJobEvaluation(job) });
});

const weightKeys = Object.keys(DEFAULT_EVALUATION_WEIGHTS);
const evaluationWeightsSchema = z.record(z.string(), z.number().int().min(0).max(100))
  .refine((weights) => Object.keys(weights).length === weightKeys.length && weightKeys.every((key) => key in weights) && Object.values(weights).reduce((sum, weight) => sum + weight, 0) === 100, 'Evaluation weights must include all 12 parameters and total 100');
const matchThresholdsSchema = z.object({
  strong: z.number().int().min(1).max(100),
  potential: z.number().int().min(1).max(99),
  moderate: z.number().int().min(0).max(98),
}).refine((thresholds) => thresholds.strong > thresholds.potential && thresholds.potential > thresholds.moderate, 'Thresholds must descend from strong to moderate');

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(20).max(8000).optional(),
  departmentId: z.string().min(1).nullish(),
  location: z.string().trim().min(2).max(120).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  experienceMin: z.coerce.number().min(0).max(30).optional(),
  educationReq: z.string().trim().max(200).nullish(),
  requiredSkills: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
  preferredSkills: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
  evaluationWeights: evaluationWeightsSchema.optional(),
  matchThresholds: matchThresholdsSchema.optional(),
  salaryMin: z.coerce.number().min(0).nullish(),
  salaryMax: z.coerce.number().min(0).nullish(),
  openings: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(JOB_STATUS).optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const job = await db.job.findUnique({ where: { id } });
  if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);

  if (body.departmentId) {
    const dept = await db.department.findUnique({ where: { id: body.departmentId }, select: { id: true } });
    if (!dept) throw new ApiError('INVALID_DEPARTMENT', 'Department not found', 400);
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId ?? null;
  if (body.location !== undefined) data.location = body.location;
  if (body.employmentType !== undefined) data.employmentType = body.employmentType;
  if (body.experienceMin !== undefined) data.experienceMin = body.experienceMin;
  if (body.educationReq !== undefined) data.educationReq = body.educationReq ?? null;
  if (body.requiredSkills !== undefined) data.requiredSkills = JSON.stringify(body.requiredSkills);
  if (body.preferredSkills !== undefined) data.preferredSkills = JSON.stringify(body.preferredSkills);
  if (body.evaluationWeights !== undefined) data.evaluationWeights = JSON.stringify(body.evaluationWeights);
  if (body.matchThresholds !== undefined) data.matchThresholds = JSON.stringify(body.matchThresholds);
  if (body.salaryMin !== undefined) data.salaryMin = body.salaryMin ?? null;
  if (body.salaryMax !== undefined) data.salaryMax = body.salaryMax ?? null;
  if (body.openings !== undefined) data.openings = body.openings;

  let published = false;
  let closed = false;
  if (body.status !== undefined && body.status !== job.status) {
    data.status = body.status;
    if (body.status === 'OPEN' && !job.publishedAt) {
      data.publishedAt = new Date();
      published = true;
    }
    if (body.status === 'CLOSED' && !job.closedAt) {
      data.closedAt = new Date();
      closed = true;
    }
  }

  const updated = await db.job.update({
    where: { id },
    data,
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
  });

  const actor = { id: session.sub, name: session.name, role: session.role };
  await logAudit({ actor, action: 'JOB_UPDATED', entityType: 'JOB', entityId: id, details: { changes: Object.keys(body) }, ip: clientIp(req) });
  if (published) await logAudit({ actor, action: 'JOB_PUBLISHED', entityType: 'JOB', entityId: id, details: { title: updated.title }, ip: clientIp(req) });
  if (closed) await logAudit({ actor, action: 'JOB_CLOSED', entityType: 'JOB', entityId: id, details: { title: updated.title }, ip: clientIp(req) });

  return ok({ ...updated, ...serializeJobSkills(updated), ...serializeJobEvaluation(updated) });
});

export const DELETE = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { id } = await ctx.params;

  const job = await db.job.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!job) throw new ApiError('JOB_NOT_FOUND', 'Job not found', 404);
  if (job._count.applications > 0) {
    throw new ApiError('JOB_HAS_APPLICATIONS', 'This job has applications and cannot be deleted', 409);
  }

  await db.job.delete({ where: { id } });
  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'JOB_DELETED',
    entityType: 'JOB',
    entityId: id,
    details: { title: job.title },
    ip: clientIp(req),
  });
  return ok({ id, deleted: true });
});
