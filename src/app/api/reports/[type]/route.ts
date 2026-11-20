// GET /api/reports/[type]?from=&to=&month=&format=(json|csv) — HR/ADMIN reports
// Types: recruitment | pipeline | screening

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ok, handler, requireAuth, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { isoDate } from '@/lib/datetime';

interface Column {
  key: string;
  label: string;
}
interface ReportData {
  columns: Column[];
  rows: Record<string, string | number | null>[];
}

const REPORT_TYPES = ['recruitment', 'pipeline', 'screening'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(data: ReportData): string {
  const header = data.columns.map((c) => csvEscape(c.label)).join(',');
  const lines = data.rows.map((row) => data.columns.map((c) => csvEscape(row[c.key])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

const round2 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function buildReport(type: ReportType, from?: Date, to?: Date, month?: string): Promise<ReportData> {
  switch (type) {
    case 'recruitment': {
      const jobs = await db.job.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          department: { select: { name: true } },
          applications: { select: { status: true, matchScore: true } },
        },
      });
      return {
        columns: [
          { key: 'job', label: 'Job Title' },
          { key: 'department', label: 'Department' },
          { key: 'status', label: 'Job Status' },
          { key: 'total', label: 'Total Applications' },
          { key: 'shortlisted', label: 'Shortlisted' },
          { key: 'interviewed', label: 'Interviewed' },
          { key: 'hired', label: 'Hired' },
          { key: 'avgMatchScore', label: 'Avg Match Score' },
        ],
        rows: jobs.map((j) => {
          const scores = j.applications.map((a) => a.matchScore).filter((s): s is number => typeof s === 'number');
          return {
            job: j.title,
            department: j.department?.name ?? '',
            status: j.status,
            total: j.applications.length,
            shortlisted: j.applications.filter((a) => a.status === 'SHORTLISTED').length,
            interviewed: j.applications.filter((a) => a.status === 'INTERVIEW').length,
            hired: j.applications.filter((a) => a.status === 'HIRED').length,
            avgMatchScore: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          };
        }),
      };
    }
    case 'pipeline': {
      const applications = await db.application.findMany({
        where: {
          ...(from ? { appliedAt: { gte: from } } : {}),
          ...(to ? { appliedAt: { lte: to } } : {}),
        },
        orderBy: { appliedAt: 'desc' },
        include: {
          candidate: { select: { user: { select: { name: true, email: true } } } },
          job: { select: { title: true } },
        },
      });
      return {
        columns: [
          { key: 'candidate', label: 'Candidate' },
          { key: 'email', label: 'Email' },
          { key: 'job', label: 'Job' },
          { key: 'status', label: 'Status' },
          { key: 'matchScore', label: 'Match Score' },
          { key: 'appliedAt', label: 'Applied At' },
        ],
        rows: applications.map((a) => ({
          candidate: a.candidate.user.name,
          email: a.candidate.user.email,
          job: a.job.title,
          status: a.status,
          matchScore: round2(a.matchScore),
          appliedAt: iso(a.appliedAt),
        })),
      };
    }
    case 'screening': {
      const analyses = await db.resumeAnalysis.findMany({
        where: {
          ...(from ? { createdAt: { gte: from } } : {}),
          ...(to ? { createdAt: { lte: to } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          application: {
            select: {
              candidate: { select: { user: { select: { name: true } } } },
              job: { select: { title: true } },
            },
          },
        },
      });
      return {
        columns: [
          { key: 'candidate', label: 'Candidate' },
          { key: 'job', label: 'Job' },
          { key: 'tfidfScore', label: 'TF-IDF Score' },
          { key: 'skillScore', label: 'Skill Score' },
          { key: 'finalScore', label: 'Final Score' },
          { key: 'algorithmVersion', label: 'Algorithm Version' },
          { key: 'createdAt', label: 'Analyzed At' },
        ],
        rows: analyses.map((a) => ({
          candidate: a.application.candidate.user.name,
          job: a.application.job.title,
          tfidfScore: round2(a.tfidfScore),
          skillScore: round2(a.skillScore),
          finalScore: round2(a.finalScore),
          algorithmVersion: a.algorithmVersion,
          createdAt: iso(a.createdAt),
        })),
      };
    }
  }
}

export const GET = handler(async (req, ctx) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const { type: rawType } = await ctx.params;
  const type = rawType as ReportType;
  if (!REPORT_TYPES.includes(type)) {
    throw new ApiError('REPORT_TYPE_NOT_FOUND', `Unknown report type "${rawType}"`, 404, {
      available: REPORT_TYPES,
    });
  }

  const sp = req.nextUrl.searchParams;
  const fromParam = sp.get('from');
  const toParam = sp.get('to');
  const monthParam = sp.get('month') ?? undefined;
  const format = (sp.get('format') ?? 'json').toLowerCase();
  if (format !== 'json' && format !== 'csv') {
    throw new ApiError('INVALID_FORMAT', 'format must be json or csv', 400);
  }
  if (fromParam && Number.isNaN(new Date(fromParam).getTime())) {
    throw new ApiError('INVALID_DATE', 'from must be a valid date', 400);
  }
  if (toParam && Number.isNaN(new Date(toParam).getTime())) {
    throw new ApiError('INVALID_DATE', 'to must be a valid date', 400);
  }

  const data = await buildReport(
    type,
    fromParam ? new Date(fromParam) : undefined,
    toParam ? new Date(toParam) : undefined,
    monthParam
  );

  if (format === 'csv') {
    const csv = toCsv(data);
    await logAudit({
      actor: { id: session.sub, name: session.name, role: session.role },
      action: 'REPORT_EXPORTED',
      entityType: 'SYSTEM',
      entityId: type,
      details: { type, format: 'csv', rows: data.rows.length },
      ip: clientIp(req),
    });
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}.csv"`,
      },
    });
  }

  return ok({
    type,
    generatedAt: new Date().toISOString(),
    count: data.rows.length,
    columns: data.columns,
    items: data.rows,
  });
});
