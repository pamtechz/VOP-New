import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
function text(value: unknown) { return String(value ?? '').trim(); }
function object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = object(req.body);
    const ctx = await authenticateTenant(req);
    await requirePermission(ctx, 'organizations', 'create');
    if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can initialize an organization.');

    const organizationId = text(body.organizationId).toLowerCase();
    const name = text(body.name);
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(organizationId)) throw new Error('A valid organization identifier is required.');
    if (!name) throw new Error('Organization name is required.');

    const ref = ctx.db.doc(`organizations/${organizationId}`);
    if ((await ref.get()).exists) throw new Error('That organization already exists.');
    const now = FieldValue.serverTimestamp();
    const profile = object(body.profile);
    const settings = object(body.settings);
    const branding = object(body.branding);

    const data = {
      id: organizationId,
      name,
      slug: text(body.slug) || organizationId,
      status: 'active',
      ownerUid: text(body.ownerUid),
      plan: text(body.plan) || 'standard',
      branding,
      timezone: text(body.timezone) || 'UTC',
      defaultLanguage: text(body.defaultLanguage) || '',
      hierarchy: object(body.hierarchy),
      featureEntitlements: object(body.featureEntitlements),
      quotas: object(body.quotas),
      onboarding: { status: 'initialized', initializedAt: now, initializedBy: ctx.auth.uid },
      createdAt: now,
      updatedAt: now,
    };

    const batch = ctx.db.batch();
    batch.set(ref, data);
    batch.set(ref.collection('settings').doc('organization'), { ...settings, organizationId, updatedAt: now }, { merge: true });
    batch.set(ref.collection('onboarding').doc('state'), { status: 'initialized', profile, branding, settings, completedSteps: [], updatedAt: now }, { merge: true });
    await batch.commit();
    await writeTenantAudit(ctx, 'organization.initialize', ref.path, undefined, data);

    return res.status(200).json({ ok: true, organization: { id: organizationId, name, status: 'active', plan: data.plan }, next: ['owner_assignment','branding','settings','content','invite_users'] });
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : 'Organization onboarding failed.' });
  }
}
