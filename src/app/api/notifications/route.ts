// GET /api/notifications — own notifications (latest 30) + unreadCount

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  const session = await requireAuth(req);

  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    db.notification.count({ where: { userId: session.sub, isRead: false } }),
  ]);

  return ok({ items, unreadCount });
});
