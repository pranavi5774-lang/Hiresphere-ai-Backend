// ============================================================
// HireSphere AI — Application constants
// Status fields are validated here (SQLite has no native enums).
// ============================================================

export const ROLES = ['ADMIN', 'HR', 'CANDIDATE'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUS = ['ACTIVE', 'SUSPENDED'] as const;

export const JOB_STATUS = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'] as const;

export const APPLICATION_STATUSES = [
  'APPLIED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'SELECTED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Allowed forward transitions for the recruitment pipeline */
export const APPLICATION_TRANSITIONS: Record<string, string[]> = {
  APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'REJECTED'],
  UNDER_REVIEW: ['SHORTLISTED', 'INTERVIEW', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['SELECTED', 'REJECTED'],
  SELECTED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: ['SHORTLISTED'], // HR may re-evaluate; AI never rejects automatically
  WITHDRAWN: ['APPLIED'], // resubmission path
};

export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;

export const INTERVIEW_MODES = ['ONLINE', 'ONSITE', 'PHONE'] as const;

export const NOTIFICATION_TYPES = ['APPLICATION_UPDATE', 'LEAVE_UPDATE', 'INTERVIEW', 'HR_ACTION', 'SYSTEM'] as const;

export const AUDIT_ENTITY_TYPES = [
  'USER',
  'JOB',
  'APPLICATION',
  'ATTENDANCE',
  'LEAVE',
  'PERFORMANCE',
  'AUTH',
  'SYSTEM',
  'RESUME',
] as const;

export const RESUME_PARSE_STATUS = ['PENDING', 'SUCCESS', 'FAILED'] as const;

/** Upload constraints */
export const RESUME_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
export const RESUME_MIME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

/** AI scoring — configurable, explainable, documented in docs/architecture.md */
export const AI_WEIGHT_TFIDF = Number(process.env.AI_WEIGHT_TFIDF ?? 0.6);
export const AI_WEIGHT_SKILL = Number(process.env.AI_WEIGHT_SKILL ?? 0.4);
export const AI_ALGORITHM_VERSION = 'multi-parameter-v1.0';

export const DEFAULT_EVALUATION_WEIGHTS = {
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
} as const;

export const DEFAULT_MATCH_THRESHOLDS = { strong: 80, potential: 65, moderate: 50 } as const;

export const LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under Review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  SELECTED: 'Selected',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  OPEN: 'Open',
  DRAFT: 'Draft',
  CLOSED: 'Closed',
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  ON_PROBATION: 'On Probation',
  ON_LEAVE: 'On Leave',
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  HALF_DAY: 'Half Day',
  LEAVE: 'Leave',
  WFH: 'Work From Home',
  HOLIDAY: 'Holiday',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  ONLINE: 'Online',
  ONSITE: 'Onsite',
  PHONE: 'Phone',
  ADMIN: 'Admin',
  HR: 'HR',
  CANDIDATE: 'Candidate',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};
