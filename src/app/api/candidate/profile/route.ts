// GET   /api/candidate/profile — own candidate profile (CANDIDATE only)
// PATCH /api/candidate/profile — update own candidate profile (CANDIDATE only)
//
// Small, contract-consistent addition (documented in worklog): the binding
// contract exposes candidateProfile via /api/auth/me but has no dedicated
// update endpoint; the candidate Profile editor needs one.

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  const session = await requireAuth(req, ['CANDIDATE']);

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.sub },
  });
  if (!profile) throw new ApiError('NOT_FOUND', 'Candidate profile not found', 404);

  return ok(profile);
});

/** Optional text: accepts a string, null (clear the field) or undefined (leave unchanged). */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

const patchSchema = z
  .object({
    phone: optionalText(30),
    location: optionalText(120),
    headline: optionalText(160),
    summary: optionalText(2000),
    experienceYears: z.number().int().min(0).max(60).nullish(),
    currentCompany: optionalText(120),
    education: optionalText(300),
    linkedinUrl: optionalText(300),
    githubUrl: optionalText(300),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' });

const EDITABLE = [
  'phone',
  'location',
  'headline',
  'summary',
  'experienceYears',
  'currentCompany',
  'education',
  'linkedinUrl',
  'githubUrl',
] as const;

type EditableField = (typeof EDITABLE)[number];

/** Normalize '' → null for optional URL-ish fields; null stays null (clear). */
function normalizeValue(field: EditableField, value: unknown): unknown {
  if (value === null) return null;
  if ((field === 'linkedinUrl' || field === 'githubUrl') && value === '') return null;
  return value;
}

export const PATCH = handler(async (req) => {
  const session = await requireAuth(req, ['CANDIDATE']);
  const body = await parseBody(req, patchSchema);

  const existing = await db.candidateProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Candidate profile not found', 404);

  const data: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (body[field] !== undefined) {
      data[field] = normalizeValue(field, body[field]);
    }
  }

  const profile = await db.candidateProfile.update({
    where: { id: existing.id },
    data,
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'CANDIDATE_PROFILE_UPDATED',
    entityType: 'CandidateProfile',
    entityId: profile.id,
    details: { fields: Object.keys(data) },
    ip: clientIp(req),
  });

  return ok(profile);
});
