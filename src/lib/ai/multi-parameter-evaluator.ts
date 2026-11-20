import { DEFAULT_EVALUATION_WEIGHTS, DEFAULT_MATCH_THRESHOLDS } from '../constants';
import { findSkillsInText, SKILL_DICTIONARY, type SkillHit } from './skill-dictionary';
import { extractSection, normalizeText, splitSentences } from './text-preprocessing';

export type EvaluationWeights = Record<keyof typeof DEFAULT_EVALUATION_WEIGHTS, number>;
export type MatchThresholds = { strong: number; potential: number; moderate: number };

export interface EvaluationParameterScore {
  key: keyof EvaluationWeights;
  name: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
  evidence: string[];
  gaps: string[];
}

export interface MultiParameterEvaluation {
  overallScore: number;
  recommendation: 'STRONG_MATCH' | 'POTENTIAL_MATCH' | 'MODERATE_MATCH' | 'LOW_MATCH';
  parameters: EvaluationParameterScore[];
  strengths: string[];
  skillGaps: string[];
  explanation: string;
}

export interface EvaluationJob {
  title: string;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  educationReq?: string | null;
  experienceMin?: number;
  departmentName?: string | null;
}

export function parseEvaluationWeights(raw: string | null | undefined): EvaluationWeights {
  const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : DEFAULT_EVALUATION_WEIGHTS;
  const keys = Object.keys(DEFAULT_EVALUATION_WEIGHTS) as (keyof EvaluationWeights)[];
  if (Object.keys(parsed).length !== keys.length || keys.some((key) => !Number.isInteger(parsed[key]) || Number(parsed[key]) < 0)) {
    throw new Error('Stored evaluation weights are invalid');
  }
  const weights = parsed as EvaluationWeights;
  if (keys.reduce((sum, key) => sum + weights[key], 0) !== 100) {
    throw new Error('Stored evaluation weights must total exactly 100');
  }
  return weights;
}

export function parseMatchThresholds(raw: string | null | undefined): MatchThresholds {
  const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : DEFAULT_MATCH_THRESHOLDS;
  const { strong, potential, moderate } = parsed;
  if (
    Object.keys(parsed).length !== 3 ||
    ![strong, potential, moderate].every((value) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100) ||
    Number(strong) <= Number(potential) ||
    Number(potential) <= Number(moderate)
  ) {
    throw new Error('Stored match thresholds are invalid');
  }
  return parsed as MatchThresholds;
}

const NAMES: Record<keyof EvaluationWeights, string> = {
  requiredSkills: 'Required Skills Match',
  education: 'Educational Qualification',
  projects: 'Relevant Project Experience',
  experience: 'Internship / Work Experience',
  technicalKnowledge: 'Technical Knowledge',
  certifications: 'Certifications',
  keywordMatch: 'Job Description Keyword Match',
  domainKnowledge: 'Relevant Domain Knowledge',
  tools: 'Tools & Technologies',
  problemSolving: 'Problem-Solving Evidence',
  achievements: 'Achievements & Accomplishments',
  resumeClarity: 'Resume Completeness & Clarity',
};

const STOP_WORDS = new Set(
  'about after also any are based been being both can candidate candidates including into more most must only other our role should some such than that their them there these they this those through used using were what when where which while will with within would your from have has jobs job work experience skills required preferred knowledge ability strong'.split(' '),
);

