// ============================================================
// HireSphere AI — TF-IDF Vectorizer & Cosine Similarity
// ============================================================
// A faithful re-implementation of the classic TF-IDF model used by
// scikit-learn's TfidfVectorizer (smooth idf + L2 normalization):
//
//   tf(t, d)        = count(t, d)                    (raw count)
//   idf(t)          = ln((1 + N) / (1 + df(t))) + 1  (smooth)
//   weight(t, d)    = tf * idf
//   vector(d)       = weight / ||weight||₂           (L2 norm)
//   cosine(a, b)    = a · b                          (vectors pre-normalized)
//
// The result is a TEXT SIMILARITY SCORE in [0, 1]. It is a
// decision-support signal for HR — NOT a probability of hiring
// success and never an automatic rejection.
// ============================================================

import { tokenize } from './text-preprocessing';

export interface TfidfModel {
  vectors: Map<string, number>[]; // L2-normalized sparse vectors
  vocabulary: Map<string, number>; // term -> df count
  docCount: number;
}

/** Build TF-IDF vectors for a corpus of documents. */
export function buildTfidf(documents: string[]): TfidfModel {
  const tokenLists = documents.map((doc) => tokenize(doc));

  // document frequency
  const df = new Map<string, number>();
  for (const tokens of tokenLists) {
    const seen = new Set(tokens);
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const N = documents.length || 1;
  const vectors: Map<string, number>[] = tokenLists.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, freq] of tf) {
      const idf = Math.log((1 + N) / (1 + (df.get(term) ?? 0))) + 1;
      const w = freq * idf;
      vec.set(term, w);
      norm += w * w;
    }
    // L2 normalize
    const mag = Math.sqrt(norm);
    if (mag > 0) {
      for (const [term, w] of vec) vec.set(term, w / mag);
    }
    return vec;
  });

  return { vectors, vocabulary: df, docCount: N };
}

/** Cosine similarity of two pre-normalized vectors (dot product). */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const other = large.get(term);
    if (other) dot += w * other;
  }
  return Math.max(0, Math.min(1, dot)); // clamped to [0,1]
}

/**
 * Pairwise similarity: builds a corpus over [jobText, ...resumeTexts]
 * so IDF statistics reflect the candidate pool (more robust than a
 * 2-document corpus), then returns similarity of each resume to the job.
 */
export function rankResumesAgainstJob(jobText: string, resumeTexts: string[]): number[] {
  if (!jobText.trim()) return resumeTexts.map(() => 0);
  const corpus = [jobText, ...resumeTexts.map((t) => (t.trim() ? t : '∅'))];
  const model = buildTfidf(corpus);
  const jobVec = model.vectors[0];
  return resumeTexts.map((_, i) => cosineSimilarity(jobVec, model.vectors[i + 1]));
}

/** Top contributing shared terms between two texts (explainability aid). */
export function topSharedTerms(jobText: string, resumeText: string, limit = 8): string[] {
  const model = buildTfidf([jobText, resumeText]);
  const jobVec = model.vectors[0];
  const resVec = model.vectors[1];
  const shared: { term: string; w: number }[] = [];
  for (const [term, w] of jobVec) {
    const other = resVec.get(term);
    if (other) shared.push({ term, w: w * other });
  }
  return shared
    .sort((a, b) => b.w - a.w)
    .slice(0, limit)
    .map((s) => s.term);
}
