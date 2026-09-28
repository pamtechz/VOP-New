import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, accessibleOrganizationIds, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
function text(value: unknown, fallback = '') { return String(value ?? fallback).trim(); }
function object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = object(req.body);
    const action = text(body.action, 'listPlans');
    const requestedOrganizationId = text(body.organizationId);
    const ctx = await authenticateTenant(req, requestedOrganizationId || undefined);
    await requirePermission(ctx, 'billing', action === 'listPlans' || action === 'getSubscription' ? 'view' : 'manage');

    if (action === 'listPlans') {
      const snapshot = await ctx.db.collection('system/plans/catalog').orderBy('sortOrder', 'asc').get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'getSubscription') {
      const organizationId = requestedOrganizationId || ctx.organizationId;
      if (!organizationId) throw new Error('An organization is required.');
      if (!ctx.isSuperAdmin && !ctx.organizationId && !(await accessibleOrganizationIds(ctx)).includes(organizationId)) throw new Error('The organization is outside your scope.');
      if (!ctx.isSuperAdmin && ctx.organizationId !== organizationId) throw new Error('You cannot access another organization subscription.');
      const [organization, subscription] = await Promise.all([
        ctx.db.doc(`organizations/${organizationId}`).get(),
        ctx.db.doc(`organizations/${organizationId}/subscription/current`).get(),
      ]);
      if (!organization.exists || organization.data()?.status !== 'active') throw new Error('The organization is not available.');
      return res.status(200).json({ ok: true, organizationId, plan: organization.data()?.plan || null, subscription: subscription.exists ? subscription.data() : null, quotas: organization.data()?.quotas || {} });
    }

    if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage plans and subscriptions.');

    if (action === 'upsertPlan') {
      const planId = text(body.planId);
      if (!/^[a-zA-Z0-9_-]{2,80}$/.test(planId)) throw new Error('A valid plan identifier is required.');
      const name = text(body.name);
      if (!name) throw new Error('A plan name is required.');
      const data = {
        id: planId,
        name,
        description: text(body.description),
        active: body.active !== false,
        price: Number.isFinite(Number(body.price)) ? Number(body.price) : 0,
        currency: text(body.currency, 'USD').toUpperCase(),
        interval: ['month','year','one_time'].includes(text(body.interval)) ? text(body.interval) : 'month',
        sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        quotas: object(body.quotas),
        features: object(body.features),
        externalPriceId: text(body.externalPriceId) || null,
        updatedAt: FieldValue.serverTimestamp(),
      };
      const ref = ctx.db.doc(`system/plans/catalog/${planId}`);
      const before = (await ref.get()).data();
      await ref.set({ ...data, createdAt: before?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
      await writeTenantAudit(ctx, 'plan.upsert', ref.path, before, data);
      return res.status(200).json({ ok: true, item: { id: planId, ...data } });
    }

    if (action === 'deletePlan') {
      const planId = text(body.planId);
      if (!planId) throw new Error('A plan identifier is required.');
      const ref = ctx.db.doc(`system/plans/catalog/${planId}`);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error('The plan does not exist.');
      const activeOrganizations = await ctx.db.collection('organizations').where('plan', '==', planId).where('status', '==', 'active').limit(1).get();
      if (!activeOrganizations.empty) throw new Error('A plan assigned to an active organization cannot be deleted. Deactivate or migrate those organizations first.');
      await ref.delete();
      await writeTenantAudit(ctx, 'plan.delete', ref.path, snapshot.data(), undefined);
      return res.status(200).json({ ok: true, deleted: planId });
    }

    if (action === 'assignPlan') {
      const organizationId = text(body.organizationId);
      const planId = text(body.planId);
      if (!organizationId || !planId) throw new Error('Organization and plan are required.');
      const [organizationRef, planRef] = [ctx.db.doc(`organizations/${organizationId}`), ctx.db.doc(`system/plans/catalog/${planId}`)];
      const [organization, plan] = await Promise.all([organizationRef.get(), planRef.get()]);
      if (!organization.exists || organization.data()?.status !== 'active') throw new Error('The organization is not available.');
      if (!plan.exists || plan.data()?.active !== true) throw new Error('The selected plan is not active.');
      const planData = plan.data() || {};
      const before = organization.data();
      await organizationRef.set({ plan: planId, quotas: planData.quotas || {}, featureEntitlements: planData.features || {}, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await organizationRef.collection('subscription').doc('current').set({ organizationId, planId, status: 'active', billingProvider: text(body.billingProvider) || 'manual', externalCustomerId: text(body.externalCustomerId) || null, externalSubscriptionId: text(body.externalSubscriptionId) || null, startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeTenantAudit(ctx, 'subscription.assign', organizationRef.path, before, { plan: planId, quotas: planData.quotas || {}, featureEntitlements: planData.features || {} });
      return res.status(200).json({ ok: true, organizationId, planId, status: 'active' });
    }

    if (action === 'activateSubscription' || action === 'reactivateSubscription') {
      const organizationId = text(body.organizationId);
      if (!organizationId) throw new Error('Organization is required.');
      const subscriptionRef = ctx.db.doc(`organizations/${organizationId}/subscription/current`);
      const snapshot = await subscriptionRef.get();
      if (!snapshot.exists) throw new Error('The organization has no subscription record.');
      const before = snapshot.data();
      await subscriptionRef.set({ status: 'active', activatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeTenantAudit(ctx, `subscription.${action === 'activateSubscription' ? 'activate' : 'reactivate'}`, subscriptionRef.path, before, { status: 'active' });
      return res.status(200).json({ ok: true, organizationId, status: 'active' });
    }

    if (action === 'cancelSubscription') {
      const organizationId = text(body.organizationId);
      if (!organizationId) throw new Error('Organization is required.');
      const subscriptionRef = ctx.db.doc(`organizations/${organizationId}/subscription/current`);
      const before = (await subscriptionRef.get()).data();
      await subscriptionRef.set({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeTenantAudit(ctx, 'subscription.cancel', subscriptionRef.path, before, { status: 'cancelled' });
      return res.status(200).json({ ok: true, organizationId, status: 'cancelled' });
    }

    throw new Error('Unsupported plan action.');
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : 'Plan request failed.' });
  }
}
