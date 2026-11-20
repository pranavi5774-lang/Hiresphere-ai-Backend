// ============================================================
// HireSphere AI — REST API helpers
// Response envelope, auth guards, pagination, rate limiting,
// audit logging and notifications. Every protected route MUST
// enforce authorization here (hiding UI is never sufficient).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { db } from './db';
import { SESSION_COOKIE, verifySession, type SessionPayload } from './auth';
import type { Role } from './constants';

// ---------- response envelope ----------

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Wrap a route handler with consistent error handling. */
export function handler(fn: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.code, err.message, err.status, err.details);
      }
      if (err instanceof ZodError) {
        return fail('VALIDATION_ERROR', 'Invalid request data', 422, err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })));
      }
      console.error('[API] Unhandled error:', err);
      // Never leak internals to the client
      return fail('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    }
  };
}

// ---------- auth guards ----------

/**
 * Resolve the session from the httpOnly cookie OR an
 * `Authorization: Bearer <token>` header.
 *
 * WHY the header fallback: the sandbox preview panel renders the app inside a
 * cross-origin iframe, where browsers do not store/send SameSite=Lax cookies.
 * The client therefore keeps the session JWT (returned by login/register) in
 * localStorage and sends it via the Authorization header. Same-origin, top-level
 * usage continues to work through the httpOnly cookie alone.
 */
export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await verifySession(token);
    if (session) return session;
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return verifySession(authHeader.slice(7).trim());
  }
  return null;
}

export async function requireAuth(req: NextRequest, allowedRoles?: Role[]): Promise<SessionPayload> {
  const session = await getSession(req);
  if (!session) throw new ApiError('UNAUTHENTICATED', 'Authentication required', 401);
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new ApiError('FORBIDDEN', 'You do not have permission to perform this action', 403);
  }
  // Reject suspended accounts on every protected call
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { status: true } });
  if (!user || user.status !== 'ACTIVE') throw new ApiError('ACCOUNT_DISABLED', 'This account has been deactivated', 403);
  return session;
}

// ---------- validation ----------

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }
  return schema.parse(raw);
}

// ---------- pagination & query params ----------

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export function getPagination(req: NextRequest, defaults?: { sortBy?: string }): Pagination {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 10) || 10));
  const search = (sp.get('search') ?? '').trim().slice(0, 100);
  const sortBy = (sp.get('sortBy') ?? defaults?.sortBy ?? 'createdAt').replace(/[^a-zA-Z]/g, '') || 'createdAt';
  const sortDir = sp.get('sortDir') === 'asc' ? 'asc' : 'desc';
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search, sortBy, sortDir };
}

export function paginated<T>(items: T[], total: number, p: { page: number; pageSize: number }) {
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

// ---------- rate limiting (in-memory, per IP + bucket) ----------

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: NextRequest, bucket: string, max: number, windowMs: number) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    throw new ApiError('RATE_LIMITED', 'Too many requests. Please try again later.', 429);
  }
}

// ---------- audit log ----------

export interface AuditInput {
  actor?: { id?: string; name: string; role: string } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
  ip?: string | null;
}

/** Records an audit trail entry. Never log passwords/tokens. */
export async function logAudit(input: AuditInput) {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? 'System',
        actorRole: input.actor?.role ?? 'SYSTEM',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        details: typeof input.details === 'string' ? input.details : input.details ? JSON.stringify(input.details) : null,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error('[AUDIT] Failed to record audit log:', err);
  }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

// ---------- notifications ----------

export async function notify(userId: string, title: string, message: string, type: string, link?: string) {
  try {
    await db.notification.create({ data: { userId, title, message, type, link: link ?? null } });
  } catch (err) {
    console.error('[NOTIFY] Failed to create notification:', err);
  }
}
