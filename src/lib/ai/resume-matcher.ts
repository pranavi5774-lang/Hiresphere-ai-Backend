// ============================================================
// HireSphere AI — Resume Matching Engine
// ============================================================
// Combines two explainable components:
//
//  1. tfidfScore  — TF-IDF cosine similarity between the full resume
//     text and the job posting text (title + description + skills).
//  2. skillScore  — required-skill overlap ratio:
//        skillScore = |required skills found in resume| / |required skills|
//     (null when the job defines no required skills)
//
//  finalScore = w1 * tfidfScore + w2 * skillScore
//  (default weights 0.6 / 0.4 — configurable via AI_WEIGHT_TFIDF,
//   AI_WEIGHT_SKILL; stored with every analysis for transparency)
//
// The score is a DECISION-SUPPORT SIGNAL for human reviewers.
// It is NOT a probability of hiring success, and the system never
// auto-rejects candidates based on it. Protected personal
// characteristics are never used in scoring.
// ============================================================

import { normalizeText, splitSentences, extractSection } from './text-preprocessing';
import { findSkillsInText, getSkill, type SkillHit } from './skill-dictionary';
import { buildTfidf, cosineSimilarity, topSharedTerms } from './tfidf';
import { AI_WEIGHT_SKILL, AI_WEIGHT_TFIDF, AI_ALGORITHM_VERSION } from '../constants';

export interface JobRequirements {
  title: string;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
}

export interface MatchResult {
  tfidfScore: number;
  skillScore: number | null;
  finalScore: number;
  weights: { tfidf: number; skill: number };
  matchedSkills: (SkillHit & { required: boolean })[];
  missingSkills: string[];
  extraSkills: string[];
  sharedTerms: string[];
  summary: string;
  algorithmVersion: string;
}

export class AnalysisError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Compose the canonical job-side text used for similarity. */
export function jobTextOf(job: JobRequirements): string {
  return normalizeText(
    [job.title, job.title, job.description, 'Required skills: ' + job.requiredSkills.join(', '), 'Preferred skills: ' + job.preferredSkills.join(', ')].join('\n')
  );
}

/** Run the full matching pipeline for one resume against one job. */
export function analyzeResume(resumeText: string, job: JobRequirements): MatchResult {
  const cleanResume = normalizeText(resumeText ?? '');
  if (!cleanResume || cleanResume.length < 40) {
    throw new AnalysisError('EMPTY_RESUME', 'Resume text is empty or too short to analyze');
  }
  if (normalizeText(job.description ?? '').length < 20) {
    throw new AnalysisError('MISSING_JOB_DESCRIPTION', 'Job posting has no description to compare against');
  }
  const cleanJob = jobTextOf(job);
  if (!cleanJob || cleanJob.length < 20) {
    throw new AnalysisError('MISSING_JOB_DESCRIPTION', 'Job posting has no description to compare against');
  }

  // ---- 1. TF-IDF cosine similarity (2-doc corpus for single pair) ----
  const model = buildTfidf([cleanJob, cleanResume]);
  const tfidfScore = cosineSimilarity(model.vectors[0], model.vectors[1]);

  // ---- 2. Skill overlap ----
  const sentences = splitSentences(cleanResume);
  const hits = findSkillsInText(cleanResume, sentences);
  const hitNames = new Set(hits.map((h) => h.skill.toLowerCase()));

  const required = job.requiredSkills.filter((s) => s.trim());
  const preferred = job.preferredSkills.filter((s) => s.trim());

  const matchedRequired: (SkillHit & { required: boolean })[] = [];
  const missingSkills: string[] = [];
  for (const req of required) {
    const hit = hits.find((h) => h.skill.toLowerCase() === req.toLowerCase());
    if (hit) matchedRequired.push({ ...hit, required: true });
    else missingSkills.push(req);
  }
  for (const pref of preferred) {
    if (!hitNames.has(pref.toLowerCase())) continue;
    if (!matchedRequired.some((m) => m.skill.toLowerCase() === pref.toLowerCase())) {
      const hit = hits.find((h) => h.skill.toLowerCase() === pref.toLowerCase());
      if (hit) matchedRequired.push({ ...hit, required: false });
    }
  }
  const extraSkills = hits
    .map((h) => h.skill)
    .filter((s) => !required.concat(preferred).some((r) => r.toLowerCase() === s.toLowerCase()));

  const skillScore = required.length > 0 ? matchedRequired.filter((m) => m.required).length / required.length : null;

  // ---- 3. Weighted final score ----
  let finalScore: number;
  if (skillScore === null) {
    finalScore = tfidfScore;
  } else {
    const wSum = AI_WEIGHT_TFIDF + AI_WEIGHT_SKILL || 1;
    finalScore = (AI_WEIGHT_TFIDF * tfidfScore + AI_WEIGHT_SKILL * skillScore) / wSum;
  }
  finalScore = Math.max(0, Math.min(1, finalScore));

  const sharedTerms = topSharedTerms(cleanJob, cleanResume, 8);

  // ---- 4. Plain-language explanation ----
  const parts: string[] = [
    `Text similarity (TF-IDF cosine): ${(tfidfScore * 100).toFixed(1)}%.`,
  ];
  if (skillScore !== null) {
    parts.push(`Required-skill overlap: ${matchedRequired.filter((m) => m.required).length}/${required.length} (${(skillScore * 100).toFixed(0)}%).`);
  }
  if (missingSkills.length > 0) parts.push(`Not evidenced in resume: ${missingSkills.join(', ')}.`);
  parts.push(
    `Final score ${(finalScore * 100).toFixed(1)}% = ${AI_WEIGHT_TFIDF}×TF-IDF${skillScore !== null ? ` + ${AI_WEIGHT_SKILL}×skill-overlap` : ''}.`
  );
  parts.push('This score is a decision-support signal for human review — not a hiring probability and never an automatic rejection.');

  return {
    tfidfScore,
    skillScore,
    finalScore,
    weights: { tfidf: AI_WEIGHT_TFIDF, skill: AI_WEIGHT_SKILL },
    matchedSkills: matchedRequired,
    missingSkills,
    extraSkills,
    sharedTerms,
    summary: parts.join(' '),
    algorithmVersion: AI_ALGORITHM_VERSION,
  };
}

