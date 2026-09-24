import { authenticateTenant, accessibleOrganizationIds } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const organizationId = String(body.organizationId || '').trim();
    const limit = Math.min(Math.max(Number(body.limit || 50), 1), 200);
    const ctx = await authenticateTenant(req, organizationId || undefined);
    await requirePermission(ctx, 'audit', 'view');

    if (ctx.isSuperAdmin && !organizationId) {
      const snapshot = await ctx.db.collection('platformAudit').orderBy('timestamp', 'desc').limit(limit).get();
      return res.status(200).json({ ok: true, scope: 'platform', items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (ctx.isSuperAdmin && organizationId) {
      const activeIds = await accessibleOrganizationIds(ctx);
      if (!activeIds.includes(organizationId)) throw new Error('The selected organization does not exist or is not active.');
      const snapshot = await ctx.db.collection(`organizations/${organizationId}/audit`).orderBy('timestamp', 'desc').limit(limit).get();
      return res.status(200).json({ ok: true, scope: 'organization', organizationId, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (ctx.tenantType === 'organization') {
      const snapshot = await ctx.db.collection(`organizations/${ctx.organizationId}/audit`).orderBy('timestamp', 'desc').limit(limit).get();
      return res.status(200).json({ ok: true, scope: 'organization', organizationId: ctx.organizationId, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    const tenantKey = ctx.tenantId;
    const snapshot = await ctx.db.collection(`tenantAudit/${tenantKey}/entries`).orderBy('timestamp', 'desc').limit(limit).get();
    return res.status(200).json({ ok: true, scope: 'hierarchy', tenantId: tenantKey, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : 'Audit request failed.' });
  }
}
