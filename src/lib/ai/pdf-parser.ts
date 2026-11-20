// ============================================================
// HireSphere AI — PDF Resume Parsing
// ============================================================
// Server-side PDF validation + text extraction via unpdf
// (pdf.js serverless build). Handles corrupted, encrypted and
// image-only PDFs with explicit, meaningful errors — never
// silently fabricates content.
// ============================================================

import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import { RESUME_MAX_SIZE, RESUME_MIME_TYPES } from '../constants';

export class PdfParseError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface PdfValidationInput {
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

/** Validate an uploaded resume file (type, size, magic bytes). */
export function validateResumeFile(input: PdfValidationInput): void {
  const ext = input.fileName.toLowerCase().split('.').pop();
  if (ext !== 'pdf' && ext !== 'docx') {
    throw new PdfParseError('INVALID_TYPE', 'Only PDF and DOCX resumes are accepted');
  }
  if (input.mimeType && !RESUME_MIME_TYPES.includes(input.mimeType)) {
    throw new PdfParseError('INVALID_TYPE', 'Only PDF and DOCX resumes are accepted');
  }
  if (input.size <= 0) throw new PdfParseError('EMPTY_FILE', 'The uploaded file is empty');
  if (input.size > RESUME_MAX_SIZE) {
    throw new PdfParseError('FILE_TOO_LARGE', `File exceeds the ${RESUME_MAX_SIZE / (1024 * 1024)} MB limit`);
  }
  const header = input.buffer.subarray(0, 5).toString('latin1');
  if (ext === 'pdf' && header !== '%PDF-') {
    throw new PdfParseError('CORRUPTED_PDF', 'This file is not a valid PDF document');
  }
  if (ext === 'docx' && !(header.startsWith('PK') && input.buffer.includes(Buffer.from('[Content_Types].xml')))) {
    throw new PdfParseError('CORRUPTED_DOCX', 'This file is not a valid DOCX document');
  }
}

export interface PdfExtractResult {
  text: string;
  pageCount: number;
}

/** Extract text from a validated PDF buffer. */
export async function extractResumeText(buffer: Buffer): Promise<PdfExtractResult> {
  let data: Uint8Array;
  try {
    data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const pages = Array.isArray(text) ? text.join('\n') : text;
    const cleaned = pages.replace(/\u0000/g, '').trim();
    if (!cleaned || cleaned.replace(/\s+/g, '').length < 20) {
      throw new PdfParseError(
        'NO_EXTRACTABLE_TEXT',
        'No readable text found — the PDF may be image-only/scanned or password-protected'
      );
    }
    if (totalPages > 20) {
      throw new PdfParseError('TOO_MANY_PAGES', 'Resume PDFs are limited to 20 pages');
    }
    return { text: cleaned, pageCount: totalPages };
  } catch (err) {
    if (err instanceof PdfParseError) throw err;
    const msg = err instanceof Error ? err.message : 'unknown error';
    if (/password|encrypt/i.test(msg)) {
      throw new PdfParseError('ENCRYPTED_PDF', 'Password-protected PDFs cannot be processed');
    }
    throw new PdfParseError('EXTRACTION_FAILED', 'Failed to extract text from this PDF');
  }
}

export async function extractDocxResumeText(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const cleaned = result.value.replace(/\u0000/g, '').trim();
    if (!cleaned || cleaned.replace(/\s+/g, '').length < 20) {
      throw new PdfParseError('NO_EXTRACTABLE_TEXT', 'No readable text found in this DOCX document');
    }
    return { text: cleaned, pageCount: 0 };
  } catch (err) {
    if (err instanceof PdfParseError) throw err;
    throw new PdfParseError('EXTRACTION_FAILED', 'Failed to extract text from this DOCX document');
  }
}

/** Generate a safe, collision-free server-side filename. */
export function safeStoredName(originalName: string): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const base = originalName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '_')
    .replace(/\.(pdf|docx)$/i, '')
    .slice(0, 60);
  return `${stamp}-${rand}-${base || 'resume'}.${originalName.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'}`;
}
