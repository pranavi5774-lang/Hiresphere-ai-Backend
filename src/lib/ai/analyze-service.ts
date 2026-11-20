// ============================================================
// HireSphere AI — Analysis service
// Single entry point that runs the full AI pipeline for one
// application: loads resume text + job, runs analyzeResume,
// upserts ResumeAnalysis and snapshots the scores onto the
// Application row. Used by POST /api/applications (synchronous,
// errors swallowed) and POST /api/ai/analyze/[applicationId]
// (errors surfaced as ANALYSIS_FAILED).
// ============================================================

import { db } from '@/lib/db';
import { analyzeResume, extractResumeInfo, AnalysisError } from './resume-matcher';
import {
  evaluateResume,
  parseEvaluationWeights,
  parseMatchThresholds,
} from './multi-parameter-evaluator';
import { parseJson } from '@/lib/serialize';

export interface RunAnalysisResult {
  analysis: {
    applicationId: string;
    tfidfScore: number;
    skillScore: number | null;
    finalScore: number;
    weights: { tfidf: number; skill: number };
    parameterWeights: Record<string, number>;
    parameterScores: ReturnType<typeof evaluateResume>['parameters'];
    strengths: string[];
    skillGaps: string[];
    recommendation: ReturnType<typeof evaluateResume>['recommendation'];
    detailedExplanation: string;
    matchedSkills: unknown[];
    missingSkills: string[];
    extraSkills: string[];
    summary: string | null;
    algorithmVersion: string;
  };
}

/**
 * Run the AI matching pipeline for an application.
 * Throws AnalysisError (subclasses Error) on any failure:
 *  - ANALYSIS_NOT_FOUND   — application does not exist
 *  - ANALYSIS_FAILED      — resume text unavailable / pipeline error
 *  - EMPTY_RESUME / MISSING_JOB_DESCRIPTION — re-thrown from matcher
 */
