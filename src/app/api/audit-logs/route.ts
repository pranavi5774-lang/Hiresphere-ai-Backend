// GET /api/audit-logs — tamper-tolerant activity trail (ADMIN only)

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, getPagination, paginated } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  await requireAuth(req, ['ADMIN']);
  const p = getPagination(req);
  const sp = req.nextUrl.searchParams;

  const entityType = sp.get('entityType') ?? undefined;
  const action = sp.get('action') ?? undefined;
  const actorId = sp.get('actorId') ?? undefined;

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
    ...(p.search ? { actorName: { contains: p.search } } : {}),
  };

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: p.skip,
      take: p.take,
    }),
    db.auditLog.count({ where }),
  ]);
  return ok(paginated(items, total, p));
});
