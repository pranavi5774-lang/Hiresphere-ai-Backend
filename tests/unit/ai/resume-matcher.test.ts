import { describe, expect, it } from 'vitest';
import { AnalysisError, analyzeResume, extractResumeInfo } from '@/lib/ai/resume-matcher';
import { SAMPLE_RESUME_TEXT } from '../../fixtures/resumes';

const job = {
  title: 'Full-stack developer',
  description: 'Build reliable web applications and data services.',
  requiredSkills: ['React', 'Python'],
  preferredSkills: ['Docker'],
};

describe('resume matcher', () => {
  it('extracts resume identity, sections, contact data, skills, and experience', () => {
    const extracted = extractResumeInfo(SAMPLE_RESUME_TEXT);

    expect(extracted).toMatchObject({
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      phone: '+91 98765 43210',
      experienceYears: 4,
    });
    expect(extracted.education).toContain('BSc Computer Science');
    expect(extracted.skills).toEqual(expect.arrayContaining(['React', 'Python', 'Docker']));
    expect(extracted.wordCount).toBeGreaterThan(10);
  });

  it('uses evidenced required skills and computes the weighted score from its components', () => {
    const result = analyzeResume(SAMPLE_RESUME_TEXT, job);
    const expected = (
      result.weights.tfidf * result.tfidfScore +
      result.weights.skill * (result.skillScore ?? 0)
    ) / (result.weights.tfidf + result.weights.skill);

    expect(result.skillScore).toBe(1);
    expect(result.missingSkills).toEqual([]);
    expect(result.matchedSkills.map((hit) => [hit.skill, hit.required])).toEqual([
      ['React', true],
      ['Python', true],
      ['Docker', false],
    ]);
    expect(result.finalScore).toBeCloseTo(expected);
    expect(result.summary).toContain('decision-support signal');
  });

  it('uses text similarity alone when no required skills are defined', () => {
    const result = analyzeResume(SAMPLE_RESUME_TEXT, { ...job, requiredSkills: [] });
    expect(result.skillScore).toBeNull();
    expect(result.finalScore).toBe(result.tfidfScore);
  });

  it('rejects short resumes and jobs without a usable description', () => {
    expect(() => analyzeResume('Too short', job)).toThrowError(AnalysisError);
    expect(() => analyzeResume(SAMPLE_RESUME_TEXT, { ...job, description: '' }))
      .toThrowError('Job posting has no description to compare against');
  });
});