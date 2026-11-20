// GET /api/health — public liveness probe (checks DB connectivity)

export const dynamic = 'force-dynamic';

import { ok, handler } from '@/lib/api';
import { db } from '@/lib/db';

const VERSION = '1.0.0';

export const GET = handler(async () => {
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  return ok({
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
});
