import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authenticateTenant, billingTenantAudienceEnabled, billingTenantFromContext, billingTenantRef,
  billingTenantSubscriptionRef, billingTenantSubscriptionTermBlockReason, billingTenantUsageSnapshot,
  ensureBillingTenantDefaultSubscription, validateBillingTenantPlanCapacity, writeTenantAudit,
  type BillingTenantType,
} from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';
import { deletePayableItem, upsertPayableItem } from '../../server/payments/core.js';
import { registeredPaymentProviderKeys } from '../../server/payments/providers.js';
import { loadPlatformBillingSettings, quoteSubscriptionPlanForTenant, refreshPlatformBillingRate, SAAS_BASE_CURRENCY, ZAMBIA_BILLING_CURRENCY } from '../../server/billing.js';
import { sendFreeTierUpgradeReminder } from '../../server/subscriptionReminders.js';
import { SUBSCRIPTION_QUOTAS, normalizeSubscriptionFeatures, normalizeSubscriptionQuotas, subscriptionQuotaLimit } from '../../shared/subscriptions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
function text(value: unknown, fallback = '') { return String(value ?? fallback).trim(); }
function object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function planErrorStatus(error:unknown){
  const message=error instanceof Error?error.message:'';
  if(/sign in|authentication/i.test(message))return 401;
  if(/only the VOP Super Admin|outside your|cannot access|permission|authorized/i.test(message))return 403;
  if(/does not exist|not found|no subscription record|organization is not available/i.test(message))return 404;
  if(/below the organization|already has|already active|only an active|one-time subscription|scheduled cancellation|cannot be deleted/i.test(message))return 409;
  return 400;
}
function timestampIso(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const candidate=value as { toDate?:()=>Date; seconds?:number };
  if (typeof candidate.toDate === 'function') return candidate.toDate().toISOString();
  if (typeof candidate.seconds === 'number') return new Date(candidate.seconds*1000).toISOString();
  return '';
}
function periodFor(intervalValue:unknown,startValue:Date=new Date()){
  const interval=['month','year','one_time'].includes(text(intervalValue))?text(intervalValue):'month';
  const start=new Date(startValue);
  if(interval==='one_time')return {interval,start:start.toISOString(),end:null as string|null};
  const end=new Date(start);
  if(interval==='year')end.setUTCFullYear(end.getUTCFullYear()+1);
  else end.setUTCMonth(end.getUTCMonth()+1);
  return {interval,start:start.toISOString(),end:end.toISOString()};
}
function planSnapshot(planId:string,data:Record<string,unknown>){
  return {
    id:planId,
    name:text(data.name),
    description:text(data.description),
    interval:text(data.interval,'month'),
    version:Math.max(1,Math.trunc(Number(data.version)||1)),
    priceUsd:Number(data.priceUsd ?? data.price ?? 0),
    baseCurrency:text(data.baseCurrency,SAAS_BASE_CURRENCY),
    quotas:normalizeSubscriptionQuotas(data.quotas),
    features:normalizeSubscriptionFeatures(data.features),
  };
}

const BILLING_TENANT_TYPES=new Set<BillingTenantType>(['organization','church','district','conference','union']);

function normalizedBillingTenantType(value:unknown):BillingTenantType{
  const candidate=text(value) as BillingTenantType;
  if(!BILLING_TENANT_TYPES.has(candidate))throw new Error('Choose a valid institutional billing tenant type.');
  return candidate;
}

function targetFromRequest(
  ctx:Awaited<ReturnType<typeof authenticateTenant>>,
  body:Record<string,unknown>,
){
  if(!ctx.isSuperAdmin){
    const inferred=billingTenantFromContext(ctx);
    if(!inferred)throw new Error('This account is not linked to an institutional billing tenant.');
    return inferred;
  }
  const organizationId=text(body.organizationId);
  const explicitId=text(body.billingTenantId);
  const type=body.billingTenantType!==undefined
    ?normalizedBillingTenantType(body.billingTenantType)
    :organizationId?'organization':explicitId?normalizedBillingTenantType(body.billingTenantType||'organization'):'organization';
  const id=explicitId||organizationId;
  if(!id)throw new Error('Choose an institutional billing tenant.');
  return {type,id};
}

