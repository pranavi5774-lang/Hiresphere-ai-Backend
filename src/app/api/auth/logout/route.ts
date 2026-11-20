// POST /api/auth/logout — clears the session cookie

export const dynamic = 'force-dynamic';

import { ok, handler, getSession, logAudit, clientIp } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/auth';

export const POST = handler(async (req) => {
  const session = await getSession(req);
  if (session) {
    await logAudit({
      actor: { id: session.sub, name: session.name, role: session.role },
      action: 'AUTH_LOGOUT',
      entityType: 'AUTH',
      entityId: session.sub,
      ip: clientIp(req),
    });
  }
  const response = ok({ message: 'Logged out' });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return response;
});
