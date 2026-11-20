// POST /api/resumes/upload — candidate uploads a PDF resume (multipart/form-data)
//
// NOTE: this dedicated route is REQUIRED. Without it, POST /api/resumes/upload
// falls into the /api/resumes/[id] dynamic segment (id="upload") which only
// exports GET, producing a confusing 405 Method Not Allowed.
//
// Flow:
//   1. requireAuth(CANDIDATE) + rate limit
//   2. validate file (extension, MIME, size, %PDF- magic bytes) — BEFORE persisting
//   3. write PDF to uploads/resumes (OUTSIDE public/, served only via authorized API)
//   4. persist Resume (newest becomes the single active resume)
//   5. synchronous AI parse (text extraction + info extraction) — a parse
//      failure keeps the upload (parseStatus FAILED) but never fabricates data
//   6. respond with the same shape as GET /api/resumes/[id] (ResumeDetail)

export const dynamic = 'force-dynamic';

import fs from 'fs/promises';
import { createHash } from 'crypto';
import { ok, handler, requireAuth, rateLimit, logAudit, clientIp, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { UPLOAD_DIR, resumeFilePath } from '@/lib/storage';
import { serializeParsedData } from '@/lib/serialize';
import {
  validateResumeFile,
  extractResumeText,
  extractDocxResumeText,
  safeStoredName,
  PdfParseError,
} from '@/lib/ai/pdf-parser';
import { extractResumeInfo } from '@/lib/ai/resume-matcher';

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_TYPE: 415,
  EMPTY_FILE: 400,
  FILE_TOO_LARGE: 413,
  CORRUPTED_PDF: 400,
  CORRUPTED_DOCX: 400,
  ENCRYPTED_PDF: 400,
  NO_EXTRACTABLE_TEXT: 422,
  TOO_MANY_PAGES: 422,
  EXTRACTION_FAILED: 422,
};

export const POST = handler(async (req) => {
  rateLimit(req, 'resume-upload', 20, 10 * 60 * 1000);
  const session = await requireAuth(req, ['CANDIDATE']);

  // ---- 1. multipart body ----
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError('INVALID_FORM', 'Expected multipart/form-data with a "file" field', 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    throw new ApiError('NO_FILE', 'Attach your resume PDF in the "file" field', 400);
  }
  if (!(file instanceof File)) {
    throw new ApiError('INVALID_FILE', 'The uploaded file could not be read', 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ---- 2. validate BEFORE touching disk or DB ----
  try {
    validateResumeFile({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      buffer,
    });
  } catch (err) {
    if (err instanceof PdfParseError) {
      throw new ApiError(err.code, err.message, STATUS_BY_CODE[err.code] ?? 400);
    }
    throw err;
  }

  // ---- 3. candidate profile (register creates it; defensive fallback) ----
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true, phone: true, education: true, experienceYears: true },
  });
  if (!profile) throw new ApiError('CANDIDATE_PROFILE_MISSING', 'No candidate profile is linked to this account', 400);
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const duplicate = await db.resume.findFirst({
    where: { candidateId: profile.id, contentHash },
    select: { id: true },
  });
  if (duplicate) throw new ApiError('DUPLICATE_RESUME', 'This resume has already been uploaded to your profile', 409);

  // ---- 4. store file outside public/ ----
  const storedName = safeStoredName(file.name);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(resumeFilePath(storedName), buffer);

  // ---- 5. persist; newest resume becomes the active one ----
  const resume = await db.$transaction(async (tx) => {
    await tx.resume.updateMany({
      where: { candidateId: profile.id, isActive: true },
      data: { isActive: false },
    });
    return tx.resume.create({
      data: {
        candidateId: profile.id,
        fileName: file.name,
        storedName,
        filePath: resumeFilePath(storedName),
        fileSize: file.size,
        mimeType: file.type || (file.name.toLowerCase().endsWith('.docx')
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf'),
        contentHash,
        parseStatus: 'PENDING',
        isActive: true,
      },
    });
  });

  // ---- 6. synchronous AI parse (never blocks the upload result) ----
  let finalResume = resume;
  try {
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const { text } = isDocx ? await extractDocxResumeText(buffer) : await extractResumeText(buffer);
    const info = extractResumeInfo(text);
    finalResume = await db.resume.update({
      where: { id: resume.id },
      data: {
        extractedText: text,
        parseStatus: 'SUCCESS',
        parseError: null,
        parsedData: JSON.stringify(info),
      },
    });
    const profileData: { phone?: string; education?: string; experienceYears?: number } = {};
    if (!profile.phone && info.phone) profileData.phone = info.phone;
    if (!profile.education && info.education) profileData.education = info.education.slice(0, 300);
    if (profile.experienceYears === 0 && info.experienceYears !== null) profileData.experienceYears = Math.floor(info.experienceYears);
    if (Object.keys(profileData).length) {
      await db.candidateProfile.update({ where: { id: profile.id }, data: profileData });
    }
  } catch (err) {
    const message =
      err instanceof PdfParseError
        ? err.message
        : 'Automatic parsing failed — the file is stored and you can still apply with it.';
    finalResume = await db.resume.update({
      where: { id: resume.id },
      data: { parseStatus: 'FAILED', parseError: message },
    });
    console.error('[RESUME] Parse failed for', resume.id, err instanceof Error ? err.message : err);
  }

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'RESUME_UPLOADED',
    entityType: 'RESUME',
    entityId: resume.id,
    details: { fileName: file.name, fileSize: file.size, parseStatus: finalResume.parseStatus },
    ip: clientIp(req),
  });

  return ok(
    {
      id: finalResume.id,
      fileName: finalResume.fileName,
      fileSize: finalResume.fileSize,
      mimeType: finalResume.mimeType,
      parseStatus: finalResume.parseStatus,
      parseError: finalResume.parseError,
      isActive: finalResume.isActive,
      uploadedAt: finalResume.uploadedAt,
      extractedText: finalResume.extractedText,
      parsedData: serializeParsedData(finalResume.parsedData),
    },
    201
  );
});
