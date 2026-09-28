/* Shared Vercel function: dispatch to the existing tenant-authorized handlers. */
import route0 from '../api_handlers/admin/analytics.js';
import route1 from '../api_handlers/admin/audit.js';
import route2 from '../api_handlers/admin/bootstrap.js';
import route3 from '../api_handlers/admin/candidates.js';
import route4 from '../api_handlers/admin/content.js';
import route5 from '../api_handlers/admin/enrollCandidate.js';
import route6 from '../api_handlers/admin/graduations.js';
import route7 from '../api_handlers/admin/languages.js';
import route8 from '../api_handlers/admin/notifications.js';
import route9 from '../api_handlers/admin/onboarding.js';
import route10 from '../api_handlers/admin/organizations.js';
import route11 from '../api_handlers/admin/permissions.js';
import route12 from '../api_handlers/admin/plans.js';
import route13 from '../api_handlers/admin/radio.js';
import route14 from '../api_handlers/admin/search.js';
import route15 from '../api_handlers/admin/users.js';

type Request = { url?: string; query?: Record<string, string | string[] | undefined> };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
type RouteHandler = (request: never, response: never) => unknown;
const routes: Record<string, RouteHandler> = Object.freeze({
  'analytics': route0,
  'audit': route1,
  'bootstrap': route2,
  'candidates': route3,
  'content': route4,
  'enrollCandidate': route5,
  'graduations': route6,
  'languages': route7,
  'notifications': route8,
  'onboarding': route9,
  'organizations': route10,
  'permissions': route11,
  'plans': route12,
  'radio': route13,
  'search': route14,
  'users': route15,
});

function resolveRoute(req: Request): string {
  const candidate = req.query?.__vopRoute;
  const rewritten = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof rewritten === 'string' && rewritten) return rewritten;
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  return path.startsWith('/api/admin/') ? path.slice('/api/admin/'.length) : '';
}

export default async function handler(req: Request, res: Response) {
  const route = resolveRoute(req);
  if (!Object.prototype.hasOwnProperty.call(routes, route)) {
    return res.status(404).json({ error: 'Unknown administrative endpoint.' });
  }
  // Authentication, permissions, ownership and tenant isolation stay in each handler.
  return routes[route](req as never, res as never);
}