function selfServiceManager(
  ctx:Awaited<ReturnType<typeof authenticateTenant>>,
  target:{type:BillingTenantType;id:string},
){
  if(ctx.isSuperAdmin)return true;
  const own=billingTenantFromContext(ctx);
  if(!own||own.type!==target.type||own.id!==target.id)return false;
  if(target.type==='organization'){
    const role=text(ctx.membership?.role||ctx.profile.organizationRole);
    return ['owner','admin'].includes(role);
  }
  return ctx.tenantType==='hierarchy';
}

function tenantLabel(type:BillingTenantType){
  return type==='organization'?'organization':type;
}

async function tenantSnapshotOrThrow(
  ctx:Awaited<ReturnType<typeof authenticateTenant>>,
  target:{type:BillingTenantType;id:string},
){
  const ref=billingTenantRef(ctx.db,target.type,target.id);
  const snapshot=await ref.get();
  if(!snapshot.exists)throw new Error('The '+tenantLabel(target.type)+' billing tenant is not available.');
  const data=snapshot.data()||{};
  const status=text(data.status).toLowerCase();
  if(target.type==='organization'&&status!=='active')throw new Error('The organization is not available.');
  if(target.type!=='organization'&&['inactive','disabled','archived','deleted'].includes(status)){
    throw new Error('The '+target.type+' billing tenant is not available.');
  }
  return {ref,snapshot,data};
}

