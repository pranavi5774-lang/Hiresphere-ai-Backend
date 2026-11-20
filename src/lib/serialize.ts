// ============================================================
// HireSphere AI — Serialization helpers
// SQLite/Prisma stores JSON columns as strings. These helpers
// safely parse them into rich objects for API responses.
// ============================================================

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed === null || parsed === undefined ? fallback : parsed) as T;
  } catch {
    return fallback;
  }
}

export interface AnalysisRow {
  id: string;
  applicationId: string;
  tfidfScore: number;
  skillScore: number | null;
  finalScore: number;
  weights: string;
  matchedSkills: string;
  missingSkills: string;
  extraSkills: string | null;
  extractedInfo: string | null;
  parameterScores: string;
  parameterWeights: string;
  strengths: string;
  skillGaps: string;
  recommendation: string;
  detailedExplanation: string | null;
  summary: string | null;
  algorithmVersion: string;
  createdAt: Date;
}

/** Parse all JSON-string columns of a ResumeAnalysis row. */
export function serializeAnalysis(row: AnalysisRow | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.applicationId,
    tfidfScore: row.tfidfScore,
    skillScore: row.skillScore,
    finalScore: row.finalScore,
    weights: parseJson<{ tfidf: number; skill: number }>(row.weights, { tfidf: 0.6, skill: 0.4 }),
    matchedSkills: parseJson<{ skill: string; alias?: string; evidence?: string; required?: boolean }[]>(row.matchedSkills, []),
    missingSkills: parseJson<string[]>(row.missingSkills, []),
    extraSkills: parseJson<string[]>(row.extraSkills, []),
    extractedInfo: parseJson<Record<string, unknown> | null>(row.extractedInfo, null),
    parameterScores: parseJson<{
      key: string;
      name: string;
      score: number;
      weight: number;
      contribution: number;
      explanation: string;
      evidence: string[];
      gaps: string[];
    }[]>(row.parameterScores, []),
    parameterWeights: parseJson<Record<string, number>>(row.parameterWeights, {}),
    strengths: parseJson<string[]>(row.strengths, []),
    skillGaps: parseJson<string[]>(row.skillGaps, []),
    recommendation: row.recommendation,
    detailedExplanation: row.detailedExplanation,
    summary: row.summary,
    algorithmVersion: row.algorithmVersion,
    createdAt: row.createdAt,
  };
}

export type SerializedAnalysis = NonNullable<ReturnType<typeof serializeAnalysis>>;

/** Parse a Resume.parsedData JSON column. */
export function serializeParsedData(raw: string | null | undefined): Record<string, unknown> | null {
  return parseJson<Record<string, unknown> | null>(raw, null);
}

/** Parse a Job's skill JSON columns. */
export function serializeJobSkills(job: { requiredSkills: string; preferredSkills: string }) {
  return {
    requiredSkills: parseJson<string[]>(job.requiredSkills, []),
    preferredSkills: parseJson<string[]>(job.preferredSkills, []),
  };
}

export function serializeJobEvaluation(job: { evaluationWeights: string; matchThresholds: string }) {
  return {
    evaluationWeights: parseJson<Record<string, number>>(job.evaluationWeights, {
      requiredSkills: 20,
      education: 10,
      projects: 10,
      experience: 10,
      technicalKnowledge: 10,
      certifications: 5,
      keywordMatch: 10,
      domainKnowledge: 5,
      tools: 5,
      problemSolving: 5,
      achievements: 5,
      resumeClarity: 5,
    }),
    matchThresholds: parseJson<{ strong: number; potential: number; moderate: number }>(job.matchThresholds, {
      strong: 80,
      potential: 65,
      moderate: 50,
    }),
  };
}
