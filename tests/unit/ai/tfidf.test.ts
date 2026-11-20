import { describe, expect, it } from 'vitest';
import { buildTfidf, cosineSimilarity, rankResumesAgainstJob, topSharedTerms } from '@/lib/ai/tfidf';

describe('TF-IDF matching', () => {
  it('builds document frequencies and normalized vectors from a deterministic corpus', () => {
    const model = buildTfidf(['alpha alpha beta', 'alpha gamma']);

    expect(model.docCount).toBe(2);
    expect(model.vocabulary.get('alpha')).toBe(2);
    expect(model.vocabulary.get('beta')).toBe(1);
    expect([...model.vectors[0].values()].reduce((sum, value) => sum + value ** 2, 0)).toBeCloseTo(1);
  });

  it('returns bounded cosine similarity for identical, disjoint, and empty vectors', () => {
    const model = buildTfidf(['alpha beta', 'alpha beta', 'gamma']);

    expect(cosineSimilarity(model.vectors[0], model.vectors[1])).toBeCloseTo(1);
    expect(cosineSimilarity(model.vectors[0], model.vectors[2])).toBe(0);
    expect(cosineSimilarity(new Map(), model.vectors[0])).toBe(0);
  });

  it('ranks matching resumes ahead of unrelated resumes and handles a blank job', () => {
    const scores = rankResumesAgainstJob(
      'Python data analysis with pandas machine learning',
      ['Python pandas data analysis and machine learning', 'Carpentry and woodworking projects'],
    );

    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(rankResumesAgainstJob('   ', ['resume text'])).toEqual([0]);
  });

  it('returns shared terms in descending contribution order', () => {
    expect(topSharedTerms('python python data analysis', 'python data analysis python', 2))
      .toEqual(['python', 'data']);
  });
});