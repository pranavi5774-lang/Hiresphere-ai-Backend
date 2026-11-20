// GET   /api/settings — system settings (ADMIN)
// PATCH /api/settings — upsert one setting { key, value } (ADMIN)

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { ok, handler, requireAuth, parseBody, logAudit, clientIp } from '@/lib/api';
import { db } from '@/lib/db';

export const GET = handler(async (req) => {
  await requireAuth(req, ['ADMIN']);
  const items = await db.systemSetting.findMany({ orderBy: { key: 'asc' } });
  return ok({ items });
});

const patchSchema = z.object({
  key: z.string().trim().min(1, 'key is required').max(100),
  value: z.string().max(2000),
});

export const PATCH = handler(async (req) => {
  const session = await requireAuth(req, ['ADMIN']);
  const body = await parseBody(req, patchSchema);

  const setting = await db.systemSetting.upsert({
    where: { key: body.key },
    create: { key: body.key, value: body.value },
    update: { value: body.value },
  });

  await logAudit({
    actor: { id: session.sub, name: session.name, role: session.role },
    action: 'SETTING_UPDATED',
    entityType: 'SYSTEM',
    entityId: setting.id,
    details: { key: setting.key },
    ip: clientIp(req),
  });
  return ok(setting);
});
