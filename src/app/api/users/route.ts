// GET  /api/users — list users (ADMIN only)
// POST /api/users — create HR/ADMIN user (ADMIN only)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, getPagination, paginated, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

const USER_SORT: Record<string, string> = {
  name: 'name',
  email: 'email',
  role: 'role',
  status: 'status',
  lastloginat: 'lastLoginAt',
  createdat: 'createdAt',
};

export const GET = handler(async (req) => {
  await requireAuth(req, ['ADMIN']);
  const p = getPagination(req);
  const sp = req.nextUrl.searchParams;
  const role = sp.get('role');
  const status = sp.get('status');

  const where = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(p.search
      ? { OR: [{ name: { contains: p.search } }, { email: { contains: p.search } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true, status: true,
        phone: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { [USER_SORT[p.sortBy.toLowerCase()] ?? 'createdAt']: p.sortDir },
      skip: p.skip,
      take: p.take,
    }),
    db.user.count({ where }),
  ]);
  return ok(paginated(items, total, p));
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  role: z.enum(['HR', 'ADMIN']),
  phone: z.string().trim().max(24).optional(),
});

export const POST = handler(async (req) => {
  const session = await requireAuth(req, ['ADMIN']);
  const body = await parseBody(req, createSchema);
  const email = body.email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ApiError('EMAIL_EXISTS', 'An account with this email already exists', 409);

  const passwordHash = await hashPassword(body.password);
  const user = await db.user.create({
    data: { email, passwordHash, name: body.name, role: body.role, phone: body.phone ?? null },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      phone: true, lastLoginAt: true, createdAt: true,
    },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'USER_CREATED',
    entityType: 'USER',
    entityId: user.id,
    details: { email: user.email, role: user.role },
    ip: clientIp(req),
  });
  return ok(user, 201);
});
