// GET /api/resumes/[id] — resume detail (owner candidate or HR/ADMIN)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, ApiError } from '@/lib/api';
import { z } from 'zod';
import { logAudit, parseBody, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { serializeParsedData } from '@/lib/serialize';

export const GET = handler(async (req, ctx) => {
  const session = await requireAuth(req);
  const { id } = await ctx.params;

  const resume = await db.resume.findUnique({
    where: { id },
    include: { candidate: { select: { userId: true, user: { select: { name: true } } } } },
  });

  if (!resume) throw new ApiError('RESUME_NOT_FOUND', 'Resume not found', 404);

  const isStaff = session.role === 'HR' || session.role === 'ADMIN';
  if (!isStaff && resume.candidate.userId !== session.sub) {
    throw new ApiError('FORBIDDEN', 'You can only access your own resumes', 403);
  }

  return ok({
    id: resume.id,
    fileName: resume.fileName,
    fileSize: resume.fileSize,
    mimeType: resume.mimeType,
    parseStatus: resume.parseStatus,
    parseError: resume.parseError,
    isActive: resume.isActive,
    uploadedAt: resume.uploadedAt,
    extractedText: resume.extractedText,
    parsedData: serializeParsedData(resume.parsedData),
    candidate: { name: resume.candidate.user.name },
  });
});

const parsedDataSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).nullish(),
  phone: z.string().trim().max(30).nullish(),
  education: z.string().trim().max(300).nullish(),
  experienceYears: z.number().int().min(0).max(60).nullish(),
  experienceSummary: z.string().trim().max(5000).nullish(),
  certifications: z.string().trim().max(3000).nullish(),
  projects: z.string().trim().max(5000).nullish(),
  academicCourses: z.string().trim().max(2000).nullish(),
  internshipExperience: z.string().trim().max(3000).nullish(),
  workExperience: z.string().trim().max(5000).nullish(),
  achievements: z.string().trim().max(3000).nullish(),
  skills: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  programmingLanguages: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  frameworks: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  technologies: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  tools: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
}).refine((data) => Object.keys(data).length > 0, 'Provide at least one corrected field');

export const PATCH = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['CANDIDATE']);
  const { id } = await ctx.params;
  const body = await parseBody(req, parsedDataSchema);
  const resume = await db.resume.findUnique({
    where: { id },
    include: { candidate: { select: { id: true, userId: true } } },
  });
  if (!resume) throw new ApiError('RESUME_NOT_FOUND', 'Resume not found', 404);
  if (resume.candidate.userId !== session.sub) throw new ApiError('FORBIDDEN', 'You can only edit your own resume details', 403);

  const prior = serializeParsedData(resume.parsedData) ?? {};
  const parsedData = { ...prior, ...body };
  await db.$transaction(async (tx) => {
    await tx.resume.update({ where: { id }, data: { parsedData: JSON.stringify(parsedData) } });
    const profileData: { phone?: string | null; education?: string | null; experienceYears?: number } = {};
    if (body.phone !== undefined) profileData.phone = body.phone;
    if (body.education !== undefined) profileData.education = body.education;
    if (body.experienceYears != null) profileData.experienceYears = body.experienceYears;
    if (Object.keys(profileData).length) {
      await tx.candidateProfile.update({ where: { id: resume.candidate.id }, data: profileData });
    }
    if (body.name?.trim()) await tx.user.update({ where: { id: session.sub }, data: { name: body.name.trim() } });
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'RESUME_DETAILS_CORRECTED',
    entityType: 'RESUME',
    entityId: resume.id,
    details: { fields: Object.keys(body) },
    ip: clientIp(req),
  });
  return ok({ id: resume.id, parsedData });
});
