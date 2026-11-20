// GET  /api/departments — list departments with job counts (any authenticated)
// POST /api/departments — create department (HR/ADMIN)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, getPagination, paginated, logAudit, ApiError, clientIp } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  await requireAuth(req);
  const p = getPagination(req, { sortBy: 'name' });
  const where = p.search ? { name: { contains: p.search } } : {};

  const [items, total] = await Promise.all([
    db.department.findMany({
      where,
      orderBy: { name: p.sortDir === 'desc' ? 'desc' : 'asc' },
      skip: p.skip,
      take: p.take,
      include: { _count: { select: { jobs: true } } },
    }),
    db.department.count({ where }),
  ]);
  return ok(paginated(items, total, p));
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().trim().max(500).optional(),
});

export const POST = handler(async (req) => {
  const session = await requireAuth(req, ['HR', 'ADMIN']);
  const body = await parseBody(req, createSchema);

  const existing = await db.department.findUnique({ where: { name: body.name } });
  if (existing) throw new ApiError('DEPARTMENT_EXISTS', 'A department with this name already exists', 409);

  const department = await db.department.create({
    data: { name: body.name, description: body.description ?? null },
    include: { _count: { select: { jobs: true } } },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'DEPARTMENT_CREATED',
    entityType: 'SYSTEM',
    entityId: department.id,
    details: { name: department.name },
    ip: clientIp(req),
  });
  return ok(department, 201);
});
