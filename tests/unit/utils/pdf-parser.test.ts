import { describe, expect, it } from 'vitest';
import { PdfParseError, safeStoredName, validateResumeFile } from '@/lib/ai/pdf-parser';
import { RESUME_MAX_SIZE } from '@/lib/constants';

const validPdf = {
  fileName: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 8,
  buffer: Buffer.from('%PDF-1.7'),
};

describe('resume file validation', () => {
  it('accepts PDF files with the expected extension, MIME type, size, and magic bytes', () => {
    expect(() => validateResumeFile(validPdf)).not.toThrow();
  });

  it.each([
    [{ ...validPdf, fileName: 'resume.txt' }, 'INVALID_TYPE'],
    [{ ...validPdf, buffer: Buffer.from('not a pdf') }, 'CORRUPTED_PDF'],
    [{ ...validPdf, size: 0 }, 'EMPTY_FILE'],
    [{ ...validPdf, size: RESUME_MAX_SIZE + 1 }, 'FILE_TOO_LARGE'],
  ] as const)('rejects invalid resume file input with the corresponding code', (input, code) => {
    try {
      validateResumeFile(input);
      throw new Error('Expected file validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PdfParseError);
      expect((error as PdfParseError).code).toBe(code);
    }
  });

  it('generates a safe server-side filename without leaking path separators', () => {
    const storedName = safeStoredName('../../My Resume.PDF');
    expect(storedName).toMatch(/^\d+-[a-z0-9]+-[_a-z0-9.-]+\.pdf$/);
    expect(storedName).not.toContain('/');
    expect(storedName).not.toContain('\\');
  });
});