// PATCH /api/notifications/[id]/read — mark own notification as read

export const dynamic = 'force-dynamic';

import { ok, handler, requireAuth, ApiError } from '@/lib/api';
import { db } from '@/lib/db';

export const PATCH = handler(async (req, ctx) => {
  const session = await requireAuth(req);
  const { id } = await ctx.params;

  // Filter by owner in the query itself — other users' notifications 404
  const notification = await db.notification.findFirst({
    where: { id, userId: session.sub },
  });
  if (!notification) throw new ApiError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);

  const updated = await db.notification.update({
    where: { id },
    data: { isRead: true },
  });
  return ok(updated);
});
