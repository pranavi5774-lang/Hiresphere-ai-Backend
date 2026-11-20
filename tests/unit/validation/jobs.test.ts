import { describe, expect, it } from 'vitest';
import { createSchema } from '@/app/api/jobs/route';

const validJob = {
  title: 'Software Engineer',
  description: 'Build and maintain reliable software applications for our customers.',
  location: 'Remote',
};

describe('job creation Zod schema', () => {
  it('accepts a valid payload and applies the endpoint defaults', () => {
    const parsed = createSchema.parse(validJob);

    expect(parsed).toMatchObject({
      title: 'Software Engineer',
      employmentType: 'FULL_TIME',
      experienceMin: 0,
      requiredSkills: [],
      preferredSkills: [],
      status: 'DRAFT',
    });
    expect(Object.values(parsed.evaluationWeights).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('rejects too-short descriptions, invalid employment types, and excessive skill lists', () => {
    expect(createSchema.safeParse({ ...validJob, description: 'Too short' }).success).toBe(false);
    expect(createSchema.safeParse({ ...validJob, employmentType: 'VOLUNTEER' }).success).toBe(false);
    expect(createSchema.safeParse({
      ...validJob,
      requiredSkills: Array.from({ length: 16 }, (_, index) => `Skill ${index}`),
    }).success).toBe(false);
  });

  it('rejects evaluation weights that are not a complete 100-point scale', () => {
    expect(createSchema.safeParse({
      ...validJob,
      evaluationWeights: { requiredSkills: 100 },
    }).success).toBe(false);
  });
});