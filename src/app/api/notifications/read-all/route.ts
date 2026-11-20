// PATCH /api/notifications/read-all — mark all own notifications as read

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth } from '@/lib/api';
import { db } from '@/lib/db';

export const PATCH = handler(async (req) => {
  const session = await requireAuth(req);
  const result = await db.notification.updateMany({
    where: { userId: session.sub, isRead: false },
    data: { isRead: true },
  });
  return ok({ updated: result.count });
});
