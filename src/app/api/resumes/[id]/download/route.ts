// GET /api/resumes/[id]/download — stream the stored PDF (owner candidate or HR/ADMIN)

export const dynamic = 'force-dynamic';

import fsp from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { handler, requireAuth, ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import { resumeFilePath } from '@/lib/storage';

function safeFileName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9._\- ]/g, '_').trim() || 'resume.pdf';
  return /\.(pdf|docx)$/i.test(clean) ? clean : `${clean}.pdf`;
}

export const GET = handler(async (req, ctx) => {
  const session = await requireAuth(req);
  const { id } = await ctx.params;

  const resume = await db.resume.findUnique({
    where: { id },
    include: { candidate: { select: { userId: true } } },
  });
  if (!resume) throw new ApiError('RESUME_NOT_FOUND', 'Resume not found', 404);

  const isStaff = session.role === 'HR' || session.role === 'ADMIN';
  if (!isStaff && resume.candidate.userId !== session.sub) {
    throw new ApiError('FORBIDDEN', 'You can only download your own resumes', 403);
  }

  let buffer: Buffer;
  try {
    buffer = await fsp.readFile(resumeFilePath(resume.storedName));
  } catch {
    throw new ApiError('RESUME_FILE_MISSING', 'The stored resume file is no longer available', 404);
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': resume.mimeType,
      'Content-Disposition': `attachment; filename="${safeFileName(resume.fileName)}"`,
      'Content-Length': String(buffer.length),
    },
  });
});