function targetResponse(target:{type:BillingTenantType;id:string}){
  return {
    billingTenantType:target.type,
    billingTenantId:target.id,
    organizationId:target.type==='organization'?target.id:'',
  };
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = object(req.body);
    const action = text(body.action, 'listPlans');
    const requestedOrganizationId = text(body.organizationId);
    const ctx = await authenticateTenant(req, requestedOrganizationId || undefined);
    const readActions=['listPlans','listAvailablePlans','getSubscription','getBillingSettings'];
    const selfServiceActions=['activateFreePlan','cancelSubscription','reactivateSubscription'];
    await requirePermission(ctx, 'billing', readActions.includes(action) ? 'view' : selfServiceActions.includes(action) ? 'update' : 'manage');

    if (action === 'listPlans') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can access subscription package administration.');
      const snapshot = await ctx.db.collection('system/plans/catalog').orderBy('sortOrder', 'asc').get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'listAvailablePlans') {
      const target=targetFromRequest(ctx,body);
      if(!selfServiceManager(ctx,target)&&!ctx.isSuperAdmin){
        throw new Error('Only an institutional tenant administrator can view subscription packages for this tenant.');
      }
      const audienceEnabled=await billingTenantAudienceEnabled(ctx.db,target.type);
      const snapshot = await ctx.db.collection('system/plans/catalog').where('active', '==', true).get();
      const items = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data() || {};
        const quote=audienceEnabled?await quoteSubscriptionPlanForTenant(ctx.db,target.type,target.id,data):null;
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
      return res.status(200).json({ ok: true, ...targetResponse(target), subscriptionRequired:audienceEnabled, items });
    }

    if (action === 'getBillingSettings') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can access platform billing settings.');
      const settings=await loadPlatformBillingSettings(ctx.db);
      return res.status(200).json({ok:true,item:settings});
    }

    if (action === 'refreshBillingRate') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can refresh platform billing rates.');
      const before=await loadPlatformBillingSettings(ctx.db);
      const rate=await refreshPlatformBillingRate(ctx.db);
      await writeTenantAudit(ctx,'billing.fx.refresh','system/billing',before,{
        usdToZmwRate:rate.rate,fxSource:rate.source,fxUpdatedAt:rate.fetchedAt,fxProviderDate:rate.providerDate,
      });
      return res.status(200).json({ok:true,item:await loadPlatformBillingSettings(ctx.db)});
    }

    if (action === 'updateBillingSettings') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can change platform billing settings.');
      const currentSettings=await loadPlatformBillingSettings(ctx.db);
      const suppliedRate=body.usdToZmwRate!==undefined&&body.usdToZmwRate!==null&&String(body.usdToZmwRate).trim()!=='';
      const requestedRate=suppliedRate?Number(body.usdToZmwRate):currentSettings.usdToZmwRate;
      if(suppliedRate&&(!Number.isFinite(requestedRate)||requestedRate<=0))throw new Error('Enter a valid USD to ZMW exchange rate.');
      const usdToZmwRate=Number.isFinite(requestedRate)&&requestedRate>0?requestedRate:0;
      const fxQuoteTtlMinutes=Math.max(15,Math.min(10080,Math.trunc(Number(body.fxQuoteTtlMinutes)||currentSettings.fxQuoteTtlMinutes||1440)));
      const fxSource=text(body.fxSource,currentSettings.fxSource||'platform-configured');
      const audienceInput=object(body.subscriptionAudience);
      const data={
        baseCurrency:SAAS_BASE_CURRENCY,zambiaCurrency:ZAMBIA_BILLING_CURRENCY,
        usdToZmwRate,fxSource,fxUpdatedAt:suppliedRate?new Date().toISOString():currentSettings.fxUpdatedAt,fxQuoteTtlMinutes,
        subscriptionAudience:{
          learnersCandidates:audienceInput.learnersCandidates===true,
          organizations:audienceInput.organizations!==false,
          churches:audienceInput.churches!==false,
          districts:audienceInput.districts!==false,
          conferences:audienceInput.conferences!==false,
          unions:audienceInput.unions!==false,
        },
        updatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      };
      const ref=ctx.db.doc('system/billing');
      const before=(await ref.get()).data();
      await ref.set({...data,createdAt:before?.createdAt||FieldValue.serverTimestamp()},{merge:true});
      await writeTenantAudit(ctx,'billing.fx.update',ref.path,before,data);
      return res.status(200).json({ok:true,item:data});
    }

    if (action === 'getSubscription') {
      const target=targetFromRequest(ctx,body);
      if(!selfServiceManager(ctx,target)&&!ctx.isSuperAdmin){
        throw new Error('You cannot access another institutional tenant subscription.');
      }
      const audienceEnabled=await billingTenantAudienceEnabled(ctx.db,target.type);
      if(audienceEnabled)await ensureBillingTenantDefaultSubscription(ctx.db,target.type,target.id,ctx.auth.uid);
      const [{data:tenantData},subscription,usage,billingSettings]=await Promise.all([
        tenantSnapshotOrThrow(ctx,target),
        billingTenantSubscriptionRef(ctx.db,target.type,target.id).get(),
        billingTenantUsageSnapshot(ctx.db,target.type,target.id),
        loadPlatformBillingSettings(ctx.db),
      ]);
      const currentPlanId=text(tenantData.plan);
      const catalogPlan=currentPlanId?await ctx.db.doc(`system/plans/catalog/${currentPlanId}`).get():null;
      const subscriptionData=subscription.exists?subscription.data()||{}:null;
      const liveTermBlock=audienceEnabled
        ?await billingTenantSubscriptionTermBlockReason(ctx.db,target.type,target.id)
        :null;
      const storedSuspended=audienceEnabled&&tenantData.billingAccessSuspended===true;
      const storedSubscriptionStatus=text(subscriptionData?.status).toLowerCase();
      const liveExpired=Boolean(liveTermBlock&&['active','trialing'].includes(storedSubscriptionStatus));
      const effectiveSubscriptionStatus=liveExpired?'expired':storedSubscriptionStatus;
      const subscriptionSnapshot=subscriptionData?.planSnapshot&&typeof subscriptionData.planSnapshot==='object'
        ?subscriptionData.planSnapshot as Record<string,unknown>:{};
      const planPriceUsd=Number(subscriptionSnapshot.priceUsd??catalogPlan?.data()?.priceUsd??catalogPlan?.data()?.price??NaN);
      const freeTier=audienceEnabled&&['active','trialing'].includes(effectiveSubscriptionStatus)
        &&Number.isFinite(planPriceUsd)&&planPriceUsd===0;
      const exhaustedQuotaKeys=audienceEnabled?SUBSCRIPTION_QUOTAS
        .filter(definition=>{
          if(definition.key==='maxCandidates'&&!billingSettings.subscriptionAudience.learnersCandidates)return false;
          const limit=subscriptionQuotaLimit(tenantData.quotas||{},definition.key);
          const used=Math.max(0,Number((usage as Record<string,unknown>)[definition.usageKey]||0));
          return limit!==null&&used>=limit;
        })
        .map(definition=>definition.key):[];
      if(target.type==='organization'&&!ctx.isSuperAdmin&&freeTier
          &&['owner','admin'].includes(text(ctx.membership?.role||ctx.profile.organizationRole))){
        await sendFreeTierUpgradeReminder(ctx.db,target.id).catch(()=>undefined);
      }
      return res.status(200).json({
        ok:true,
        ...targetResponse(target),
        tenantName:text(tenantData.name||tenantData.title,target.id),
        organizationName:target.type==='organization'?text(tenantData.name,target.id):'',
        plan:currentPlanId||null,
        catalogPlan:catalogPlan?.exists?{id:catalogPlan.id,...catalogPlan.data()}:null,
        subscription:subscriptionData?{
          ...subscriptionData,
          status:effectiveSubscriptionStatus||subscriptionData.status,
          currentPeriodStart:text(subscriptionData.currentPeriodStart)||timestampIso(subscriptionData.startedAt),
          currentPeriodEnd:text(subscriptionData.currentPeriodEnd)||null,
          activatedAt:timestampIso(subscriptionData.activatedAt)||text(subscriptionData.activatedAt),
          cancelledAt:timestampIso(subscriptionData.cancelledAt)||text(subscriptionData.cancelledAt),
          cancellationRequestedAt:timestampIso(subscriptionData.cancellationRequestedAt)||text(subscriptionData.cancellationRequestedAt),
          updatedAt:timestampIso(subscriptionData.updatedAt)||text(subscriptionData.updatedAt),
        }:null,
        quotas:tenantData.quotas||{},
        featureEntitlements:audienceEnabled?(tenantData.featureEntitlements||{}):{},
        usage,
        billingProfile:tenantData.billingProfile||{},
        subscriptionAudience:billingSettings.subscriptionAudience,
        subscriptionRequired:audienceEnabled,
        freeTier,
        paidPlanActive:audienceEnabled&&['active','trialing'].includes(effectiveSubscriptionStatus)
          &&Number.isFinite(planPriceUsd)&&planPriceUsd>0,
        exhaustedQuotaKeys,
        billingAccessSuspended:storedSuspended||Boolean(liveTermBlock),
        billingSuspendedReason:audienceEnabled
          ?text(tenantData.billingSuspendedReason)||(liveExpired?'subscription_expired':liveTermBlock?'subscription_inactive':'')
          :'subscription_not_required',
        billingSuspendedMessage:liveTermBlock||'',
      });
    }

    if (!ctx.isSuperAdmin && action === 'activateFreePlan') {
      const target=targetFromRequest(ctx,body);
      if(!selfServiceManager(ctx,target)){
        throw new Error('Only the administrator of this institutional tenant can activate a free subscription package.');
      }
      if(!(await billingTenantAudienceEnabled(ctx.db,target.type))){
        return res.status(200).json({ok:true,...targetResponse(target),status:'not_required',alreadyActive:true,currentPeriodEnd:null});
      }
      const planId=text(body.planId);
      if(!planId)throw new Error('Choose a subscription plan.');
      const {ref:tenantRef,snapshot:tenant}=await tenantSnapshotOrThrow(ctx,target);
      const planRef=ctx.db.doc(`system/plans/catalog/${planId}`);
      const plan=await planRef.get();
      if(!plan.exists||plan.data()?.active!==true)throw new Error('The selected plan is not active.');
      const planData=plan.data()||{};
      const priceUsd=Number(planData.priceUsd??planData.price??0);
      if(!Number.isFinite(priceUsd)||priceUsd!==0){
        throw new Error('Paid subscription packages must be activated through secure checkout.');
      }
      const snapshot=planSnapshot(planId,planData);
      await validateBillingTenantPlanCapacity(ctx.db,target.type,target.id,snapshot.quotas);
      const subscriptionRef=billingTenantSubscriptionRef(ctx.db,target.type,target.id);
      const previousSubscription=await subscriptionRef.get();
      const previous=previousSubscription.data()||{};
      if(previousSubscription.exists&&previous.status==='active'&&text(previous.planId)===planId
          &&!previous.currentPeriodEnd&&tenant.data()?.billingAccessSuspended!==true){
        return res.status(200).json({ok:true,...targetResponse(target),planId,status:'active',alreadyActive:true,currentPeriodEnd:null});
      }
      const startedAt=new Date().toISOString();
      await tenantRef.set({
        plan:planId,quotas:snapshot.quotas,featureEntitlements:snapshot.features,
        billingAccessSuspended:false,billingSuspendedReason:null,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await subscriptionRef.set({
        ...targetResponse(target),
        planId,planName:snapshot.name,planInterval:snapshot.interval,planVersion:snapshot.version,
        planSnapshot:snapshot,status:'active',activationSource:'free_plan',
        billingProvider:'none',externalCustomerId:null,externalSubscriptionId:null,
        baseCurrency:SAAS_BASE_CURRENCY,baseAmountDecimal:'0.00',
        billingCurrency:SAAS_BASE_CURRENCY,paidAmountDecimal:'0.00',exchangeRate:1,
        currentPeriodStart:startedAt,currentPeriodEnd:null,
        renewalMode:'none',cancelAtPeriodEnd:false,
        previousPlanId:text(previous.planId)||null,
        startedAt:FieldValue.serverTimestamp(),activatedAt:FieldValue.serverTimestamp(),
        activatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      },{merge:false});
      await writeTenantAudit(ctx,'subscription.free_activate',subscriptionRef.path,previous,{
        ...targetResponse(target),planId,activationSource:'free_plan',planSnapshot:snapshot,
        currentPeriodStart:startedAt,currentPeriodEnd:null,
      });
      return res.status(200).json({ok:true,...targetResponse(target),planId,status:'active',currentPeriodEnd:null});
    }

    if (!ctx.isSuperAdmin && (action === 'cancelSubscription' || action === 'reactivateSubscription')) {
      const target=targetFromRequest(ctx,body);
      if(!selfServiceManager(ctx,target)){
        throw new Error('Only the administrator of this institutional tenant can manage this subscription.');
      }
      if(!(await billingTenantAudienceEnabled(ctx.db,target.type))){
        return res.status(200).json({ok:true,...targetResponse(target),status:'not_required',cancelAtPeriodEnd:false});
      }
      const subscriptionRef=billingTenantSubscriptionRef(ctx.db,target.type,target.id);
      const snapshot=await subscriptionRef.get();
      if(!snapshot.exists)throw new Error('This institutional tenant has no subscription record.');
      const before=snapshot.data()||{};
      if(action==='cancelSubscription'){
        if(before.status!=='active')throw new Error('Only an active subscription can be scheduled for cancellation.');
        if(text(before.planInterval||object(before.planSnapshot).interval)==='one_time'){
          throw new Error('One-time subscriptions do not have a recurring renewal to cancel.');
        }
        const reason=text(body.reason,'Requested by institutional tenant administrator');
        await subscriptionRef.set({
          cancelAtPeriodEnd:true,cancellationReason:reason,
          cancellationRequestedAt:FieldValue.serverTimestamp(),cancellationRequestedBy:ctx.auth.uid,
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        await writeTenantAudit(ctx,'subscription.cancel_scheduled',subscriptionRef.path,before,{
          ...targetResponse(target),status:'active',cancelAtPeriodEnd:true,cancellationReason:reason,
        });
        return res.status(200).json({
          ok:true,...targetResponse(target),status:'active',cancelAtPeriodEnd:true,
          currentPeriodEnd:text(before.currentPeriodEnd)||null,
        });
      }
      if(before.status!=='active'||before.cancelAtPeriodEnd!==true){
        throw new Error('Only a scheduled cancellation can be resumed without a new payment.');
      }
      await subscriptionRef.set({
        cancelAtPeriodEnd:false,cancellationReason:null,cancellationRequestedAt:null,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await writeTenantAudit(ctx,'subscription.cancellation_resumed',subscriptionRef.path,before,{
        ...targetResponse(target),status:'active',cancelAtPeriodEnd:false,
      });
      return res.status(200).json({ok:true,...targetResponse(target),status:'active',cancelAtPeriodEnd:false});
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
      const ref = ctx.db.doc(`system/plans/catalog/${planId}`);
      const before = (await ref.get()).data();
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
        defaultForUnsubscribed:priceUsd===0 && body.active!==false && body.defaultForUnsubscribed===true,
        quotas: normalizeSubscriptionQuotas(body.quotas),
        features: normalizeSubscriptionFeatures(body.features),
        version:Math.max(1,Math.trunc(Number(before?.version)||0)+1),
        externalPriceId: text(body.externalPriceId) || null,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await ref.set({ ...data, createdAt: before?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
      if(data.defaultForUnsubscribed){
        const defaults=await ctx.db.collection('system/plans/catalog').where('defaultForUnsubscribed','==',true).get();
        const batch=ctx.db.batch();
        let changed=false;
        for(const document of defaults.docs){
          if(document.id===planId)continue;
          batch.set(document.ref,{defaultForUnsubscribed:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
          changed=true;
        }
        if(changed)await batch.commit();
      }

      const subscriptionPayableId='subscription_'+planId;
      if (data.active && data.priceUsd > 0) {
        await upsertPayableItem(ctx, {
          id:subscriptionPayableId,
          name:data.name,
          description:data.description || (data.name+' institutional subscription'),
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
      const collections:Array<[BillingTenantType,string]>=[
        ['organization','organizations'],['church','churches'],['district','districts'],
        ['conference','conferences'],['union','unions'],
      ];
      for(const [type,collection] of collections){
        const assigned=await ctx.db.collection(collection).where('plan','==',planId).limit(1).get();
        if(!assigned.empty){
          throw new Error('A plan assigned to an active institutional tenant cannot be deleted. Migrate those tenants first.');
        }
      }
      await ref.delete();
      try { await deletePayableItem(ctx,'subscription_'+planId); } catch (error) {
        if (!(error instanceof Error) || !/does not exist/i.test(error.message)) throw error;
      }
      await writeTenantAudit(ctx, 'plan.delete', ref.path, snapshot.data(), undefined);
      return res.status(200).json({ ok: true, deleted: planId });
    }

    if (action === 'assignPlan') {
      const target=targetFromRequest(ctx,body);
      const planId=text(body.planId);
      if(!planId)throw new Error('Institutional tenant and plan are required.');
      const [{ref:tenantRef,data:tenantData},plan]=await Promise.all([
        tenantSnapshotOrThrow(ctx,target),
        ctx.db.doc(`system/plans/catalog/${planId}`).get(),
      ]);
      if(!plan.exists||plan.data()?.active!==true)throw new Error('The selected plan is not active.');
      const snapshot=planSnapshot(planId,plan.data()||{});
      await validateBillingTenantPlanCapacity(ctx.db,target.type,target.id,snapshot.quotas);
      const subscriptionRef=billingTenantSubscriptionRef(ctx.db,target.type,target.id);
      const previousSubscription=await subscriptionRef.get();
      const activationSource=['complimentary','manual_override','migration'].includes(text(body.activationSource))
        ?text(body.activationSource):'manual_override';
      const overrideReason=text(body.overrideReason);
      if(!overrideReason)throw new Error('A reason is required for a non-payment subscription activation.');
      const period=snapshot.priceUsd===0
        ?{interval:snapshot.interval,start:new Date().toISOString(),end:null as string|null}
        :periodFor(snapshot.interval);
      await tenantRef.set({
        plan:planId,quotas:snapshot.quotas,featureEntitlements:snapshot.features,
        billingAccessSuspended:false,billingSuspendedReason:null,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await subscriptionRef.set({
        ...targetResponse(target),
        planId,planName:snapshot.name,planInterval:snapshot.interval,planVersion:snapshot.version,
        planSnapshot:snapshot,status:'active',activationSource,overrideReason,
        billingProvider:text(body.billingProvider)||'manual',
        externalCustomerId:text(body.externalCustomerId)||null,
        externalSubscriptionId:text(body.externalSubscriptionId)||null,
        currentPeriodStart:period.start,currentPeriodEnd:period.end,
        renewalMode:'manual',cancelAtPeriodEnd:false,
        previousPlanId:text(previousSubscription.data()?.planId)||null,
        startedAt:FieldValue.serverTimestamp(),activatedAt:FieldValue.serverTimestamp(),
        activatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      },{merge:false});
      await writeTenantAudit(ctx,'subscription.assign',tenantRef.path,tenantData,{
        ...targetResponse(target),plan:planId,activationSource,overrideReason,planSnapshot:snapshot,
        currentPeriodStart:period.start,currentPeriodEnd:period.end,
      });
      return res.status(200).json({
        ok:true,...targetResponse(target),planId,status:'active',currentPeriodEnd:period.end,
      });
    }

    if (action === 'activateSubscription' || action === 'reactivateSubscription') {
      const target=targetFromRequest(ctx,body);
      const {ref:tenantRef,data:tenantData}=await tenantSnapshotOrThrow(ctx,target);
      const subscriptionRef=billingTenantSubscriptionRef(ctx.db,target.type,target.id);
      const snapshot=await subscriptionRef.get();
      if(!snapshot.exists)throw new Error('This institutional tenant has no subscription record.');
      const before=snapshot.data()||{};
      const planId=text(before.planId||tenantData.plan);
      const plan=planId?await ctx.db.doc(`system/plans/catalog/${planId}`).get():null;
      if(!plan?.exists||plan.data()?.active!==true)throw new Error('The subscription plan is not active.');
      const snapshotPlan=planSnapshot(planId,plan.data()||{});
      await validateBillingTenantPlanCapacity(ctx.db,target.type,target.id,snapshotPlan.quotas);
      const overrideReason=text(body.overrideReason);
      if(!overrideReason)throw new Error('A reason is required for a non-payment subscription activation.');
      const wasScheduled=before.status==='active'&&before.cancelAtPeriodEnd===true;
      const existingEnd=Date.parse(text(before.currentPeriodEnd));
      const keepCurrentTerm=wasScheduled&&(!Number.isFinite(existingEnd)||existingEnd>Date.now());
      const period=snapshotPlan.priceUsd===0
        ?{interval:snapshotPlan.interval,start:text(before.currentPeriodStart)||new Date().toISOString(),end:null as string|null}
        :keepCurrentTerm
          ?{interval:snapshotPlan.interval,start:text(before.currentPeriodStart)||new Date().toISOString(),end:text(before.currentPeriodEnd)||null}
          :periodFor(snapshotPlan.interval);
      await tenantRef.set({
        plan:planId,quotas:snapshotPlan.quotas,featureEntitlements:snapshotPlan.features,
        billingAccessSuspended:false,billingSuspendedReason:null,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await subscriptionRef.set({
        ...targetResponse(target),
        planId,planName:snapshotPlan.name,planInterval:snapshotPlan.interval,planVersion:snapshotPlan.version,
        planSnapshot:snapshotPlan,status:'active',activationSource:'manual_override',overrideReason,
        currentPeriodStart:period.start,currentPeriodEnd:period.end,
        cancelAtPeriodEnd:false,cancellationReason:null,cancellationRequestedAt:null,
        activatedAt:FieldValue.serverTimestamp(),activatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await writeTenantAudit(ctx,`subscription.${action==='activateSubscription'?'activate':'reactivate'}`,subscriptionRef.path,before,{
        ...targetResponse(target),status:'active',activationSource:'manual_override',overrideReason,planId,
        currentPeriodStart:period.start,currentPeriodEnd:period.end,cancelAtPeriodEnd:false,
      });
      return res.status(200).json({
        ok:true,...targetResponse(target),status:'active',currentPeriodEnd:period.end,
      });
    }

    if (action === 'cancelSubscription') {
      const target=targetFromRequest(ctx,body);
      const {ref:tenantRef}=await tenantSnapshotOrThrow(ctx,target);
      const subscriptionRef=billingTenantSubscriptionRef(ctx.db,target.type,target.id);
      const snapshot=await subscriptionRef.get();
      if(!snapshot.exists)throw new Error('This institutional tenant has no subscription record.');
      const before=snapshot.data()||{};
      const mode=text(body.mode)==='immediate'?'immediate':'period_end';
      const reason=text(body.reason);
      if(!reason)throw new Error('A cancellation reason is required.');
      const interval=text(before.planInterval||object(before.planSnapshot).interval);
      if(mode==='period_end'&&interval!=='one_time'){
        await subscriptionRef.set({
          cancelAtPeriodEnd:true,cancellationReason:reason,cancellationRequestedAt:FieldValue.serverTimestamp(),
          cancellationRequestedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        await writeTenantAudit(ctx,'subscription.cancel_scheduled',subscriptionRef.path,before,{
          ...targetResponse(target),status:text(before.status,'active'),cancelAtPeriodEnd:true,cancellationReason:reason,
        });
        return res.status(200).json({
          ok:true,...targetResponse(target),status:text(before.status,'active'),cancelAtPeriodEnd:true,
          currentPeriodEnd:text(before.currentPeriodEnd)||null,
        });
      }
      await Promise.all([
        subscriptionRef.set({
          status:'cancelled',cancelAtPeriodEnd:false,cancellationReason:reason,
          cancelledAt:FieldValue.serverTimestamp(),cancelledBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
        },{merge:true}),
        tenantRef.set({
          billingAccessSuspended:true,billingSuspendedReason:'subscription_cancelled',
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true}),
      ]);
      await writeTenantAudit(ctx,'subscription.cancel',subscriptionRef.path,before,{
        ...targetResponse(target),status:'cancelled',cancelAtPeriodEnd:false,cancellationReason:reason,
      });
      return res.status(200).json({
        ok:true,...targetResponse(target),status:'cancelled',cancelAtPeriodEnd:false,
      });
    }

    throw new Error('Unsupported plan action.');
  } catch (error) {
    return res.status(planErrorStatus(error)).json({ error: error instanceof Error ? error.message : 'Plan request failed.' });
  }
}