// ------------------------------------------------------------
// Resume information extraction (structured, conservative)
// Fields that cannot be reliably found are returned as null —
// the engine never fabricates data.
// ------------------------------------------------------------

export interface ExtractedResumeInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  education: string | null;
  experienceSummary: string | null;
  experienceYears: number | null;
  certifications: string | null;
  projects: string | null;
  academicCourses: string | null;
  internshipExperience: string | null;
  workExperience: string | null;
  achievements: string | null;
  skills: string[];
  programmingLanguages: string[];
  frameworks: string[];
  technologies: string[];
  tools: string[];
  wordCount: number;
}

export function extractResumeInfo(rawText: string): ExtractedResumeInfo {
  const text = normalizeText(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const sentences = splitSentences(text);

  // Name: first short line near the top without digits/@
  let name: string | null = null;
  for (const line of lines.slice(0, 6)) {
    const clean = line.replace(/[|•,]/g, '').trim();
    if (clean.length >= 2 && clean.length <= 48 && !/\d|@|http|resume|curriculum/i.test(clean) && /^[A-Za-z][A-Za-z .'\-/&]+$/.test(clean)) {
      name = clean.split(/\s{2,}/)[0];
      break;
    }
  }

  const email = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? null;

  const phone = findPhone(text);

  const education = extractSection(text, ['education', 'academic background', 'academics', 'qualifications', 'educational qualifications']);

  const experienceSummary = extractSection(text, ['work experience', 'professional experience', 'experience', 'employment history', 'internships']);

  // Experience years: explicit "X years" mentions + year-range heuristics
  let experienceYears: number | null = null;
  const explicit = [...text.matchAll(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/gi)].map((m) => parseFloat(m[1]));
  if (explicit.length > 0) experienceYears = Math.min(40, Math.max(...explicit));
  if (experienceYears === null) {
    const currentYear = new Date().getFullYear();
    const ranges = [...text.matchAll(/(20\d{2})\s*[-–—to]+\s*(20\d{2}|present|current|till date|now)/gi)].map((m) => {
      const end = /present|current|till|now/i.test(m[2]) ? currentYear : parseInt(m[2]);
      return end - parseInt(m[1]);
    });
    if (ranges.length > 0) experienceYears = Math.min(40, Math.max(0, ranges.reduce((a, b) => a + b, 0)));
  }

  const certifications = extractSection(text, ['certifications', 'certificates', 'licenses']);
  const projects = extractSection(text, ['projects', 'academic projects', 'key projects', 'personal projects']);
  const academicCourses = extractSection(text, ['relevant coursework', 'coursework', 'academic courses']);
  const internshipExperience = extractSection(text, ['internships', 'internship experience', 'internship']);
  const workExperience = extractSection(text, ['work experience', 'professional experience', 'employment history']);
  const achievements = extractSection(text, ['achievements', 'accomplishments', 'awards', 'honors']);

  const skillHits = findSkillsInText(text, sentences);
  const skillsByCategory = (categories: string[]) => skillHits
    .filter((hit) => categories.includes(getSkill(hit.skill)?.category ?? ''))
    .map((hit) => hit.skill);

  return {
    name,
    email,
    phone,
    education,
    experienceSummary,
    experienceYears,
    certifications,
    projects,
    academicCourses,
    internshipExperience,
    workExperience,
    achievements,
    skills: skillHits.map((h) => h.skill),
    programmingLanguages: skillsByCategory(['LANGUAGE']),
    frameworks: skillsByCategory(['FRAMEWORK']),
    technologies: skillsByCategory(['DATABASE', 'CLOUD', 'CONCEPT']),
    tools: skillsByCategory(['TOOL']),
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Phone extraction heuristic (explainable):
 *  1. prefer lines mentioning phone/mobile/contact/tel
 *  2. then international "+CC ..." numbers
 *  3. then bare 10–13 digit sequences
 * Candidates whose digits start with a 4-digit year pattern
 * (19xx/20xx) are rejected to avoid date-range false positives.
 */
function findPhone(text: string): string | null {
  const digitsOf = (s: string) => s.replace(/\D/g, '');
  const plausible = (s: string) => {
    const d = digitsOf(s);
    if (d.length < 10 || d.length > 13) return false;
    if (/^(19|20)\d{2}\d/.test(d)) return false; // year-range artifact
    return true;
  };

  const kwLine = text.split('\n').find((l) => /phone|mobile|contact|tel/i.test(l) && /\d{5,}/.test(digitsOf(l)));
  if (kwLine) {
    const m = kwLine.match(/\+?\d[\d\s.\-()]{7,17}\d/);
    if (m && plausible(m[0])) return m[0].trim();
  }
  const matches = text.match(/\+?\d[\d\s.\-()]{7,17}\d/g) ?? [];
  for (const c of matches) {
    if (c.startsWith('+') && plausible(c)) return c.trim();
  }
  for (const c of matches) {
    if (plausible(c)) return c.trim();
  }
  return null;
}
