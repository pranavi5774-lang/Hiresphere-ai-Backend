// GET  /api/jobs — public job board (candidates/unauthenticated see OPEN only)
// POST /api/jobs — create job (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, getSession, requireAuth, parseBody, getPagination, paginated, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { JOB_STATUS, EMPLOYMENT_TYPES } from '@/lib/constants';
import { serializeJobEvaluation, serializeJobSkills } from '@/lib/serialize';
import { DEFAULT_EVALUATION_WEIGHTS, DEFAULT_MATCH_THRESHOLDS } from '@/lib/constants';

const JOB_SORT: Record<string, string> = {
  title: 'title',
  location: 'location',
  createdat: 'createdAt',
  updatedat: 'updatedAt',
};

export const GET = handler(async (req) => {
  const session = await getSession(req);
  const isStaff = session?.role === 'HR' || session?.role === 'ADMIN';
  const p = getPagination(req);
  const sp = req.nextUrl.searchParams;

  const statusParam = sp.get('status') ?? undefined;
  let statusFilter: string | undefined;
  if (isStaff && statusParam && statusParam !== 'ALL') {
    if (!JOB_STATUS.includes(statusParam as never)) {
      throw new ApiError('INVALID_STATUS', 'status must be one of DRAFT, OPEN, CLOSED or ALL', 400);
    }
    statusFilter = statusParam;
  }

  const employmentType = sp.get('employmentType') ?? undefined;
  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType as never)) {
    throw new ApiError('INVALID_EMPLOYMENT_TYPE', 'Invalid employment type filter', 400);
  }
  const departmentId = sp.get('departmentId') ?? undefined;
  const location = sp.get('location') ?? undefined;

  const where = {
    ...(!isStaff || !statusParam ? { status: 'OPEN' as string } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(location ? { location: { contains: location } } : {}),
    ...(p.search
      ? { OR: [{ title: { contains: p.search } }, { description: { contains: p.search } }] }
      : {}),
  };

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: { [JOB_SORT[p.sortBy.toLowerCase()] ?? 'createdAt']: p.sortDir },
      skip: p.skip,
      take: p.take,
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
      },
    }),
    db.job.count({ where }),
  ]);

  return ok(
    paginated(
      jobs.map((j) => ({ ...j, ...serializeJobSkills(j) })),
      total,
      p
    )
  );
});

const skillsSchema = z.array(z.string().trim().min(1).max(60)).max(15, 'At most 15 skills');
const weightKeys = Object.keys(DEFAULT_EVALUATION_WEIGHTS);
const evaluationWeightsSchema = z.record(z.string(), z.number().int().min(0).max(100))
  .refine((weights) => Object.keys(weights).length === weightKeys.length && weightKeys.every((key) => key in weights) && Object.values(weights).reduce((sum, weight) => sum + weight, 0) === 100, 'Evaluation weights must include all 12 parameters and total 100');
const matchThresholdsSchema = z.object({
  strong: z.number().int().min(1).max(100),
  potential: z.number().int().min(1).max(99),
  moderate: z.number().int().min(0).max(98),
}).refine((thresholds) => thresholds.strong > thresholds.potential && thresholds.potential > thresholds.moderate, 'Thresholds must descend from strong to moderate');

export const createSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(8000),
  departmentId: z.string().min(1).nullish(),
  location: z.string().trim().min(2).max(120),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('FULL_TIME'),
  experienceMin: z.coerce.number().min(0).max(30).default(0),
  educationReq: z.string().trim().max(200).nullish(),
  requiredSkills: skillsSchema.default([]),
  preferredSkills: skillsSchema.default([]),
  evaluationWeights: evaluationWeightsSchema.default(DEFAULT_EVALUATION_WEIGHTS),
  matchThresholds: matchThresholdsSchema.default(DEFAULT_MATCH_THRESHOLDS),
  salaryMin: z.coerce.number().min(0).nullish(),
  salaryMax: z.coerce.number().min(0).nullish(),
  openings: z.coerce.number().int().min(1).max(100).default(1),
  status: z.enum(['DRAFT', 'OPEN']).default('DRAFT'),
});

export const POST = handler(async (req) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const body = await parseBody(req, createSchema);

  if (body.departmentId) {
    const dept = await db.department.findUnique({ where: { id: body.departmentId }, select: { id: true } });
    if (!dept) throw new ApiError('INVALID_DEPARTMENT', 'Department not found', 400);
  }
  if (body.salaryMin != null && body.salaryMax != null && body.salaryMin > body.salaryMax) {
    throw new ApiError('INVALID_SALARY_RANGE', 'salaryMin cannot exceed salaryMax', 400);
  }

  const isPublished = body.status === 'OPEN';
  const job = await db.job.create({
    data: {
      title: body.title,
      description: body.description,
      departmentId: body.departmentId ?? null,
      location: body.location,
      employmentType: body.employmentType,
      experienceMin: body.experienceMin,
      educationReq: body.educationReq ?? null,
      requiredSkills: JSON.stringify(body.requiredSkills),
      preferredSkills: JSON.stringify(body.preferredSkills),
      evaluationWeights: JSON.stringify(body.evaluationWeights),
      matchThresholds: JSON.stringify(body.matchThresholds),
      salaryMin: body.salaryMin ?? null,
      salaryMax: body.salaryMax ?? null,
      openings: body.openings,
      status: body.status,
      createdBy: session.sub,
      ...(isPublished ? { publishedAt: new Date() } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'JOB_CREATED',
    entityType: 'JOB',
    entityId: job.id,
    details: { title: job.title, status: job.status },
    ip: clientIp(req),
  });
  if (isPublished) {
    await logAudit({
      actor: { id: session.sub, name: session.name, role: session.role },
      action: 'JOB_PUBLISHED',
      entityType: 'JOB',
      entityId: job.id,
      details: { title: job.title },
      ip: clientIp(req),
    });
  }

  return ok({ ...job, ...serializeJobSkills(job), ...serializeJobEvaluation(job) }, 201);
});