function words(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function termScore(terms: string[], text: string): number {
  const distinct = [...new Set(terms)];
  if (!distinct.length) return 100;
  const normalized = normalizeText(text);
  return (distinct.filter((term) => normalized.includes(term)).length / distinct.length) * 100;
}

function snippets(text: string, terms: string[], max = 3): string[] {
  const sentences = splitSentences(text);
  const selected: string[] = [];
  for (const sentence of sentences) {
    if (terms.some((term) => normalizeText(sentence).includes(normalizeText(term))) && !selected.includes(sentence)) {
      selected.push(sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence);
      if (selected.length >= max) break;
    }
  }
  return selected;
}

function section(text: string, headings: string[]): string | null {
  return extractSection(text, headings);
}

function scoreParameter(
  key: keyof EvaluationWeights,
  score: number,
  weight: number,
  explanation: string,
  evidence: string[] = [],
  gaps: string[] = [],
): EvaluationParameterScore {
  const bounded = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
  return {
    key,
    name: NAMES[key],
    score: bounded,
    weight,
    contribution: Math.round((bounded * weight) / 100 * 100) / 100,
    explanation,
    evidence,
    gaps,
  };
}

export function evaluateResume(
  resumeText: string,
  job: EvaluationJob,
  weights: EvaluationWeights = DEFAULT_EVALUATION_WEIGHTS,
  thresholds: MatchThresholds = DEFAULT_MATCH_THRESHOLDS,
): MultiParameterEvaluation {
  const text = normalizeText(resumeText);
  const cleanJob = normalizeText(`${job.title}\n${job.description}\n${job.requiredSkills.join(' ')}\n${job.preferredSkills.join(' ')}`);
  if (text.length < 40) throw new Error('Resume text is empty or too short to evaluate');
  if (cleanJob.length < 20) throw new Error('Job description is too short to evaluate');

  const hits: SkillHit[] = findSkillsInText(text, splitSentences(text));
  const hitSet = new Set(hits.map((hit) => hit.skill.toLowerCase()));
  const required = job.requiredSkills.filter(Boolean);
  const matchedRequired = required.filter((skill) =>
    hits.some((hit) => hit.skill.toLowerCase() === skill.toLowerCase() || text.includes(normalizeText(skill))),
  );
  const missingRequired = required.filter((skill) => !matchedRequired.includes(skill));
  const projectText = section(text, ['projects', 'academic projects', 'key projects', 'personal projects']);
  const experienceText = section(text, ['work experience', 'professional experience', 'experience', 'employment history', 'internships', 'internship']);
  const educationText = section(text, ['education', 'academic background', 'academics', 'qualifications', 'educational qualifications']);
  const certificationText = section(text, ['certifications', 'certificates', 'licenses']);
  const achievementText = section(text, ['achievements', 'accomplishments', 'awards', 'honors']);
  const roleTerms = words(`${job.title} ${job.departmentName ?? ''} ${job.description} ${job.requiredSkills.join(' ')}`);
  const projectTerms = words(`${job.title} ${job.description} ${job.requiredSkills.join(' ')}`);
  const technicalTargets = [...new Set([...job.requiredSkills, ...job.preferredSkills])].filter((skill) =>
    SKILL_DICTIONARY.some((entry) => entry.canonical.toLowerCase() === skill.toLowerCase() && entry.category !== 'SOFT'),
  );
  const toolTargets = [...new Set([...job.requiredSkills, ...job.preferredSkills])].filter((skill) =>
    SKILL_DICTIONARY.some((entry) => entry.canonical.toLowerCase() === skill.toLowerCase() && ['TOOL', 'CLOUD', 'DATABASE'].includes(entry.category)),
  );
  const params: EvaluationParameterScore[] = [];
  const add = (
    key: keyof EvaluationWeights,
    score: number,
    explanation: string,
    evidence: string[] = [],
    gaps: string[] = [],
  ) => params.push(scoreParameter(key, score, weights[key], explanation, evidence, gaps));

  add(
    'requiredSkills',
    required.length ? (matchedRequired.length / required.length) * 100 : 100,
    required.length ? `${matchedRequired.length} of ${required.length} required skills are evidenced. Missing evidence is not proof the candidate lacks a skill.` : 'No required skills were specified for this job; this parameter is not applicable.',
    hits.filter((hit) => matchedRequired.includes(hit.skill)).map((hit) => hit.evidence).slice(0, 4),
    missingRequired,
  );

  if (!job.educationReq?.trim()) {
    add('education', 100, 'No education requirement was specified; no educational background was inferred or penalized.');
  } else {
    const requirementTerms = words(job.educationReq);
    const educationScore = educationText ? termScore(requirementTerms, educationText) : 0;
    add(
      'education',
      educationScore,
      educationText ? `Compared the stated education requirement (“${job.educationReq}”) with the resume education section.` : 'Education information was Not Provided in the resume.',
      educationText ? snippets(educationText, requirementTerms) : [],
      educationScore < 100 ? [educationScore === 0 ? `Requirement not evidenced: ${job.educationReq}` : `Partially evidenced: ${job.educationReq}`] : [],
    );
  }

  const projectScore = projectText ? termScore(projectTerms, projectText) : 0;
  add('projects', projectScore, projectText ? 'Project score is based on role-related terms found in the projects section.' : 'Project information was Not Provided in the resume.', projectText ? snippets(projectText, projectTerms) : [], projectScore < 50 ? ['Relevant project evidence is limited or not provided.'] : []);

  const yearsMatch = text.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/i);
  const explicitYears = yearsMatch ? Number(yearsMatch[1]) : null;
  const minYears = job.experienceMin ?? 0;
  const experienceScore = minYears <= 0
    ? 100
    : explicitYears !== null
      ? Math.min(100, (explicitYears / minYears) * 100)
      : experienceText
        ? 60
        : 0;
  add(
    'experience',
    experienceScore,
    minYears <= 0 ? 'No minimum experience requirement was specified.' : explicitYears !== null ? `Resume explicitly states ${explicitYears} year(s); role minimum is ${minYears}.` : experienceText ? 'Experience is described, but a reliable duration was not stated.' : 'Internship/work experience was Not Provided in the resume.',
    experienceText ? snippets(experienceText, words(job.title)) : [],
    minYears > 0 && experienceScore < 100 ? [`Role minimum: ${minYears} years; duration/evidence may be incomplete.`] : [],
  );

  const matchedTechnical = technicalTargets.filter((skill) => hitSet.has(skill.toLowerCase()) || text.includes(normalizeText(skill)));
  add('technicalKnowledge', technicalTargets.length ? (matchedTechnical.length / technicalTargets.length) * 100 : hits.length ? 100 : 0, technicalTargets.length ? `${matchedTechnical.length} of ${technicalTargets.length} role-related technical skills are evidenced.` : hits.length ? 'Technical terms are present, but the job did not specify technical skills to compare.' : 'No technical skills could be extracted from the resume.', hits.filter((hit) => matchedTechnical.includes(hit.skill)).map((hit) => hit.evidence).slice(0, 4), technicalTargets.filter((skill) => !matchedTechnical.includes(skill)));

  const certificationTargets = words(cleanJob).filter((term) => /certif|license|licensed/.test(term));
  const certRequired = /certif|license|licensed/i.test(cleanJob);
  const matchedCert = certificationTargets.filter((term) => normalizeText(certificationText ?? '').includes(term));
  add('certifications', certRequired ? (certificationTargets.length ? (matchedCert.length / certificationTargets.length) * 100 : (certificationText ? 100 : 0)) : 100, certRequired ? certificationText ? 'Certification-related evidence was compared with the job description.' : 'Certification information was Not Provided; the posting mentions certification requirements.' : 'No certification requirement was specified; optional certifications do not affect this score.', certificationText ? snippets(certificationText, certificationTargets) : [], certRequired && !certificationText ? ['Certification requirement needs human verification.'] : []);

  const keywords = [...new Set(words(`${job.title} ${job.description}`))].slice(0, 30);
  const keywordScore = termScore(keywords, text);
  const matchedKeywords = keywords.filter((term) => text.includes(term));
  add('keywordMatch', keywordScore, `${matchedKeywords.length} of ${keywords.length} distinct job-description terms were found in the resume.`, snippets(text, matchedKeywords), keywords.filter((term) => !text.includes(term)).slice(0, 8));

  const domainTerms = [...new Set(words(`${job.title} ${job.departmentName ?? ''}`))];
  const domainScore = termScore(domainTerms, text);
  add('domainKnowledge', domainScore, domainTerms.length ? 'Compared job title/department terminology with resume text.' : 'The job has no domain terms to compare.', snippets(text, domainTerms), domainScore < 50 ? ['Limited domain-specific terminology evidenced.'] : []);

  const matchedTools = toolTargets.filter((skill) => hitSet.has(skill.toLowerCase()) || text.includes(normalizeText(skill)));
  add('tools', toolTargets.length ? (matchedTools.length / toolTargets.length) * 100 : 100, toolTargets.length ? `${matchedTools.length} of ${toolTargets.length} specified tools/platforms are evidenced.` : 'No specific tools were required; optional tool mentions do not affect this score.', hits.filter((hit) => matchedTools.includes(hit.skill)).map((hit) => hit.evidence).slice(0, 4), toolTargets.filter((skill) => !matchedTools.includes(skill)));

  const problemSentences = splitSentences(text).filter((sentence) => /\b(solved|solve|optimized|improved|debugged|designed|implemented|automated|reduced|increased|analyzed|built)\b/i.test(sentence));
  const relevantProblem = problemSentences.filter((sentence) => words(`${job.title} ${job.description}`).some((term) => normalizeText(sentence).includes(term)));
  const problemScore = problemSentences.length ? Math.min(100, 40 + relevantProblem.length * 20) : 0;
  add('problemSolving', problemScore, problemSentences.length ? `${problemSentences.length} action/outcome statement(s) were found; ${relevantProblem.length} include role-related terms.` : 'No explicit problem-solving/action evidence was found.', relevantProblem.slice(0, 4), problemScore < 50 ? ['Add concrete problem-solving evidence and outcomes if applicable.'] : []);

  add('achievements', achievementText ? 100 : 0, achievementText ? 'An achievements/accomplishments section was found.' : 'Achievement information was Not Provided in a recognizable section.', achievementText ? splitSentences(achievementText).slice(0, 4) : [], achievementText ? [] : ['Achievements were not evidenced; this is not evidence that none exist.']);

  const completeness = [Boolean(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)), Boolean(educationText), Boolean(experienceText), Boolean(projectText), Boolean(hits.length)].filter(Boolean).length;
  add('resumeClarity', completeness * 20, `Readable resume text with ${completeness} of 5 common profile sections/fields detected. Missing fields are Not Provided, not assumed absent.`, [], completeness < 5 ? ['Some common resume fields/sections were not detected.'] : []);

  const totalWeight = params.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight !== 100) throw new Error('Evaluation parameter weights must total exactly 100');
  const overallScore = Math.round(params.reduce((sum, item) => sum + item.contribution, 0) * 100) / 100;
  const recommendation = overallScore >= thresholds.strong
    ? 'STRONG_MATCH'
    : overallScore >= thresholds.potential
      ? 'POTENTIAL_MATCH'
      : overallScore >= thresholds.moderate
        ? 'MODERATE_MATCH'
        : 'LOW_MATCH';
  const strengths = params.filter((item) => item.score >= 70 && item.evidence.length).map((item) => `${item.name}: ${item.evidence[0]}`).slice(0, 6);
  const skillGaps = [...new Set(params.flatMap((item) => item.gaps))].slice(0, 12);
  const explanation = `Deterministic evidence-based evaluation scored ${overallScore.toFixed(2)}/100 across all 12 configured parameters. Recommendation: ${recommendation.replaceAll('_', ' ')}. Evidence gaps indicate information not found in the resume and require human review; they are not proof that the candidate lacks a qualification. AI does not conduct interviews or make hiring decisions.`;
  return { overallScore, recommendation, parameters: params, strengths, skillGaps, explanation };
}