export async function runAnalysisForApplication(applicationId: string): Promise<RunAnalysisResult> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { resume: true, job: { include: { department: { select: { name: true } } } } },
  });
  if (!application) {
    throw new AnalysisError('ANALYSIS_NOT_FOUND', 'Application not found');
  }

  const resumeText = application.resume?.extractedText ?? '';
  if (!resumeText || application.resume.parseStatus !== 'SUCCESS') {
    throw new AnalysisError(
      'ANALYSIS_FAILED',
      'Resume text is not available for analysis — the resume could not be parsed or is empty'
    );
  }

  let requiredSkills = parseJson<string[]>(application.job.requiredSkills, []);
  let preferredSkills = parseJson<string[]>(application.job.preferredSkills, []);
  if (!Array.isArray(requiredSkills)) requiredSkills = [];
  if (!Array.isArray(preferredSkills)) preferredSkills = [];

  const result = analyzeResume(resumeText, {
    title: application.job.title,
    description: application.job.description,
    requiredSkills,
    preferredSkills,
  });
  const extractedInfo = extractResumeInfo(resumeText);
  const parameterWeights = parseEvaluationWeights(application.job.evaluationWeights);
  const thresholds = parseMatchThresholds(application.job.matchThresholds);
  const evaluation = evaluateResume(resumeText, {
    title: application.job.title,
    description: application.job.description,
    requiredSkills,
    preferredSkills,
    educationReq: application.job.educationReq,
    experienceMin: application.job.experienceMin,
    departmentName: application.job.department?.name,
  }, parameterWeights, thresholds);

  const data = {
    tfidfScore: result.tfidfScore,
    skillScore: result.skillScore,
    finalScore: evaluation.overallScore / 100,
    weights: JSON.stringify(result.weights),
    parameterWeights: JSON.stringify(parameterWeights),
    parameterScores: JSON.stringify(evaluation.parameters),
    strengths: JSON.stringify(evaluation.strengths),
    skillGaps: JSON.stringify(evaluation.skillGaps),
    recommendation: evaluation.recommendation,
    detailedExplanation: evaluation.explanation,
    matchedSkills: JSON.stringify(result.matchedSkills),
    missingSkills: JSON.stringify(result.missingSkills),
    extraSkills: JSON.stringify(result.extraSkills),
    extractedInfo: JSON.stringify(extractedInfo),
    summary: evaluation.explanation,
    algorithmVersion: result.algorithmVersion,
  };

  await db.$transaction(async (tx) => {
    await tx.resumeAnalysis.upsert({
      where: { applicationId },
      create: { applicationId, ...data },
      update: data,
    });
    await tx.evaluationHistory.create({
      data: {
        applicationId,
        finalScore: evaluation.overallScore / 100,
        parameterScores: JSON.stringify(evaluation.parameters),
        weights: JSON.stringify(parameterWeights),
        recommendation: evaluation.recommendation,
        algorithmVersion: result.algorithmVersion,
      },
    });
    await tx.application.update({
      where: { id: applicationId },
      data: {
        matchScore: evaluation.overallScore / 100,
        tfidfScore: result.tfidfScore,
        skillScore: result.skillScore,
      },
    });

    // ── Update structured Evaluation, ParameterScore, Recommendation & Ranking ──
    const evalRecord = await tx.evaluation.upsert({
      where: { applicationId },
      create: {
        applicationId,
        overallScore: evaluation.overallScore,
        classification: evaluation.recommendation,
        recommendation: evaluation.recommendation,
        explanation: evaluation.explanation,
        strengths: JSON.stringify(evaluation.strengths),
        skillGaps: JSON.stringify(evaluation.skillGaps),
        missingRequirements: JSON.stringify(evaluation.parameters.flatMap((p) => p.gaps)),
      },
      update: {
        overallScore: evaluation.overallScore,
        classification: evaluation.recommendation,
        recommendation: evaluation.recommendation,
        explanation: evaluation.explanation,
        strengths: JSON.stringify(evaluation.strengths),
        skillGaps: JSON.stringify(evaluation.skillGaps),
        missingRequirements: JSON.stringify(evaluation.parameters.flatMap((p) => p.gaps)),
      },
    });

    // Delete existing parameter scores for this evaluation and insert fresh ones
    await tx.parameterScore.deleteMany({ where: { evaluationId: evalRecord.id } });
    await tx.parameterScore.createMany({
      data: evaluation.parameters.map((p) => ({
        evaluationId: evalRecord.id,
        parameterKey: p.key,
        parameterName: p.name,
        score: p.score,
        weight: p.weight,
        contribution: p.contribution,
        explanation: p.explanation,
        evidence: JSON.stringify(p.evidence),
        gaps: JSON.stringify(p.gaps),
      })),
    });

    // Upsert shortlisting recommendation
    await tx.shortlistingRecommendation.upsert({
      where: { evaluationId: evalRecord.id },
      create: {
        evaluationId: evalRecord.id,
        recommendation: evaluation.recommendation,
        confidenceScore: 1.0,
        reasons: JSON.stringify(evaluation.strengths),
        summary: evaluation.explanation,
      },
      update: {
        recommendation: evaluation.recommendation,
        confidenceScore: 1.0,
        reasons: JSON.stringify(evaluation.strengths),
        summary: evaluation.explanation,
      },
    });

    // Upsert candidate ranking entry
    await tx.candidateRanking.upsert({
      where: { applicationId },
      create: {
        jobId: application.jobId,
        applicationId,
        evaluationId: evalRecord.id,
        score: evaluation.overallScore,
        classification: evaluation.recommendation,
        rank: 0,
      },
      update: {
        score: evaluation.overallScore,
        classification: evaluation.recommendation,
        evaluationId: evalRecord.id,
      },
    });

    // Recalculate ranks for this job
    const allRankings = await tx.candidateRanking.findMany({
      where: { jobId: application.jobId },
      orderBy: { score: 'desc' },
    });
    for (let i = 0; i < allRankings.length; i++) {
      await tx.candidateRanking.update({
        where: { id: allRankings[i].id },
        data: { rank: i + 1 },
      });
    }
  });

  return {
    analysis: {
      applicationId,
      tfidfScore: result.tfidfScore,
      skillScore: result.skillScore,
      finalScore: evaluation.overallScore / 100,
      weights: result.weights,
      parameterWeights,
      parameterScores: evaluation.parameters,
      strengths: evaluation.strengths,
      skillGaps: evaluation.skillGaps,
      recommendation: evaluation.recommendation,
      detailedExplanation: evaluation.explanation,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      extraSkills: result.extraSkills,
      summary: evaluation.explanation,
      algorithmVersion: result.algorithmVersion,
    },
  };
}
