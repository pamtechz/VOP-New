import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, accessibleOrganizationIds, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';
import { deletePayableItem, upsertPayableItem } from '../../server/payments/core.js';
import { registeredPaymentProviderKeys } from '../../server/payments/providers.js';
import { loadPlatformBillingSettings, quoteSubscriptionPlan, SAAS_BASE_CURRENCY, ZAMBIA_BILLING_CURRENCY } from '../../server/billing.js';

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
    await requirePermission(ctx, 'billing', ['listPlans','listAvailablePlans','getSubscription'].includes(action) ? 'view' : 'manage');

    if (action === 'listPlans') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can access subscription package administration.');
      const snapshot = await ctx.db.collection('system/plans/catalog').orderBy('sortOrder', 'asc').get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'listAvailablePlans') {
      if (!ctx.isSuperAdmin) {
        const role=text(ctx.membership?.role || ctx.profile.organizationRole);
        if (ctx.tenantType !== 'organization' || !ctx.organizationId || !['owner','admin'].includes(role)) {
          throw new Error('Only an organization owner or administrator can view subscription packages for the organization.');
        }
      }
      const snapshot = await ctx.db.collection('system/plans/catalog').where('active', '==', true).get();
      const targetOrganizationId=ctx.organizationId||requestedOrganizationId;
      const items = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data() || {};
        const quote=targetOrganizationId?await quoteSubscriptionPlan(ctx.db,targetOrganizationId,data):null;
        return {
          id: doc.id,
          name: text(data.name),
          description: text(data.description),
          priceUsd: Number(data.priceUsd ?? data.price ?? 0),
          baseCurrency: SAAS_BASE_CURRENCY,
          billingPrice: quote?.amountDecimal ?? String(Number(data.priceUsd ?? data.price ?? 0).toFixed(2)),
          billingCurrency: quote?.billingCurrency ?? SAAS_BASE_CURRENCY,
          billingCountryCode: quote?.countryCode ?? '',
          exchangeRate: quote?.exchangeRate ?? 1,
          fxSource: quote?.fxSource ?? 'base-price',
          interval: text(data.interval, 'month'),
          sortOrder: Number(data.sortOrder || 0),
          quotas: object(data.quotas),
          features: object(data.features),
        };
      }));
      items.sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'getBillingSettings') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can access platform billing settings.');
      const settings=await loadPlatformBillingSettings(ctx.db);
      return res.status(200).json({ok:true,item:settings});
    }

    if (action === 'updateBillingSettings') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can change platform billing settings.');
      const usdToZmwRate=Number(body.usdToZmwRate);
      if(!Number.isFinite(usdToZmwRate)||usdToZmwRate<=0)throw new Error('Enter a valid USD to ZMW exchange rate.');
      const fxQuoteTtlMinutes=Math.max(15,Math.min(10080,Math.trunc(Number(body.fxQuoteTtlMinutes)||1440)));
      const fxSource=text(body.fxSource,'platform-configured');
      const data={
        baseCurrency:SAAS_BASE_CURRENCY,zambiaCurrency:ZAMBIA_BILLING_CURRENCY,
        usdToZmwRate,fxSource,fxUpdatedAt:new Date().toISOString(),fxQuoteTtlMinutes,
        updatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      };
      const ref=ctx.db.doc('system/billing');
      const before=(await ref.get()).data();
      await ref.set({...data,createdAt:before?.createdAt||FieldValue.serverTimestamp()},{merge:true});
      await writeTenantAudit(ctx,'billing.fx.update',ref.path,before,data);
      return res.status(200).json({ok:true,item:data});
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
      return res.status(200).json({
        ok:true,organizationId,plan:organization.data()?.plan||null,
        subscription:subscription.exists?subscription.data():null,
        quotas:organization.data()?.quotas||{},
        featureEntitlements:organization.data()?.featureEntitlements||{},
        billingProfile:organization.data()?.billingProfile||{},
      });
    }

    if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can manage plans and subscriptions.');

    if (action === 'upsertPlan') {
      const name = text(body.name);
      if (!name) throw new Error('A plan name is required.');
      const generatedBase=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'package';
      const planId = text(body.planId) || (generatedBase+'-'+randomUUID().slice(0,8));
      if (!/^[a-zA-Z0-9_-]{2,80}$/.test(planId)) throw new Error('A valid package identifier could not be generated.');
      const priceUsd=Number(body.priceUsd ?? body.price);
      if(!Number.isFinite(priceUsd)||priceUsd<0)throw new Error('Enter a valid USD subscription price.');
      const data = {
        id: planId,
        name,
        description: text(body.description),
        active: body.active !== false,
        price: priceUsd,
        priceUsd,
        priceUsdMinor:Math.round(priceUsd*100),
        baseCurrency:SAAS_BASE_CURRENCY,
        currency:SAAS_BASE_CURRENCY,
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

      const subscriptionPayableId='subscription_'+planId;
      if (data.active && data.priceUsd > 0) {
        await upsertPayableItem(ctx, {
          id:subscriptionPayableId,
          name:data.name,
          description:data.description || (data.name+' organization subscription'),
          itemType:'organization_subscription',
          itemId:planId,
          scope:'platform',
          amount:data.priceUsd,
          currency:SAAS_BASE_CURRENCY,
          repeatable:true,
          active:true,
          paymentRequired:true,
          allowedProviders:registeredPaymentProviderKeys(),
          allowedMethods:['card','airtel_money','mtn_money','zamtel_money'],
          metadata:{managedBy:'subscription-package'},
        });
      } else {
        try { await deletePayableItem(ctx,subscriptionPayableId); } catch (error) {
          if (!(error instanceof Error) || !/does not exist/i.test(error.message)) throw error;
        }
      }

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
      try { await deletePayableItem(ctx,'subscription_'+planId); } catch (error) {
        if (!(error instanceof Error) || !/does not exist/i.test(error.message)) throw error;
      }
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
      const activationSource=['complimentary','manual_override','migration'].includes(text(body.activationSource))
        ?text(body.activationSource):'manual_override';
      const overrideReason=text(body.overrideReason);
      if(!overrideReason)throw new Error('A reason is required for a non-payment subscription activation.');
      await organizationRef.set({
        plan:planId,quotas:planData.quotas||{},featureEntitlements:planData.features||{},
        billingAccessSuspended:false,billingSuspendedReason:null,updatedAt:FieldValue.serverTimestamp(),
      }, { merge: true });
      await organizationRef.collection('subscription').doc('current').set({
        organizationId,planId,status:'active',activationSource,overrideReason,
        billingProvider:text(body.billingProvider)||'manual',
        externalCustomerId:text(body.externalCustomerId)||null,
        externalSubscriptionId:text(body.externalSubscriptionId)||null,
        startedAt:FieldValue.serverTimestamp(),activatedAt:FieldValue.serverTimestamp(),
        activatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      }, { merge: true });
      await writeTenantAudit(ctx, 'subscription.assign', organizationRef.path, before, {
        plan:planId,activationSource,overrideReason,quotas:planData.quotas||{},featureEntitlements:planData.features||{},
      });
      return res.status(200).json({ ok: true, organizationId, planId, status: 'active' });
    }

    if (action === 'activateSubscription' || action === 'reactivateSubscription') {
      const organizationId = text(body.organizationId);
      if (!organizationId) throw new Error('Organization is required.');
      const subscriptionRef = ctx.db.doc(`organizations/${organizationId}/subscription/current`);
      const snapshot = await subscriptionRef.get();
      if (!snapshot.exists) throw new Error('The organization has no subscription record.');
      const before = snapshot.data();
      const overrideReason=text(body.overrideReason);
      if(!overrideReason)throw new Error('A reason is required for a non-payment subscription activation.');
      await subscriptionRef.set({
        status:'active',activationSource:'manual_override',overrideReason,
        activatedAt:FieldValue.serverTimestamp(),activatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      }, { merge: true });
      await writeTenantAudit(ctx, `subscription.${action === 'activateSubscription' ? 'activate' : 'reactivate'}`, subscriptionRef.path, before, {
        status:'active',activationSource:'manual_override',overrideReason,
      });
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
