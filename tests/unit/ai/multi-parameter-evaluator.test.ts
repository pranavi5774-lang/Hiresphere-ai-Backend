import { describe, expect, it } from 'vitest';
import {
  evaluateResume,
  parseEvaluationWeights,
  parseMatchThresholds,
} from '@/lib/ai/multi-parameter-evaluator';
import { DEFAULT_EVALUATION_WEIGHTS } from '@/lib/constants';

const job = {
  title: 'Software Engineer',
  description: 'Build software for internal business applications.',
  requiredSkills: [],
  preferredSkills: [],
  experienceMin: 5,
};

const experienceOnlyWeights = {
  requiredSkills: 0,
  education: 0,
  projects: 0,
  experience: 100,
  technicalKnowledge: 0,
  certifications: 0,
  keywordMatch: 0,
  domainKnowledge: 0,
  tools: 0,
  problemSolving: 0,
  achievements: 0,
  resumeClarity: 0,
};

describe('multi-parameter resume evaluation', () => {
  it('parses valid weights and thresholds and rejects invalid stored values', () => {
    expect(parseEvaluationWeights(null)).toEqual(DEFAULT_EVALUATION_WEIGHTS);
    expect(parseMatchThresholds(null)).toEqual({ strong: 80, potential: 65, moderate: 50 });
    expect(() => parseEvaluationWeights('{"experience":100}')).toThrow(/invalid|total/i);
    expect(() => parseMatchThresholds('{"strong":60,"potential":70,"moderate":50}'))
      .toThrow(/thresholds are invalid/i);
  });

  it('computes a deterministic score and applies inclusive classification thresholds', () => {
    const resume = '4 years of experience building and maintaining software applications.';
    const result = evaluateResume(resume, job, experienceOnlyWeights);

    expect(result.overallScore).toBe(80);
    expect(result.recommendation).toBe('STRONG_MATCH');
    expect(evaluateResume(resume, job, experienceOnlyWeights, {
      strong: 81,
      potential: 80,
      moderate: 50,
    }).recommendation).toBe('POTENTIAL_MATCH');
    expect(evaluateResume(resume, job, experienceOnlyWeights, {
      strong: 82,
      potential: 81,
      moderate: 80,
    }).recommendation).toBe('MODERATE_MATCH');
  });

  it('rejects short resume text and parameter weights that do not total 100', () => {
    expect(() => evaluateResume('short', job)).toThrow(/too short/i);
    expect(() => evaluateResume(
      'A sufficiently long resume describing work experience and software projects.',
      job,
      { ...experienceOnlyWeights, experience: 90 },
    )).toThrow(/total exactly 100/i);
  });
});