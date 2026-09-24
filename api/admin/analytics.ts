import { authenticateTenant, accessibleOrganizationIds } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

const ORG_SCOPED_COLLECTIONS = [
  'users', 'guides', 'lessons', 'quizzes', 'books', 'radioBroadcasts',
  'playlists', 'announcements', 'prayerRequests', 'certificates',
  'graduationRequests', 'candidates', 'mentorshipAssignments', 'conversations',
] as const;

function countByOrganization(ctx: Awaited<ReturnType<typeof authenticateTenant>>, collection: string, organizationIds: string[]) {
  if (!organizationIds.length) return Promise.resolve(0);
  return Promise.all(organizationIds.map(async organizationId => {
    const [a, b] = await Promise.all([
      ctx.db.collection(collection).where('organizationId', '==', organizationId).get(),
      ctx.db.collection(collection).where('ownerOrganizationId', '==', organizationId).get(),
    ]);
    const ids = new Set<string>();
    a.docs.forEach(d => ids.add(d.id));
    b.docs.forEach(d => ids.add(d.id));
    return ids.size;
  })).then(values => values.reduce((sum, value) => sum + value, 0));
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const requestedOrganizationId = String(body.organizationId || '').trim();
    const ctx = await authenticateTenant(req, requestedOrganizationId || undefined);
    await requirePermission(ctx, 'analytics', 'view');

    let organizationIds = await accessibleOrganizationIds(ctx);
    if (ctx.isSuperAdmin && requestedOrganizationId) {
      organizationIds = organizationIds.filter(id => id === requestedOrganizationId);
      if (!organizationIds.length) throw new Error('The selected organization does not exist or is not active.');
    }

    const counts = await Promise.all(ORG_SCOPED_COLLECTIONS.map(async collection => [collection, await countByOrganization(ctx, collection, organizationIds)] as const));
    const result: Record<string, number> = Object.fromEntries(counts);

    const activeOrganizations = ctx.isSuperAdmin && !requestedOrganizationId
      ? (await ctx.db.collection('organizations').where('status', '==', 'active').get()).size
      : organizationIds.length;

    return res.status(200).json({
      ok: true,
      scope: ctx.isSuperAdmin && !requestedOrganizationId ? 'platform' : ctx.tenantType,
      organizationIds: requestedOrganizationId ? organizationIds : undefined,
      summary: { activeOrganizations, ...result },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : 'Analytics request failed.' });
  }
}
