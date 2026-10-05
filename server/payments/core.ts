import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldValue, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  PAYABLE_ITEM_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES,
  amountToMinor, canTransitionPaymentStatus, minorToDecimal, normalizeCurrency,
  normalizePhone, safePaymentId, safeReference,
  type PayableItem, type PaymentMethod, type PaymentRefund, type PaymentStatus, type PaymentTransaction,
} from '../../shared/payments.js';
import { normalizeSubscriptionFeatures, normalizeSubscriptionQuotas } from '../../shared/subscriptions.js';
import {
  accessibleOrganizationIds, authenticateTenant, billingTenantAudienceEnabled, billingTenantFromContext,
  billingTenantRef, billingTenantSubscriptionRef, organizationInHierarchyScope, tenantOwnerKey,
  validateBillingTenantPlanCapacity, writeTenantAudit, type BillingTenantType, type TenantContext,
} from '../tenant.js';
import { requirePermission } from '../permissions.js';
import { organizationBillingProfile, quoteAmountForCurrency, quoteSubscriptionPlanForTenant } from '../billing.js';
import {
  getPaymentProvider, paymentProviderCatalog, providerSettlementCountry, providerSettlementCurrency, registeredPaymentProviderKeys,
  type ProviderVerification,
} from './providers.js';

type RequestLike={headers?:Record<string,string|string[]|undefined>};
function text(value:unknown,fallback=''){return String(value??fallback).trim();}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function bool(value:unknown,fallback=false){return typeof value==='boolean'?value:fallback;}
function stringArray(value:unknown){return Array.isArray(value)?value.map(item=>text(item)).filter(Boolean):[];}
function nowIso(){return new Date().toISOString();}
const BILLING_TENANT_TYPES=new Set<BillingTenantType>(['organization','church','district','conference','union']);
function paymentBillingTarget(data:DocumentData){
  const organizationId=text(data.organizationId);
  const candidate=text(data.billingTenantType) as BillingTenantType;
  const type=BILLING_TENANT_TYPES.has(candidate)?candidate:(organizationId?'organization':null);
  const id=text(data.billingTenantId)||(type==='organization'?organizationId:'');
  return type&&id?{type,id}:null;
}
function timestampIso(value:unknown){
  if(!value)return '';
  if(typeof value==='string')return value;
  if(value&&typeof value==='object'&&'toDate' in value&&typeof (value as {toDate?:()=>Date}).toDate==='function'){
    return (value as {toDate:()=>Date}).toDate().toISOString();
  }
  return '';
}
function hash(value:string){return createHash('sha256').update(value).digest('hex');}
function safeMetadata(value:unknown){
  const input=object(value),output:Record<string,unknown>={};
  for(const [key,val] of Object.entries(input).slice(0,30)){
    if(!/^[A-Za-z0-9_.-]{1,80}$/.test(key))continue;
    if(typeof val==='string')output[key]=val.slice(0,500);
    else if(typeof val==='number'&&Number.isFinite(val))output[key]=val;
    else if(typeof val==='boolean'||val===null)output[key]=val;
  }
  return output;
}
function webhookIdentityPayload(value:unknown){
  const data=object(value);
  return JSON.stringify(data,Object.keys(data).sort()).slice(0,4000);
}

function publicError(error:unknown,fallback='Payment request failed.'){
  const message=error instanceof Error?error.message:fallback;
  if(/token|secret|credential|private key|authorization/i.test(message))return fallback;
  return message.slice(0,280)||fallback;
}
function statusIsActive(status:unknown){
  return ['draft','initiated','pending','requires_action','processing'].includes(text(status));
}

export async function paymentContext(req:RequestLike,organizationId?:string){
  return authenticateTenant(req,organizationId||undefined,true);
}

export async function enforcePaymentRateLimit(
  ctx:TenantContext,key:string,limit=12,windowMs=60_000,
){
  const actor=ctx.auth.uid||'anonymous';
  const bucket=Math.floor(Date.now()/windowMs);
  const ref=ctx.db.doc('paymentRateLimits/'+hash(actor+':'+key+':'+bucket));
  await ctx.db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const count=Number(snap.data()?.count||0);
    if(count>=limit)throw new Error('Too many payment requests. Please wait before trying again.');
    tx.set(ref,{actorUid:actor,key,bucket,count:count+1,expiresAt:new Date((bucket+2)*windowMs).toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
}

async function paymentAudit(db:Firestore,paymentId:string,action:string,actor:string,data:Record<string,unknown>={}){
  await db.collection('paymentTransactions').doc(paymentId).collection('audit').add({
    action,actor,data:safeMetadata(data),createdAt:FieldValue.serverTimestamp(),
  });
}

async function providerConfig(db:Firestore,key:string){
  const adapter=getPaymentProvider(key);
  const snap=await db.doc('paymentProviderConfigs/'+key).get();
  const data=snap.data()||{};
  const publicConfig=adapter.publicConfiguration();
  const adapterMethods=stringArray(publicConfig.methods).filter(method=>PAYMENT_METHODS.includes(method as never));
  const storedMethods=stringArray(data.methods).filter(method=>PAYMENT_METHODS.includes(method as never));
  const desiredMethods=storedMethods.length?storedMethods:adapterMethods;
  return {
    key,
    enabled:snap.exists?data.enabled!==false:adapter.configured(),
    // Persisted administration may narrow live capabilities, never widen them.
    methods:desiredMethods.filter(method=>adapterMethods.includes(method)),
    environment:text(publicConfig.environment),
    configured:adapter.configured(),
    capabilities:adapter.capabilities,
  };
}

export async function safeProviderCatalog(db:Firestore){
  const base=paymentProviderCatalog();
  return Promise.all(base.map(async item=>{
    const config=await providerConfig(db,text(item.key));
    return {...item,...config};
  }));
}

async function validateTarget(
  db:Firestore,itemType:string,itemId:string,organizationId:string,
):Promise<Record<string,unknown>>{
  if(itemType==='organization_subscription'){
    const snap=await db.doc('system/plans/catalog/'+itemId).get();
    if(!snap.exists||snap.data()?.active!==true)throw new Error('The selected subscription plan is not active.');
    const data=snap.data()||{};
    return {
      targetCollection:'plans',title:text(data.name)||itemId,
      planSnapshot:{
        id:itemId,name:text(data.name),description:text(data.description),interval:text(data.interval)||'month',
        version:Math.max(1,Math.trunc(Number(data.version)||1)),
        priceUsd:Number(data.priceUsd ?? data.price ?? 0),baseCurrency:text(data.baseCurrency)||'USD',
        quotas:normalizeSubscriptionQuotas(data.quotas),features:normalizeSubscriptionFeatures(data.features),
      },
    };
  }
  if(itemType==='event_registration'){
    const snap=await db.doc('events/'+itemId).get();
    if(!snap.exists)throw new Error('The selected event does not exist.');
    if(organizationId&&text(snap.data()?.organizationId)&&text(snap.data()?.organizationId)!==organizationId)throw new Error('The selected event is outside the payment organization.');
    return {targetCollection:'events',title:text(snap.data()?.title)||itemId};
  }
  if(itemType==='material'){
    const snap=await db.doc('books/'+itemId).get();
    if(!snap.exists)throw new Error('The selected material does not exist.');
    return {targetCollection:'books',title:text(snap.data()?.name)||itemId};
  }
  if(itemType==='programme_registration'){
    const program=await db.doc('programs/'+itemId).get();
    if(program.exists){
      const data=program.data()||{};
      if(organizationId&&text(data.organizationId)&&text(data.organizationId)!==organizationId&&data.sharingScope!=='shared')throw new Error('The selected programme is outside the payment organization.');
      return {targetCollection:'programs',title:text(data.title)||itemId,guideIdsSnapshot:stringArray(data.guideIds)};
    }
    const guide=await db.doc('guides/'+itemId).get();
    if(!guide.exists)throw new Error('The selected programme or guide does not exist.');
    const data=guide.data()||{};
    if(organizationId&&text(data.organizationId)&&text(data.organizationId)!==organizationId&&data.sharingScope!=='shared')throw new Error('The selected guide is outside the payment organization.');
    return {targetCollection:'guides',title:text(data.title)||itemId,guideIdsSnapshot:[itemId]};
  }
  return {targetCollection:itemType,title:itemId};
}

async function assertTargetOrganization(ctx:TenantContext,organizationId:string){
  if(!organizationId)return;
  if(ctx.isSuperAdmin)return;
  if(ctx.tenantType==='organization'){
    if(ctx.organizationId!==organizationId)throw new Error('The organization is outside your scope.');
    return;
  }
  if(ctx.tenantType==='hierarchy'){
    if(!(await organizationInHierarchyScope(ctx,organizationId)))throw new Error('The organization is outside your hierarchy scope.');
    return;
  }
  throw new Error('An authorized organization scope is required.');
}

function requireSuperAdminFinanceControl(ctx:TenantContext,resource:string){
  if(!ctx.isSuperAdmin)throw new Error(`Only Super Admin can access ${resource}.`);
}

async function requireInstitutionalSubscriptionConsumer(ctx:TenantContext){
  if(ctx.isSuperAdmin)return null;
  await requirePermission(ctx,'billing','view');
  const target=billingTenantFromContext(ctx);
  if(!target)throw new Error('This account is not linked to an institutional billing tenant.');
  if(target.type==='organization'){
    const role=text(ctx.membership?.role||ctx.profile.organizationRole);
    if(!['owner','admin'].includes(role)){
      throw new Error('Only an organization owner or administrator can manage the organization subscription.');
    }
  }else if(ctx.tenantType!=='hierarchy'){
    throw new Error('Only an institutional tenant administrator can manage this subscription.');
  }
  if(!(await billingTenantAudienceEnabled(ctx.db,target.type))){
    throw new Error('Subscription billing is not required for this institutional tenant type.');
  }
  return target;
}

export async function upsertPayableItem(ctx:TenantContext,input:Record<string,unknown>){
  await requirePermission(ctx,'payable_items','manage');
  requireSuperAdminFinanceControl(ctx,'payable item management');
  const id=input.id?safePaymentId(input.id,'payable item identifier'):'pay_'+randomUUID().replaceAll('-','');
  const itemType=text(input.itemType);
  if(!PAYABLE_ITEM_TYPES.includes(itemType as never))throw new Error('Select a supported payable item type.');
  const rawItemId=text(input.itemId);
  const requiresLinkedTarget=['programme_registration','event_registration','organization_subscription','material'].includes(itemType);
  if(requiresLinkedTarget&&!rawItemId)throw new Error('Choose the linked payable item.');
  const itemId=rawItemId?safePaymentId(rawItemId,'service or item identifier'):'charge_'+randomUUID().replaceAll('-','');
  const currency=normalizeCurrency(input.currency||'ZMW');
  const amountMinor=amountToMinor(input.amount,currency);
  const scopeRaw=text(input.scope)||(
    ctx.isSuperAdmin?'platform':ctx.tenantType==='hierarchy'?'hierarchy':'organization'
  );
  if(!['platform','organization','hierarchy'].includes(scopeRaw))throw new Error('A valid payment scope is required.');
  const scope=scopeRaw as PayableItem['scope'];
  const organizationId=text(input.organizationId)||(scope==='organization'&&ctx.tenantType==='organization'?ctx.organizationId:'');
  if(scope!=='platform'&&!organizationId)throw new Error('Choose the organization this charge belongs to.');
  if(organizationId)await assertTargetOrganization(ctx,organizationId);
  if(scope==='platform'&&!ctx.isSuperAdmin)throw new Error('Only Super Admin can create platform-wide charges.');

  const providers=stringArray(input.allowedProviders).filter(key=>registeredPaymentProviderKeys().includes(key));
  const methods=stringArray(input.allowedMethods).filter(method=>PAYMENT_METHODS.includes(method as never)) as PaymentMethod[];
  const [target,organizationSnap]=await Promise.all([
    validateTarget(ctx.db,itemType,itemId,organizationId),
    organizationId?ctx.db.doc('organizations/'+organizationId).get():Promise.resolve(null),
  ]);
  const organizationName=organizationSnap?.exists?text(organizationSnap.data()?.name):'';
  const name=text(input.name)||text(target.title)||'VOP payment';
  const ref=ctx.db.doc('payableItems/'+id);
  const before=(await ref.get()).data();
  const data:PayableItem={
    id,scope,tenantId:scope==='platform'?'':tenantOwnerKey(ctx),
    organizationId,organizationName,itemId,itemType:itemType as PayableItem['itemType'],
    name:name.slice(0,180),description:text(input.description).slice(0,1200),
    currency,amountMinor,amountDecimal:minorToDecimal(amountMinor,currency),
    active:input.active!==false,paymentRequired:input.paymentRequired!==false,
    repeatable:bool(input.repeatable,false),
    allowedProviders:providers.length?providers:['lenco'],
    allowedMethods:methods.length?methods:['card','airtel_money','mtn_money','zamtel_money'],
    availabilityStart:text(input.availabilityStart)||null,
    availabilityEnd:text(input.availabilityEnd)||null,
    fulfilmentConfig:{...safeMetadata(input.fulfilmentConfig),...target},
    metadata:safeMetadata(input.metadata),
    createdBy:text(before?.createdBy)||ctx.auth.uid,updatedBy:ctx.auth.uid,
    createdAt:before?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.set(data,{merge:false});
  await writeTenantAudit(ctx,'payable_item.upsert',ref.path,before,data as unknown as DocumentData);
  return {id,...data};
}

export async function deletePayableItem(ctx:TenantContext,idValue:unknown){
  await requirePermission(ctx,'payable_items','manage');
  requireSuperAdminFinanceControl(ctx,'payable item management');
  const id=safePaymentId(idValue,'payable item identifier');
  const ref=ctx.db.doc('payableItems/'+id),snap=await ref.get();
  if(!snap.exists)throw new Error('The payable item does not exist.');
  const data=snap.data()||{};
  await assertTargetOrganization(ctx,text(data.organizationId));
  if(text(data.scope)==='platform'&&!ctx.isSuperAdmin)throw new Error('Only Super Admin can delete platform charges.');
  const used=await ctx.db.collection('paymentTransactions').where('payableItemId','==',id).limit(1).get();
  if(!used.empty){
    await ref.set({active:false,updatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    await writeTenantAudit(ctx,'payable_item.deactivate',ref.path,data,{...data,active:false});
    return {id,active:false,deactivated:true};
  }
  await ref.delete();
  await writeTenantAudit(ctx,'payable_item.delete',ref.path,data,undefined);
  return {id,deleted:true};
}

async function itemVisibleToUser(ctx:TenantContext,data:DocumentData){
  if(data.active!==true)return false;
  const scope=text(data.scope);
  const org=text(data.organizationId);
  if(scope==='platform')return true;
  if(ctx.isSuperAdmin)return true;
  if(ctx.tenantType==='organization')return Boolean(org&&ctx.organizationId===org);
  if(ctx.tenantType==='hierarchy')return Boolean(org&&await organizationInHierarchyScope(ctx,org));
  const profileOrg=text(ctx.profile.organizationId);
  return Boolean(org&&profileOrg===org);
}

async function paymentCountryCode(
  ctx:TenantContext,
  billingTarget:{type:BillingTenantType;id:string}|null,
  organizationId:string,
){
  if(billingTarget){
    const target=await billingTenantRef(ctx.db,billingTarget.type,billingTarget.id).get();
    if(target.exists)return organizationBillingProfile(target.data()).countryCode;
  }
  if(organizationId){
    const organization=await ctx.db.doc('organizations/'+organizationId).get();
    if(organization.exists)return organizationBillingProfile(organization.data()).countryCode;
  }
  const profileBilling=object(ctx.profile.billingProfile);
  const explicit=text(profileBilling.countryCode||ctx.profile.countryCode).toUpperCase();
  return /^[A-Z]{2}$/.test(explicit)?explicit:'';
}

async function consumerPaymentQuotes(
  db:Firestore,
  data:DocumentData,
  amountMinor:number,
  baseCurrency:string,
  billingCountryCode='',
){
  const allowedMethods=stringArray(data.allowedMethods).filter(method=>PAYMENT_METHODS.includes(method as never));
  const configuredProviders=stringArray(data.allowedProviders).filter(key=>registeredPaymentProviderKeys().includes(key));
  const providerKeys=configuredProviders.length?configuredProviders:registeredPaymentProviderKeys();
  const candidates=new Set<PaymentMethod>();
  for(const key of providerKeys){
    let config;
    try{config=await providerConfig(db,key);}catch{continue;}
    if(!config.enabled||!config.configured)continue;
    for(const methodValue of config.methods){
      const method=methodValue as PaymentMethod;
      if((!allowedMethods.length||allowedMethods.includes(method))
        &&PAYMENT_METHODS.includes(method as never)&&method!=='manual'&&method!=='bank')candidates.add(method);
    }
  }
  const allowed:PaymentMethod[]=[];
  const methodQuotes:Record<string,Record<string,unknown>>={};
  for(const method of candidates){
    try{
      const {provider}=await selectProviderForMethod(db,data,method,billingCountryCode);
      const providerCurrency=providerSettlementCurrency(provider,method);
      if(method!=='card'&&!providerCurrency)continue;
      const quote=await quoteAmountForCurrency(db,amountMinor,baseCurrency,providerCurrency||baseCurrency);
      allowed.push(method);
      methodQuotes[method]={
        currency:quote.billingCurrency,
        amountMinor:quote.amountMinor,
        amountDecimal:quote.amountDecimal,
        baseCurrency:quote.baseCurrency,
        baseAmountDecimal:quote.baseAmountDecimal,
        exchangeRate:quote.exchangeRate,
        fxSource:quote.fxSource,
        fxUpdatedAt:quote.fxUpdatedAt,
      };
    }catch{
      // A method is not presented unless provider availability and its current
      // settlement-currency quote can both be established server-side.
    }
  }
  return {allowedMethods:allowed,methodQuotes};
}

async function consumerPayableItem(
  db:Firestore,id:string,data:DocumentData,
  billingTarget:{type:BillingTenantType;id:string}|null,
  organizationId='',
  billingCountryCode='',
){
  let currency=text(data.currency),amountMinor=Number(data.amountMinor||0),amountDecimal=text(data.amountDecimal);
  let pricing:Record<string,unknown>={};
  if(text(data.itemType)==='organization_subscription'){
    if(!billingTarget)throw new Error('An institutional billing tenant is required for a subscription quote.');
    const plan=await db.doc('system/plans/catalog/'+text(data.itemId)).get();
    if(!plan.exists||plan.data()?.active!==true)throw new Error('This subscription package is no longer available.');
    const quote=await quoteSubscriptionPlanForTenant(db,billingTarget.type,billingTarget.id,plan.data()||{});
    currency=quote.billingCurrency;amountMinor=quote.amountMinor;amountDecimal=quote.amountDecimal;
    pricing={
      baseCurrency:quote.baseCurrency,baseAmountDecimal:quote.baseAmountDecimal,
      billingCountryCode:quote.countryCode,billingCurrency:quote.billingCurrency,
      exchangeRate:quote.exchangeRate,fxSource:quote.fxSource,fxUpdatedAt:quote.fxUpdatedAt,
    };
  }
  const checkout=await consumerPaymentQuotes(db,data,amountMinor,currency,billingCountryCode);
  return {
    id,
    name:text(data.name),
    description:text(data.description),
    itemType:text(data.itemType),
    organizationName:text(data.organizationName),
    currency,amountMinor,amountDecimal,pricing,
    repeatable:bool(data.repeatable,false),
    allowedMethods:checkout.allowedMethods,
    methodQuotes:checkout.methodQuotes,
  };
}

export async function listPayableItems(ctx:TenantContext,admin=false){
  if(admin){
    await requirePermission(ctx,'payable_items','view');
    requireSuperAdminFinanceControl(ctx,'payable item administration');
  }
  const snap=await ctx.db.collection('payableItems').get();
  const items=[];
  for(const doc of snap.docs){
    const data=doc.data();
    if(admin){
      items.push({id:doc.id,...data});
    }else if(await itemVisibleToUser(ctx,data)){
      let billingTarget:{type:BillingTenantType;id:string}|null=null;
      if(text(data.itemType)==='organization_subscription'){
        try{billingTarget=await requireInstitutionalSubscriptionConsumer(ctx);}
        catch{continue;}
        if(!billingTarget)continue;
      }
      const consumerOrganizationId=ctx.organizationId||text(ctx.profile.organizationId);
      const countryCode=await paymentCountryCode(ctx,billingTarget,consumerOrganizationId);
      const consumerItem=await consumerPayableItem(
        ctx.db,doc.id,data,billingTarget,consumerOrganizationId,countryCode,
      );
      // Do not send unusable charges to consumers. The administrative catalog
      // remains intact, but users only see payment options that can complete now.
      if(consumerItem.allowedMethods.length)items.push(consumerItem);
    }
  }
  return items.sort((a,b)=>text(a.name).localeCompare(text(b.name)));
}

function activeWindow(item:DocumentData){
  const now=Date.now();
  const start=text(item.availabilityStart),end=text(item.availabilityEnd);
  if(start&&new Date(start).getTime()>now)return false;
  if(end&&new Date(end).getTime()<now)return false;
  return true;
}

function newReference(){
  return 'VOP-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(6).toString('hex').toUpperCase();
}

function serializePayment(id:string,data:DocumentData){
  return {
    id,reference:text(data.reference),payerUid:text(data.payerUid),payerEmail:text(data.payerEmail),
    payerName:text(data.payerName),organizationId:text(data.organizationId),tenantId:text(data.tenantId),
    billingTenantType:text(data.billingTenantType),billingTenantId:text(data.billingTenantId),
    payableItemId:text(data.payableItemId),itemId:text(data.itemId),itemType:text(data.itemType),
    description:text(data.description),currency:text(data.currency),amountMinor:Number(data.amountMinor||0),
    amountDecimal:text(data.amountDecimal),provider:text(data.provider),paymentMethod:text(data.paymentMethod),
    status:text(data.status),providerStatus:text(data.providerStatus),providerTransactionId:text(data.providerTransactionId),
    providerReference:text(data.providerReference),verificationStatus:text(data.verificationStatus),
    webhookStatus:text(data.webhookStatus),reconciliationStatus:text(data.reconciliationStatus),
    settlementStatus:text(data.settlementStatus),fulfilmentStatus:text(data.fulfilmentStatus),
    receiptId:text(data.receiptId),refundedMinor:Number(data.refundedMinor||0),refundStatus:text(data.refundStatus||'none'),
    createdAt:timestampIso(data.createdAt),initiatedAt:timestampIso(data.initiatedAt),
    paidAt:timestampIso(data.paidAt),failedAt:timestampIso(data.failedAt),
    cancelledAt:timestampIso(data.cancelledAt),expiredAt:timestampIso(data.expiredAt),
    refundedAt:timestampIso(data.refundedAt),verifiedAt:timestampIso(data.verifiedAt),
    settledAt:timestampIso(data.settledAt),fulfilledAt:timestampIso(data.fulfilledAt),
    itemSnapshot:object(data.itemSnapshot),metadata:object(data.metadata),
  };
}

function serializeRefund(id:string,data:DocumentData){
  return {
    id,paymentId:text(data.paymentId),paymentReference:text(data.paymentReference),
    refundReference:text(data.refundReference),organizationId:text(data.organizationId),
    billingTenantType:text(data.billingTenantType),billingTenantId:text(data.billingTenantId),
    payerUid:text(data.payerUid),currency:text(data.currency),
    amountMinor:Number(data.amountMinor||0),amountDecimal:text(data.amountDecimal),
    reason:text(data.reason),provider:text(data.provider),status:text(data.status),
    providerStatus:text(data.providerStatus),providerRefundId:text(data.providerRefundId),
    providerRefundReference:text(data.providerRefundReference),requestedBy:text(data.requestedBy),
    completedBy:text(data.completedBy),createdAt:timestampIso(data.createdAt),
    completedAt:timestampIso(data.completedAt),updatedAt:timestampIso(data.updatedAt),
  };
}

async function loadPaymentByReference(db:Firestore,reference:string){
  const snap=await db.collection('paymentTransactions').where('reference','==',reference).limit(1).get();
  if(snap.empty)return null;
  return snap.docs[0];
}

async function loadPaymentByProviderTransactionId(db:Firestore,providerTransactionId:string){
  if(!providerTransactionId)return null;
  const snap=await db.collection('paymentTransactions')
    .where('providerTransactionId','==',providerTransactionId).limit(2).get();
  if(snap.empty)return null;
  // Provider transaction IDs must be unique. Fail closed rather than guessing
  // if historical data ever violates that invariant.
  if(snap.size!==1)throw new Error('The provider transaction reference is ambiguous.');
  return snap.docs[0];
}

async function providerAllowed(db:Firestore,item:DocumentData,providerKey:string,method:PaymentMethod){
  const allowedProviders=stringArray(item.allowedProviders);
  const allowedMethods=stringArray(item.allowedMethods);
  if(allowedProviders.length&&!allowedProviders.includes(providerKey))throw new Error('That payment provider is not enabled for this item.');
  if(allowedMethods.length&&!allowedMethods.includes(method))throw new Error('That payment method is not enabled for this item.');
  const config=await providerConfig(db,providerKey);
  if(!config.configured||!config.enabled)throw new Error('The selected payment provider is currently unavailable.');
  if(config.methods.length&&!config.methods.includes(method))throw new Error('The selected payment method is not enabled.');
  return getPaymentProvider(providerKey);
}

async function selectProviderForMethod(
  db:Firestore,item:DocumentData,method:PaymentMethod,billingCountryCode='',
){
  const allowedProviders=stringArray(item.allowedProviders).filter(key=>registeredPaymentProviderKeys().includes(key));
  const candidates=allowedProviders.length?allowedProviders:registeredPaymentProviderKeys();
  const preferred=method==='airtel_money'?'airtel_money':method==='mtn_money'?'mtn_momo':method==='card'?'lenco':'';
  const ordered=preferred&&candidates.includes(preferred)
    ?[preferred,...candidates.filter(key=>key!==preferred)]
    :candidates;
  for(const providerKey of ordered){
    try{
      const provider=await providerAllowed(db,item,providerKey,method);
      if(method!=='card'&&billingCountryCode){
        const providerCountry=providerSettlementCountry(provider,method);
        if(providerCountry&&providerCountry!==billingCountryCode)continue;
      }
      return {providerKey,provider};
    }catch{/* try the next configured provider */}
  }
  throw new Error('The selected payment method is currently unavailable in this billing country.');
}

export async function createCheckout(ctx:TenantContext,input:Record<string,unknown>){
  await enforcePaymentRateLimit(ctx,'checkout',8,60_000);
  const payableItemId=safePaymentId(input.payableItemId,'payable item identifier');
  const method=text(input.paymentMethod) as PaymentMethod;
  if(!PAYMENT_METHODS.includes(method as never)||method==='manual'||method==='bank')throw new Error('Select a supported online payment method.');

  const itemRef=ctx.db.doc('payableItems/'+payableItemId),itemSnap=await itemRef.get();
  if(!itemSnap.exists)throw new Error('The payable item was not found.');
  const item=itemSnap.data()||{};
  if(!(await itemVisibleToUser(ctx,item)))throw new Error('This charge is not available to your account.');
  const isSubscription=text(item.itemType)==='organization_subscription';
  const billingTarget=isSubscription?await requireInstitutionalSubscriptionConsumer(ctx):null;
  if(item.paymentRequired===false)throw new Error('This item does not require payment.');
  if(!activeWindow(item))throw new Error('This payment is not currently available.');
  const organizationId=isSubscription
    ?billingTarget?.type==='organization'?billingTarget.id:''
    :text(item.organizationId)||text(ctx.profile.organizationId)||ctx.organizationId;
  const billingTenantType=billingTarget?.type||(organizationId?'organization':'');
  const billingTenantId=billingTarget?.id||organizationId;
  let amountMinor=Number(item.amountMinor);
  let currency=normalizeCurrency(item.currency);
  let pricingSnapshot:Record<string,unknown>={};
  if(isSubscription){
    if(!billingTarget)throw new Error('An institutional billing tenant is required for subscription checkout.');
    const plan=await ctx.db.doc('system/plans/catalog/'+text(item.itemId)).get();
    if(!plan.exists||plan.data()?.active!==true)throw new Error('This subscription package is no longer available.');
    await validateBillingTenantPlanCapacity(ctx.db,billingTarget.type,billingTarget.id,object(plan.data()?.quotas));
    const quote=await quoteSubscriptionPlanForTenant(ctx.db,billingTarget.type,billingTarget.id,plan.data()||{});
    amountMinor=quote.amountMinor;currency=quote.billingCurrency;
    pricingSnapshot={
      baseCurrency:quote.baseCurrency,baseAmountMinor:quote.baseAmountMinor,baseAmountDecimal:quote.baseAmountDecimal,
      billingCountryCode:quote.countryCode,billingCurrency:quote.billingCurrency,
      exchangeRate:quote.exchangeRate,fxSource:quote.fxSource,fxUpdatedAt:quote.fxUpdatedAt,
    };
    const current=await billingTenantSubscriptionRef(ctx.db,billingTarget.type,billingTarget.id).get();
    const currentData=current.data()||{};
    const end=Date.parse(text(currentData.currentPeriodEnd));
    const renewalWindowMs=7*24*60*60*1000;
    const sameActivePlan=currentData.status==='active'&&text(currentData.planId)===text(item.itemId);
    const planInterval=text(plan.data()?.interval)||'month';
    if(sameActivePlan&&planInterval==='one_time'){
      throw new Error('This institutional tenant already has this one-time subscription package active.');
    }
    if(sameActivePlan&&Number.isFinite(end)&&end-Date.now()>renewalWindowMs){
      throw new Error('This institutional tenant already has this subscription package active. Renewal opens seven days before the current period ends.');
    }
  }
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('The configured payment amount is invalid.');
  const billingCountryCode=text(pricingSnapshot.billingCountryCode)
    ||await paymentCountryCode(ctx,billingTarget,organizationId||text(ctx.profile.organizationId));
  const {providerKey,provider}=await selectProviderForMethod(ctx.db,item,method,billingCountryCode);
  const checkoutBaseAmountMinor=amountMinor;
  const checkoutBaseCurrency=currency;
  const settlementCurrency=method==='card'
    ?checkoutBaseCurrency
    :providerSettlementCurrency(provider,method);
  if(method!=='card'&&!settlementCurrency){
    throw new Error('The selected mobile-money method does not have a configured settlement currency.');
  }
  const methodQuote=await quoteAmountForCurrency(
    ctx.db,checkoutBaseAmountMinor,checkoutBaseCurrency,settlementCurrency||checkoutBaseCurrency,
  );
  amountMinor=methodQuote.amountMinor;
  currency=methodQuote.billingCurrency;
  pricingSnapshot={
    ...pricingSnapshot,
    checkoutBaseCurrency,
    checkoutBaseAmountMinor,
    checkoutBaseAmountDecimal:minorToDecimal(checkoutBaseAmountMinor,checkoutBaseCurrency),
    paymentMethod:method,
    settlementCurrency:methodQuote.billingCurrency,
    settlementAmountMinor:methodQuote.amountMinor,
    settlementAmountDecimal:methodQuote.amountDecimal,
    settlementExchangeRate:methodQuote.exchangeRate,
    settlementFxSource:methodQuote.fxSource,
    settlementFxUpdatedAt:methodQuote.fxUpdatedAt,
  };
  const lockKey=hash(ctx.auth.uid+':'+payableItemId+':'+billingTenantType+':'+billingTenantId+':'+organizationId);
  const lockRef=ctx.db.doc('paymentLocks/'+lockKey);
  const paymentId='pay_'+randomUUID().replaceAll('-','');
  const paymentRef=ctx.db.doc('paymentTransactions/'+paymentId);
  const reference=newReference();

  let reused:ReturnType<typeof serializePayment>|null=null;
  await ctx.db.runTransaction(async tx=>{
    const lock=await tx.get(lockRef);
    const existingId=text(lock.data()?.paymentId);
    if(existingId){
      const existingRef=ctx.db.doc('paymentTransactions/'+existingId);
      const existing=await tx.get(existingRef);
      if(existing.exists){
        const data=existing.data()||{};
        if(statusIsActive(data.status)||(!bool(item.repeatable,false)&&data.status==='paid')){
          reused=serializePayment(existing.id,data);
          return;
        }
      }
    }
    const payment:PaymentTransaction={
      id:paymentId,reference,payerUid:ctx.auth.uid,payerEmail:text(ctx.auth.email)||text(ctx.profile.email),
      payerName:text(ctx.profile.displayName)||text(ctx.auth.name)||text(ctx.auth.email),
      scope:text(item.scope) as PaymentTransaction['scope'],organizationId,tenantId:text(item.tenantId),
      billingTenantType,billingTenantId,
      payableItemId,itemId:text(item.itemId),itemType:text(item.itemType) as PaymentTransaction['itemType'],
      description:text(item.name),itemSnapshot:{
        name:text(item.name),description:text(item.description),itemId:text(item.itemId),
        itemType:text(item.itemType),amountMinor,currency,organizationName:text(item.organizationName),
        billingTenantType,billingTenantId,
        pricing:pricingSnapshot,fulfilmentConfig:object(item.fulfilmentConfig),
      },
      currency,amountMinor,amountDecimal:minorToDecimal(amountMinor,currency),
      provider:providerKey,paymentMethod:method,status:'initiated',providerStatus:'initiated',
      providerTransactionId:'',providerReference:'',attemptNumber:1,idempotencyKey:lockKey,
      verificationStatus:'unverified',webhookStatus:'not_received',reconciliationStatus:'pending',
      settlementStatus:'unknown',fulfilmentStatus:'pending',receiptId:'',
      metadata:safeMetadata(input.metadata),createdBy:ctx.auth.uid,updatedBy:ctx.auth.uid,
      createdAt:FieldValue.serverTimestamp(),initiatedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    };
    tx.create(paymentRef,payment);
    tx.set(lockRef,{
      paymentId,payerUid:ctx.auth.uid,payableItemId,organizationId,billingTenantType,billingTenantId,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
  if(reused){
    let checkout:null|Record<string,unknown>=null;
    const existingProviderKey=text(reused.provider);
    const existingProvider=existingProviderKey?getPaymentProvider(existingProviderKey):provider;
    if(reused.status!=='paid'&&reused.paymentMethod==='card'&&existingProvider.resumeCheckout){
      try{
        const resumed=await existingProvider.resumeCheckout({
          reference:reused.reference,amountMinor:reused.amountMinor,currency:reused.currency,
          method:reused.paymentMethod as PaymentMethod,email:reused.payerEmail,
          description:reused.description,
        });
        checkout=resumed.checkout||null;
        await paymentAudit(ctx.db,reused.id,'checkout.resumed',ctx.auth.uid,{provider:existingProviderKey});
      }catch(error){
        await paymentAudit(ctx.db,reused.id,'checkout.resume_failed',ctx.auth.uid,{provider:existingProviderKey,error:publicError(error)});
      }
    }
    return {payment:scopedTransactionProjection(reused),reused:true,checkout};
  }

  const attemptId='attempt_'+randomUUID().replaceAll('-','');
  const attemptRef=paymentRef.collection('attempts').doc(attemptId);
  await attemptRef.set({
    id:attemptId,provider:providerKey,paymentMethod:method,status:'initiated',
    reference,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  });

  try{
    const result=await provider.createPayment({
      reference,amountMinor,currency,method,
      email:text(ctx.auth.email)||text(ctx.profile.email),
      phone:method.endsWith('_money')?normalizePhone(input.phone||ctx.profile.phoneNumber):text(input.phone||ctx.profile.phoneNumber),
      firstName:text(input.firstName),lastName:text(input.lastName),description:text(item.name),
    });
    await attemptRef.set({
      status:result.status,providerStatus:result.providerStatus,
      providerTransactionId:result.providerTransactionId,providerReference:result.providerReference,
      safeMessage:result.safeMessage,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    await paymentRef.set({
      status:result.status,providerStatus:result.providerStatus,
      providerTransactionId:result.providerTransactionId,providerReference:result.providerReference,
      settlementStatus:result.settlementStatus==='settled'?'settled':result.settlementStatus==='pending'?'pending':'unknown',
      updatedBy:'system:provider-initiation',updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    await paymentAudit(ctx.db,paymentId,'provider.initiated',ctx.auth.uid,{provider:providerKey,status:result.providerStatus});
    if(result.status==='paid'){
      await verifyAndApplyPayment(ctx.db,reference,'checkout-verification');
    }
    const latest=await paymentRef.get();
    return {payment:scopedTransactionProjection(serializePayment(paymentId,latest.data()||{})),checkout:result.checkout||null,reused:false};
  }catch(error){
    const message=publicError(error);
    // A timeout/network loss is ambiguous: the provider may have accepted the
    // request before VOP lost the response. Never mark it failed or allow a
    // second charge immediately; keep it pending for independent reconciliation.
    const ambiguous=/timed out|network|fetch failed|socket|connection|unreachable/i.test(message);
    if(ambiguous){
      await Promise.all([
        attemptRef.set({status:'pending',providerStatus:'provider_unreachable',safeMessage:message,updatedAt:FieldValue.serverTimestamp()},{merge:true}),
        paymentRef.set({
          status:'pending',providerStatus:'provider_unreachable',
          reconciliationStatus:'pending',updatedBy:'system:provider-initiation',updatedAt:FieldValue.serverTimestamp(),
        },{merge:true}),
        paymentAudit(ctx.db,paymentId,'provider.initiation_ambiguous','system',{provider:providerKey}),
      ]);
      const latest=await paymentRef.get();
      return {payment:serializePayment(paymentId,latest.data()||{}),checkout:null,reused:false,providerUnavailable:true};
    }
    await Promise.all([
      attemptRef.set({status:'failed',safeMessage:message,updatedAt:FieldValue.serverTimestamp()},{merge:true}),
      paymentRef.set({
        status:'failed',providerStatus:'request_failed',failedAt:FieldValue.serverTimestamp(),
        reconciliationStatus:'failed',updatedBy:'system:provider-initiation',updatedAt:FieldValue.serverTimestamp(),
      },{merge:true}),
      paymentAudit(ctx.db,paymentId,'provider.initiation_failed','system',{provider:providerKey}),
    ]);
    throw error;
  }
}

function verificationMatches(payment:DocumentData,verification:ProviderVerification){
  const currency=normalizeCurrency(payment.currency);
  const providerCurrency=normalizeCurrency(verification.currency||currency);
  let providerMinor=-1;
  try{providerMinor=amountToMinor(verification.amount,providerCurrency);}catch{return false;}
  return safeReference(verification.reference)===safeReference(payment.reference)
    &&providerCurrency===currency&&providerMinor===Number(payment.amountMinor);
}

export async function verifyAndApplyPayment(db:Firestore,referenceValue:unknown,source='manual-verification'){
  const reference=safeReference(referenceValue);
  const paymentDoc=await loadPaymentByReference(db,reference);
  if(!paymentDoc)throw new Error('The payment reference was not found.');
  const payment=paymentDoc.data()||{};
  const provider=getPaymentProvider(payment.provider);
  const verification=await provider.verifyPayment(reference,{
    providerTransactionId:text(payment.providerTransactionId),
    providerReference:text(payment.providerReference),
    paymentMethod:text(payment.paymentMethod) as PaymentMethod,
    amountMinor:Number(payment.amountMinor||0),
    currency:text(payment.currency),
  });
  const matches=verificationMatches(payment,verification);
  if(!matches){
    await paymentDoc.ref.set({
      verificationStatus:'mismatch',reconciliationStatus:'mismatch',
      providerStatus:verification.providerStatus,updatedBy:'system:'+source,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    await paymentAudit(db,paymentDoc.id,'verification.mismatch','system',{source,provider:text(payment.provider)});
    return serializePayment(paymentDoc.id,(await paymentDoc.ref.get()).data()||{});
  }

  const next=verification.status;
  await db.runTransaction(async tx=>{
    const current=await tx.get(paymentDoc.ref);
    if(!current.exists)return;
    const data=current.data()||{};
    const currentStatus=text(data.status) as PaymentStatus;
    const status=canTransitionPaymentStatus(currentStatus,next)?next:currentStatus;
    const update:Record<string,unknown>={
      status,providerStatus:verification.providerStatus,
      providerTransactionId:verification.providerTransactionId||text(data.providerTransactionId),
      providerReference:verification.providerReference||text(data.providerReference),
      verificationStatus:'verified',verifiedAt:FieldValue.serverTimestamp(),
      reconciliationStatus:'matched',
      settlementStatus:verification.settlementStatus==='settled'?'settled':verification.settlementStatus==='pending'?'pending':'unknown',
      updatedBy:'system:'+source,updatedAt:FieldValue.serverTimestamp(),
    };
    if(status==='paid'&&!data.paidAt)update.paidAt=FieldValue.serverTimestamp();
    if(status==='failed'&&!data.failedAt)update.failedAt=FieldValue.serverTimestamp();
    if(verification.settlementStatus==='settled'&&!data.settledAt)update.settledAt=FieldValue.serverTimestamp();
    tx.set(paymentDoc.ref,update,{merge:true});
  });
  await paymentAudit(db,paymentDoc.id,'verification.applied','system',{source,status:verification.providerStatus});
  const updated=(await paymentDoc.ref.get()).data()||{};
  if(updated.status==='paid')await fulfilPaidPayment(db,paymentDoc.id);
  return serializePayment(paymentDoc.id,(await paymentDoc.ref.get()).data()||{});
}

export async function fulfilPaidPayment(db:Firestore,paymentIdValue:unknown){
  const paymentId=safePaymentId(paymentIdValue,'payment identifier');
  const paymentRef=db.doc('paymentTransactions/'+paymentId);
  const paymentSnap=await paymentRef.get();
  if(!paymentSnap.exists)throw new Error('Payment was not found.');
  const payment=paymentSnap.data()||{};
  if(payment.status!=='paid'||payment.verificationStatus!=='verified')throw new Error('Only verified paid transactions can be fulfilled.');
  const itemSnap=await db.doc('payableItems/'+text(payment.payableItemId)).get();
  if(!itemSnap.exists)throw new Error('The payment item no longer exists.');
  const item=itemSnap.data()||{};
  const fulfilmentRef=db.doc('paymentFulfilments/'+paymentId);
  const claimToken=randomUUID();
  const claimed=await db.runTransaction(async tx=>{
    const existing=await tx.get(fulfilmentRef);
    const data=existing.data()||{};
    if(data.status==='fulfilled')return false;
    const lockUntil=new Date(text(data.lockUntil)||0).getTime();
    if(data.status==='processing'&&Number.isFinite(lockUntil)&&lockUntil>Date.now())return false;
    tx.set(fulfilmentRef,{
      paymentId,status:'processing',claimToken,
      startedAt:data.startedAt||FieldValue.serverTimestamp(),
      lockUntil:new Date(Date.now()+120_000).toISOString(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return true;
  });
  if(!claimed){
    const existing=await fulfilmentRef.get();
    if(existing.data()?.status==='fulfilled'&&payment.fulfilmentStatus!=='fulfilled'){
      await paymentRef.set({fulfilmentStatus:'fulfilled',fulfilledAt:existing.data()?.fulfilledAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
    return;
  }

  const config=object(item.fulfilmentConfig);
  const uid=text(payment.payerUid),organizationId=text(payment.organizationId);
  const billingTarget=paymentBillingTarget(payment);
  const receiptRef=db.doc('paymentReceipts/'+paymentId);
  const receiptNumber='RCPT-'+text(payment.reference);
  const batch=db.batch();
  batch.set(receiptRef,{
    id:paymentId,receiptNumber,paymentId,reference:text(payment.reference),
    payerUid:uid,payerEmail:text(payment.payerEmail),payerName:text(payment.payerName),
    organizationId,
    billingTenantType:billingTarget?.type||'',
    billingTenantId:billingTarget?.id||'',
    itemSnapshot:object(payment.itemSnapshot),amountMinor:Number(payment.amountMinor),
    amountDecimal:text(payment.amountDecimal),currency:text(payment.currency),
    provider:text(payment.provider),paymentMethod:text(payment.paymentMethod),
    paidAt:payment.paidAt||FieldValue.serverTimestamp(),issuedAt:FieldValue.serverTimestamp(),
  },{merge:false});

  const itemType=text(payment.itemType);
  if(itemType==='programme_registration'){
    const guideIds=stringArray(config.guideIdsSnapshot);
    const targetCollection=text(config.targetCollection);
    if(targetCollection==='programs'){
      batch.set(db.doc('programEnrollments/'+hash(organizationId+':'+uid+':'+text(payment.itemId))),{
        uid,organizationId,programId:text(payment.itemId),paymentId,status:'active',
        enrolledAt:FieldValue.serverTimestamp(),source:'verified-payment',
      },{merge:true});
    }
    for(const guideId of guideIds){
      batch.set(db.doc('courseEnrollments/'+(organizationId||'platform')+'_'+uid+'_'+guideId),{
        uid,organizationId,guideId,paymentId,status:'active',
        enrolledAt:FieldValue.serverTimestamp(),source:'verified-payment',
      },{merge:true});
    }
  }else if(itemType==='event_registration'){
    batch.set(db.doc('eventRegistrations/'+hash(text(payment.itemId)+':'+uid)),{
      uid,organizationId,eventId:text(payment.itemId),paymentId,status:'registered',
      registeredAt:FieldValue.serverTimestamp(),source:'verified-payment',
    },{merge:true});
  }else if(itemType==='organization_subscription'){
    if(!billingTarget)throw new Error('A subscription payment requires an institutional billing tenant.');
    const plan=object(config.planSnapshot);
    const planId=text(plan.id)||text(payment.itemId);
    const interval=text(plan.interval)||'month';
    const entitlementSnapshot={
      id:planId,name:text(plan.name),description:text(plan.description),interval,
      version:Math.max(1,Math.trunc(Number(plan.version)||1)),
      priceUsd:Number(plan.priceUsd||0),baseCurrency:text(plan.baseCurrency)||'USD',
      quotas:normalizeSubscriptionQuotas(plan.quotas),features:normalizeSubscriptionFeatures(plan.features),
    };
    const now=new Date();
    const tenantRef=billingTenantRef(db,billingTarget.type,billingTarget.id);
    const subscriptionRef=billingTenantSubscriptionRef(db,billingTarget.type,billingTarget.id);
    const currentSubscription=await subscriptionRef.get();
    const currentData=currentSubscription.data()||{};
    const existingEnd=Date.parse(text(currentData.currentPeriodEnd));
    const sameActivePlan=currentData.status==='active'&&text(currentData.planId)===planId
      &&interval!=='one_time'&&Number.isFinite(existingEnd)&&existingEnd>now.getTime();
    const start=sameActivePlan&&text(currentData.currentPeriodStart)
      ?new Date(text(currentData.currentPeriodStart))
      :now;
    const extensionBase=sameActivePlan?new Date(existingEnd):now;
    const end=interval==='one_time'?null:new Date(extensionBase);
    if(end&&interval==='year')end.setUTCFullYear(end.getUTCFullYear()+1);
    else if(end&&interval==='month')end.setUTCMonth(end.getUTCMonth()+1);
    const pricing=object(object(payment.itemSnapshot).pricing);
    batch.set(tenantRef,{
      plan:planId,quotas:entitlementSnapshot.quotas,featureEntitlements:entitlementSnapshot.features,
      billingAccessSuspended:false,billingSuspendedReason:null,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    batch.set(subscriptionRef,{
      billingTenantType:billingTarget.type,
      billingTenantId:billingTarget.id,
      organizationId:billingTarget.type==='organization'?billingTarget.id:'',
      planId,planName:entitlementSnapshot.name,planInterval:interval,
      planVersion:entitlementSnapshot.version,planSnapshot:entitlementSnapshot,status:'active',
      activationSource:'payment',billingProvider:text(payment.provider),lastPaymentId:paymentId,
      lastPaidAt:FieldValue.serverTimestamp(),currentPeriodStart:start.toISOString(),
      currentPeriodEnd:end?end.toISOString():null,renewalMode:'manual',cancelAtPeriodEnd:false,
      cancellationReason:null,cancellationRequestedAt:null,
      previousPlanId:text(currentData.planId)&&text(currentData.planId)!==planId?text(currentData.planId):null,
      renewalCount:Number(currentData.renewalCount||0)+(sameActivePlan?1:0),
      ...(sameActivePlan?{renewedAt:FieldValue.serverTimestamp(),previousPeriodEnd:new Date(existingEnd).toISOString()}:{}),
      baseCurrency:text(pricing.baseCurrency)||'USD',baseAmountDecimal:text(pricing.baseAmountDecimal),
      billingCountryCode:text(pricing.billingCountryCode),billingCurrency:text(payment.currency),
      paidAmountDecimal:text(payment.amountDecimal),exchangeRate:Number(pricing.exchangeRate||1),
      fxSource:text(pricing.fxSource),fxUpdatedAt:text(pricing.fxUpdatedAt),
      activatedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  }else if(!['donation'].includes(itemType)){
    batch.set(db.doc('paymentEntitlements/'+hash(uid+':'+text(payment.payableItemId))),{
      uid,organizationId,payableItemId:text(payment.payableItemId),itemId:text(payment.itemId),
      itemType,paymentId,status:'active',grantedAt:FieldValue.serverTimestamp(),source:'verified-payment',
    },{merge:true});
  }

  batch.set(fulfilmentRef,{status:'fulfilled',claimToken,lockUntil:null,fulfilledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  batch.set(paymentRef,{
    fulfilmentStatus:'fulfilled',fulfilledAt:FieldValue.serverTimestamp(),
    receiptId:paymentId,updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  try{
    await batch.commit();
    await paymentAudit(db,paymentId,'fulfilment.completed','system',{itemType});
  }catch(error){
    await fulfilmentRef.set({status:'failed',claimToken,lockUntil:null,safeError:publicError(error),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    throw error;
  }
}

export async function paymentHistory(ctx:TenantContext){
  const snap=await ctx.db.collection('paymentTransactions').where('payerUid','==',ctx.auth.uid).limit(200).get();
  return snap.docs.map(doc=>scopedTransactionProjection(serializePayment(doc.id,doc.data()))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

export async function paymentStatusForUser(ctx:TenantContext,referenceValue:unknown,verify=false){
  const reference=safeReference(referenceValue);
  if(verify){
    await enforcePaymentRateLimit(ctx,'verify',12,60_000);
    const doc=await loadPaymentByReference(ctx.db,reference);
    if(!doc||text(doc.data()?.payerUid)!==ctx.auth.uid)throw new Error('The payment reference was not found.');
    await verifyAndApplyPayment(ctx.db,reference,'user-verification');
  }
  const doc=await loadPaymentByReference(ctx.db,reference);
  if(!doc||text(doc.data()?.payerUid)!==ctx.auth.uid)throw new Error('The payment reference was not found.');
  return scopedTransactionProjection(serializePayment(doc.id,doc.data()));
}

export async function receiptForUser(ctx:TenantContext,paymentIdValue:unknown){
  const paymentId=safePaymentId(paymentIdValue,'payment identifier');
  const payment=await ctx.db.doc('paymentTransactions/'+paymentId).get();
  if(!payment.exists||text(payment.data()?.payerUid)!==ctx.auth.uid)throw new Error('The receipt was not found.');
  const receipt=await ctx.db.doc('paymentReceipts/'+paymentId).get();
  if(!receipt.exists)throw new Error('The receipt is not available yet.');
  const data=receipt.data()||{};
  return Object.fromEntries(Object.entries({
    ...data,paidAt:timestampIso(data.paidAt),issuedAt:timestampIso(data.issuedAt),
  }).filter(([key])=>!['provider','providerReference','providerTransactionId'].includes(key)));
}

function scopedTransactionProjection(row:ReturnType<typeof serializePayment>){
  return {
    ...row,
    provider:'',
    providerStatus:'',
    providerReference:'',
    providerTransactionId:'',
    webhookStatus:'',
    reconciliationStatus:'',
    settlementStatus:'',
  };
}

function scopedRefundProjection(row:ReturnType<typeof serializeRefund>){
  return {...row,providerStatus:'',providerRefundReference:''};
}

export async function adminListTransactions(ctx:TenantContext,filters:Record<string,unknown>={}){
  await requirePermission(ctx,'payments','view');
  const allowed=new Set(await accessibleOrganizationIds(ctx));
  const snap=await ctx.db.collection('paymentTransactions').limit(500).get();
  const ownBillingTarget=billingTenantFromContext(ctx);
  let rows=snap.docs.filter(doc=>{
    const data=doc.data(),org=text(data.organizationId);
    const billingTarget=paymentBillingTarget(data);
    if(ctx.isSuperAdmin)return true;
    if(billingTarget&&ownBillingTarget
        &&billingTarget.type===ownBillingTarget.type&&billingTarget.id===ownBillingTarget.id)return true;
    return Boolean(org&&(allowed.has(org)||(ctx.tenantType==='organization'&&org===ctx.organizationId)));
  }).map(doc=>serializePayment(doc.id,doc.data()));
  const search=text(filters.search).toLowerCase();
  const status=text(filters.status),provider=text(filters.provider),method=text(filters.paymentMethod);
  const organizationId=text(filters.organizationId),itemType=text(filters.itemType),payerUid=text(filters.payerUid);
  const dateFrom=text(filters.dateFrom),dateTo=text(filters.dateTo);
  const minText=text(filters.minAmount),maxText=text(filters.maxAmount);
  const minAmount=minText?Number(minText):Number.NaN,maxAmount=maxText?Number(maxText):Number.NaN;
  if(search)rows=rows.filter(row=>[
    row.reference,row.providerReference,row.providerTransactionId,row.payerName,row.payerEmail,row.description,
  ].some(value=>text(value).toLowerCase().includes(search)));
  if(status)rows=rows.filter(row=>row.status===status);
  if(provider)rows=rows.filter(row=>row.provider===provider);
  if(method)rows=rows.filter(row=>row.paymentMethod===method);
  if(itemType)rows=rows.filter(row=>row.itemType===itemType);
  if(payerUid)rows=rows.filter(row=>row.payerUid===payerUid);
  if(organizationId){
    if(!ctx.isSuperAdmin&&!allowed.has(organizationId))throw new Error('The organization is outside your scope.');
    rows=rows.filter(row=>row.organizationId===organizationId);
  }
  if(dateFrom){
    const from=Date.parse(dateFrom);
    if(Number.isFinite(from))rows=rows.filter(row=>Date.parse(row.createdAt)>=from);
  }
  if(dateTo){
    const through=Date.parse(dateTo+'T23:59:59.999Z');
    if(Number.isFinite(through))rows=rows.filter(row=>Date.parse(row.createdAt)<=through);
  }
  if(Number.isFinite(minAmount)&&minAmount>=0)rows=rows.filter(row=>Number(row.amountDecimal)>=minAmount);
  if(Number.isFinite(maxAmount)&&maxAmount>=0)rows=rows.filter(row=>Number(row.amountDecimal)<=maxAmount);
  const sorted=rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return ctx.isSuperAdmin?sorted:sorted.map(scopedTransactionProjection);
}

export async function adminPaymentDetails(ctx:TenantContext,paymentIdValue:unknown){
  await requirePermission(ctx,'payments','view');
  const paymentId=safePaymentId(paymentIdValue,'payment identifier');
  const ref=ctx.db.doc('paymentTransactions/'+paymentId),snap=await ref.get();
  if(!snap.exists)throw new Error('The transaction was not found.');
  const org=text(snap.data()?.organizationId);
  if(!ctx.isSuperAdmin){
    const allowed=new Set(await accessibleOrganizationIds(ctx));
    const ownBillingTarget=billingTenantFromContext(ctx);
    const billingTarget=paymentBillingTarget(snap.data()||{});
    const ownInstitutionalPayment=Boolean(
      billingTarget&&ownBillingTarget
      &&billingTarget.type===ownBillingTarget.type&&billingTarget.id===ownBillingTarget.id
    );
    if(!ownInstitutionalPayment&&(!org||!allowed.has(org))){
      throw new Error('The transaction is outside your authorized scope.');
    }
  }
  const [attempts,audit,receipt,refunds]=await Promise.all([
    ctx.isSuperAdmin?ref.collection('attempts').orderBy('createdAt','desc').limit(50).get():Promise.resolve(null),
    ctx.isSuperAdmin?ref.collection('audit').orderBy('createdAt','desc').limit(100).get():Promise.resolve(null),
    ctx.db.doc('paymentReceipts/'+paymentId).get(),
    ctx.db.collection('paymentRefunds').where('paymentId','==',paymentId).limit(100).get(),
  ]);
  const payment=serializePayment(paymentId,snap.data()||{});
  const refundRows=refunds.docs.map(doc=>serializeRefund(doc.id,doc.data())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const receiptData=receipt.exists?{...receipt.data(),issuedAt:timestampIso(receipt.data()?.issuedAt),paidAt:timestampIso(receipt.data()?.paidAt)}:null;
  if(!ctx.isSuperAdmin){
    const safeReceipt=receiptData?Object.fromEntries(Object.entries(receiptData).filter(([key])=>!['provider','providerReference','providerTransactionId'].includes(key))):null;
    return {
      payment:scopedTransactionProjection(payment),
      attempts:[],
      audit:[],
      refunds:refundRows.map(scopedRefundProjection),
      receipt:safeReceipt,
    };
  }
  return {
    payment,
    attempts:attempts?.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:timestampIso(doc.data().createdAt),updatedAt:timestampIso(doc.data().updatedAt)}))||[],
    audit:audit?.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:timestampIso(doc.data().createdAt)}))||[],
    refunds:refundRows,
    receipt:receiptData,
  };
}


async function reverseFullyRefundedFulfilment(db:Firestore,paymentId:string){
  const paymentSnap=await db.doc('paymentTransactions/'+paymentId).get();
  if(!paymentSnap.exists)return;
  const payment=paymentSnap.data()||{};
  if(payment.status!=='refunded')return;
  const uid=text(payment.payerUid),organizationId=text(payment.organizationId);
  const itemType=text(payment.itemType),itemId=text(payment.itemId);
  const config=object(object(payment.itemSnapshot).fulfilmentConfig);
  const updates:Array<Promise<unknown>>=[];

  if(itemType==='programme_registration'){
    if(text(config.targetCollection)==='programs'){
      const ref=db.doc('programEnrollments/'+hash(organizationId+':'+uid+':'+itemId));
      updates.push(ref.get().then(snap=>snap.exists?ref.set({
        status:'revoked_refund',revokedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true}):undefined));
    }
    for(const guideId of stringArray(config.guideIdsSnapshot)){
      const ref=db.doc('courseEnrollments/'+(organizationId||'platform')+'_'+uid+'_'+guideId);
      updates.push(ref.get().then(snap=>snap.exists?ref.set({
        status:'revoked_refund',revokedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true}):undefined));
    }
  }else if(itemType==='event_registration'){
    const ref=db.doc('eventRegistrations/'+hash(itemId+':'+uid));
    updates.push(ref.get().then(snap=>snap.exists?ref.set({
      status:'cancelled_refund',cancelledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true}):undefined));
  }else if(itemType==='organization_subscription'){
    const billingTarget=paymentBillingTarget(payment);
    if(billingTarget){
      const subscriptionRef=billingTenantSubscriptionRef(db,billingTarget.type,billingTarget.id);
      const tenantRef=billingTenantRef(db,billingTarget.type,billingTarget.id);
      updates.push(subscriptionRef.get().then(snap=>{
        if(!snap.exists||text(snap.data()?.lastPaymentId)!==paymentId)return undefined;
        return subscriptionRef.set({
          status:'refunded',refundedAt:FieldValue.serverTimestamp(),
          refundPaymentId:paymentId,updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      }));
      // Fail closed for paid feature access after a full refund. Super Admin can
      // subsequently assign a complimentary/replacement plan with an audit reason.
      updates.push(tenantRef.set({
        featureEntitlements:{},billingAccessSuspended:true,
        billingSuspendedReason:'full_refund',updatedAt:FieldValue.serverTimestamp(),
      },{merge:true}));
    }
  }else if(itemType!=='donation'){
    const ref=db.doc('paymentEntitlements/'+hash(uid+':'+text(payment.payableItemId)));
    updates.push(ref.get().then(snap=>snap.exists?ref.set({
      status:'refunded',revokedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true}):undefined));
  }
  await Promise.all(updates);
  await paymentAudit(db,paymentId,'fulfilment.refund_reversal','system',{itemType});
}

async function finalizeRefundRecord(
  db:Firestore,refundIdValue:unknown,actor:string,providerRefundReferenceValue:unknown='',
){
  const refundId=safePaymentId(refundIdValue,'refund identifier');
  const refundRef=db.doc('paymentRefunds/'+refundId);
  let paymentId='';
  let fullRefund=false;
  await db.runTransaction(async tx=>{
    const refundSnap=await tx.get(refundRef);
    if(!refundSnap.exists)throw new Error('The refund request was not found.');
    const refund=refundSnap.data()||{};
    if(refund.status==='completed'){paymentId=text(refund.paymentId);return;}
    if(['failed','cancelled'].includes(text(refund.status)))throw new Error('This refund request can no longer be completed.');
    paymentId=safePaymentId(refund.paymentId,'payment identifier');
    const paymentRef=db.doc('paymentTransactions/'+paymentId);
    const paymentSnap=await tx.get(paymentRef);
    if(!paymentSnap.exists)throw new Error('The original payment was not found.');
    const payment=paymentSnap.data()||{};
    if(!['paid','partially_refunded'].includes(text(payment.status)))throw new Error('Only paid transactions can be refunded.');
    const amountMinor=Number(refund.amountMinor||0);
    const alreadyRefunded=Math.max(0,Number(payment.refundedMinor||0));
    const total=alreadyRefunded+amountMinor;
    const paidAmount=Number(payment.amountMinor||0);
    if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||total>paidAmount)throw new Error('The refund exceeds the remaining refundable amount.');
    fullRefund=total===paidAmount;
    const nextStatus:PaymentStatus=fullRefund?'refunded':'partially_refunded';
    const providerRefundReference=text(providerRefundReferenceValue)||text(refund.providerRefundReference);
    tx.set(refundRef,{
      status:'completed',providerStatus:'completed',providerRefundReference,
      completedBy:actor,completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    tx.set(paymentRef,{
      status:nextStatus,refundedMinor:total,refundStatus:'completed',
      refundedAt:FieldValue.serverTimestamp(),updatedBy:actor,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
  if(paymentId){
    await paymentAudit(db,paymentId,'refund.completed',actor,{refundId,fullRefund});
    if(fullRefund)await reverseFullyRefundedFulfilment(db,paymentId);
  }
  const finalSnap=await refundRef.get();
  return serializeRefund(refundId,finalSnap.data()||{});
}

export async function adminRequestRefund(ctx:TenantContext,input:Record<string,unknown>){
  await requirePermission(ctx,'payments','manage');
  requireSuperAdminFinanceControl(ctx,'payment refunds');
  await enforcePaymentRateLimit(ctx,'refund',6,60_000);
  const paymentId=safePaymentId(input.paymentId,'payment identifier');
  const details=await adminPaymentDetails(ctx,paymentId);
  const payment=details.payment;
  if(!['paid','partially_refunded'].includes(payment.status))throw new Error('Only a verified paid transaction can be refunded.');
  const reason=text(input.reason);
  if(reason.length<5)throw new Error('Enter a clear refund reason.');
  const reserved=(details.refunds||[])
    .filter(refund=>!['failed','cancelled'].includes(text(refund.status)))
    .reduce((sum,refund)=>sum+Math.max(0,Number(refund.amountMinor||0)),0);
  const remaining=Math.max(0,payment.amountMinor-reserved);
  if(remaining<=0)throw new Error('This payment has no remaining refundable amount.');
  const amountMinor=text(input.amount)
    ?amountToMinor(input.amount,payment.currency)
    :remaining;
  if(amountMinor>remaining)throw new Error('The refund exceeds the remaining refundable amount.');

  const provider=getPaymentProvider(payment.provider);
  const refundId='refund_'+randomUUID().replaceAll('-','');
  const refundReference='VOP-RF-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(5).toString('hex').toUpperCase();
  const ref=ctx.db.doc('paymentRefunds/'+refundId);
  const record:PaymentRefund={
    id:refundId,paymentId,paymentReference:payment.reference,refundReference,
    organizationId:payment.organizationId,
    billingTenantType:payment.billingTenantType,billingTenantId:payment.billingTenantId,
    payerUid:payment.payerUid,currency:payment.currency,
    amountMinor,amountDecimal:minorToDecimal(amountMinor,payment.currency),reason:reason.slice(0,800),
    provider:payment.provider,status:'requested',providerStatus:'requested',
    providerRefundId:'',providerRefundReference:'',requestedBy:ctx.auth.uid,
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.create(record);
  await paymentAudit(ctx.db,paymentId,'refund.requested',ctx.auth.uid,{refundId,amountMinor});

  const isPartial=amountMinor<payment.amountMinor;
  if(provider.capabilities.refunds&&provider.refundPayment&&(!isPartial||provider.capabilities.partialRefunds)){
    try{
      const result=await provider.refundPayment({
        paymentReference:payment.reference,refundReference,amountMinor,currency:payment.currency,
        reason,providerTransactionId:payment.providerTransactionId,providerReference:payment.providerReference,
      });
      await ref.set({
        status:result.status==='completed'?'provider_pending':result.status==='failed'?'failed':'provider_pending',
        providerStatus:result.providerStatus,providerRefundId:result.providerRefundId,
        providerRefundReference:result.providerRefundReference,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      if(result.status==='completed'){
        return finalizeRefundRecord(ctx.db,refundId,'system:provider-refund',result.providerRefundReference);
      }
    }catch(error){
      const message=publicError(error,'Refund provider request failed.');
      const ambiguous=/timed out|network|fetch failed|socket|connection|unreachable/i.test(message);
      await ref.set({
        status:ambiguous?'provider_pending':'failed',providerStatus:ambiguous?'provider_unreachable':'failed',
        safeError:message,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      if(!ambiguous)throw error;
    }
  }else{
    await ref.set({
      status:'manual_action_required',providerStatus:'manual_provider_action_required',
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  }
  return serializeRefund(refundId,(await ref.get()).data()||{});
}

export async function adminCompleteManualRefund(ctx:TenantContext,input:Record<string,unknown>){
  await requirePermission(ctx,'payments','manage');
  requireSuperAdminFinanceControl(ctx,'payment refunds');
  const refundId=safePaymentId(input.refundId,'refund identifier');
  const refundRef=ctx.db.doc('paymentRefunds/'+refundId),refundSnap=await refundRef.get();
  if(!refundSnap.exists)throw new Error('The refund request was not found.');
  const refund=refundSnap.data()||{};
  const details=await adminPaymentDetails(ctx,refund.paymentId);
  if(text(refund.status)!=='manual_action_required')throw new Error('Only refunds awaiting manual provider action can be confirmed manually.');
  const providerRefundReference=text(input.providerRefundReference);
  if(providerRefundReference.length<4)throw new Error('Enter the provider refund or reversal reference.');
  const confirmationNote=text(input.confirmationNote);
  if(confirmationNote.length<5)throw new Error('Enter a confirmation note describing the external refund action.');
  await refundRef.set({
    confirmationNote:confirmationNote.slice(0,800),providerRefundReference,
    confirmedPaymentReference:details.payment.reference,updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  return finalizeRefundRecord(ctx.db,refundId,ctx.auth.uid,providerRefundReference);
}

export async function adminCancelRefund(ctx:TenantContext,input:Record<string,unknown>){
  await requirePermission(ctx,'payments','manage');
  requireSuperAdminFinanceControl(ctx,'payment refunds');
  const refundId=safePaymentId(input.refundId,'refund identifier');
  const ref=ctx.db.doc('paymentRefunds/'+refundId),snap=await ref.get();
  if(!snap.exists)throw new Error('The refund request was not found.');
  const refund=snap.data()||{};
  await adminPaymentDetails(ctx,refund.paymentId);
  if(refund.status==='completed')throw new Error('A completed refund cannot be cancelled.');
  await ref.set({
    status:'cancelled',cancelledBy:ctx.auth.uid,cancelReason:text(input.reason).slice(0,800),
    cancelledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  await paymentAudit(ctx.db,text(refund.paymentId),'refund.cancelled',ctx.auth.uid,{refundId});
  return serializeRefund(refundId,(await ref.get()).data()||{});
}

export async function reconcilePendingRefunds(db:Firestore,limit=100){
  const snap=await db.collection('paymentRefunds').where('status','==','provider_pending').limit(Math.max(1,Math.min(200,limit))).get();
  const summary={checked:0,completed:0,pending:0,failed:0,errors:0};
  for(const doc of snap.docs){
    summary.checked++;
    const refund=doc.data()||{};
    try{
      const provider=getPaymentProvider(refund.provider);
      if(!provider.verifyRefund){summary.pending++;continue;}
      const result=await provider.verifyRefund(text(refund.refundReference));
      await doc.ref.set({
        providerStatus:result.providerStatus,providerRefundId:result.providerRefundId,
        providerRefundReference:result.providerRefundReference,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      if(result.status==='completed'){
        await finalizeRefundRecord(db,doc.id,'system:refund-reconciliation',result.providerRefundReference);
        summary.completed++;
      }else if(result.status==='failed'){
        await doc.ref.set({status:'failed',updatedAt:FieldValue.serverTimestamp()},{merge:true});
        summary.failed++;
      }else summary.pending++;
    }catch(error){
      summary.errors++;
      await doc.ref.set({safeError:publicError(error,'Refund reconciliation failed.'),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
  }
  return summary;
}

export async function adminProviderConfig(ctx:TenantContext,input:Record<string,unknown>){
  await requirePermission(ctx,'payments','manage');
  if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can configure payment providers.');
  const key=text(input.key);
  const adapter=getPaymentProvider(key);
  const methods=stringArray(input.methods).filter(method=>PAYMENT_METHODS.includes(method as never));
  const ref=ctx.db.doc('paymentProviderConfigs/'+key),before=(await ref.get()).data();
  const data={
    key,enabled:input.enabled!==false,methods:methods.length?methods:stringArray(adapter.publicConfiguration().methods),
    updatedBy:ctx.auth.uid,updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.set({...data,createdAt:before?.createdAt||FieldValue.serverTimestamp()},{merge:true});
  await writeTenantAudit(ctx,'payment_provider.configure',ref.path,before,data);
  return {...adapter.publicConfiguration(),...data,configured:adapter.configured()};
}

function rawWebhookBody(req:{body?:unknown;rawBody?:Buffer|string}){
  if(Buffer.isBuffer(req.rawBody))return req.rawBody;
  if(typeof req.rawBody==='string')return Buffer.from(req.rawBody);
  if(Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string')return Buffer.from(req.body);
  return Buffer.from(JSON.stringify(req.body&&typeof req.body==='object'?req.body:{}));
}
function header(req:{headers?:Record<string,string|string[]|undefined>},name:string){
  const value=req.headers?.[name]??req.headers?.[name.toLowerCase()];
  return Array.isArray(value)?value[0]||'':value||'';
}

export async function processProviderWebhook(
  db:Firestore,providerKey:string,req:{headers?:Record<string,string|string[]|undefined>;body?:unknown;rawBody?:Buffer|string},
){
  const provider=getPaymentProvider(providerKey);
  if(!provider.capabilities.webhooks||!provider.parseWebhook)throw new Error('This payment provider does not accept callbacks.');
  const event=provider.parseWebhook(req);
  const eventType=text(event.eventType)||'provider.event';
  const suppliedReference=text(event.reference);
  const suppliedProviderTransactionId=text(event.providerTransactionId);

  const authenticated=event.authenticated===true;
  let paymentDoc:null|QueryDocumentSnapshot=null;
  let reference='';

  // Never let an unauthenticated public callback turn a guessable VOP
  // reference into a provider status lookup. Unsigned providers (for example
  // MTN RequestToPay, or Airtel when no callback Authorization value has been
  // configured) must prove possession of the opaque provider transaction ID
  // that VOP generated and stored when checkout was created.
  if(!authenticated&&!suppliedProviderTransactionId){
    return {duplicate:false,orphaned:true,ignored:true};
  }

  if(authenticated&&suppliedReference){
    try{
      reference=safeReference(suppliedReference);
      paymentDoc=await loadPaymentByReference(db,reference);
    }catch{
      // Authenticated gateways may callback only their transaction ID. Do not
      // reject the callback solely because another provider field is not a
      // valid VOP reference.
      reference='';
    }
  }
  if(!paymentDoc&&suppliedProviderTransactionId){
    paymentDoc=await loadPaymentByProviderTransactionId(db,suppliedProviderTransactionId);
    if(paymentDoc)reference=safeReference(text(paymentDoc.data()?.reference));
  }

  const eventLocator=reference||suppliedProviderTransactionId||hash(webhookIdentityPayload(req.body));
  const eventId=hash(providerKey+':'+eventType+':'+eventLocator);
  const eventRef=db.doc('paymentWebhookEvents/'+eventId);

  if(!paymentDoc){
    // Signed/authenticated providers may retain orphan delivery evidence.
    // Unsigned callbacks are discarded to avoid a public storage-amplification path.
    if(event.authenticated){
      await eventRef.set({
        provider:providerKey,eventType,reference:suppliedReference||'',
        providerTransactionId:suppliedProviderTransactionId,status:'orphaned',authenticated:true,
        providerStatus:text(event.providerStatus),providerReference:text(event.providerReference),
        receivedAt:FieldValue.serverTimestamp(),
      },{merge:false});
    }
    return {duplicate:false,orphaned:true};
  }

  const payment=paymentDoc.data()||{};
  if(text(payment.provider)!==providerKey)throw new Error('Callback provider does not match the payment transaction.');
  const storedProviderTransactionId=text(payment.providerTransactionId);
  if(!authenticated&&(!storedProviderTransactionId||suppliedProviderTransactionId!==storedProviderTransactionId)){
    throw new Error('Unauthenticated callback transaction reference does not match the payment transaction.');
  }
  if(suppliedProviderTransactionId&&storedProviderTransactionId
    &&suppliedProviderTransactionId!==storedProviderTransactionId){
    throw new Error('Callback transaction reference does not match the payment transaction.');
  }

  let duplicate=false;
  await db.runTransaction(async tx=>{
    const existing=await tx.get(eventRef);
    if(existing.exists){duplicate=true;return;}
    tx.create(eventRef,{
      provider:providerKey,eventType,reference,paymentId:paymentDoc.id,
      authenticated:event.authenticated===true,
      providerStatus:text(event.providerStatus),providerReference:text(event.providerReference),
      providerTransactionId:suppliedProviderTransactionId,
      receivedAt:FieldValue.serverTimestamp(),processingStatus:'received',
    });
    tx.set(paymentDoc.ref,{
      webhookStatus:'received',lastWebhookAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
  if(duplicate){
    await paymentDoc.ref.set({webhookStatus:'duplicate',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {duplicate:true,paymentId:paymentDoc.id};
  }
  try{
    // Provider callbacks are notifications, never proof of payment. The adapter
    // performs an independent authenticated provider status lookup before VOP
    // changes payment state or grants an entitlement.
    await verifyAndApplyPayment(db,reference,'webhook');
    await eventRef.set({processingStatus:'processed',processedAt:FieldValue.serverTimestamp()},{merge:true});
    await paymentDoc.ref.set({webhookStatus:'processed',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {duplicate:false,paymentId:paymentDoc.id};
  }catch(error){
    await eventRef.set({processingStatus:'failed',safeError:publicError(error),processedAt:FieldValue.serverTimestamp()},{merge:true});
    await paymentDoc.ref.set({webhookStatus:'rejected',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    throw error;
  }
}

export async function reconcileExpiredOrganizationSubscriptions(db:Firestore,limit=200){
  const snap=await db.collectionGroup('subscription').where('status','==','active').limit(Math.max(1,Math.min(500,limit))).get();
  const now=Date.now();
  const summary={checked:0,expired:0};
  for(const doc of snap.docs){
    if(doc.id!=='current')continue;
    summary.checked++;
    const data=doc.data()||{};
    const interval=text(data.interval||data.planInterval);
    if(interval==='one_time')continue;
    const end=Date.parse(text(data.currentPeriodEnd));
    if(!Number.isFinite(end)||end>now)continue;
    const organizationRef=doc.ref.parent.parent;
    if(!organizationRef)continue;
    const cancelled=data.cancelAtPeriodEnd===true;
    const batch=db.batch();
    batch.set(doc.ref,{
      status:cancelled?'cancelled':'expired',
      cancelAtPeriodEnd:false,
      ...(cancelled?{cancelledAt:FieldValue.serverTimestamp()}:{expiredAt:FieldValue.serverTimestamp()}),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    batch.set(organizationRef,{
      billingAccessSuspended:true,
      billingSuspendedReason:cancelled?'subscription_cancelled':'subscription_expired',
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    await batch.commit();
    summary.expired++;
  }
  return summary;
}

export async function reconcilePendingPayments(db:Firestore,limit=100){
  const statuses=['initiated','pending','requires_action','processing'];
  const snap=await db.collection('paymentTransactions').where('status','in',statuses).limit(Math.max(1,Math.min(200,limit))).get();
  const summary={checked:0,paid:0,failed:0,pending:0,errors:0};
  for(const doc of snap.docs){
    summary.checked++;
    const data=doc.data()||{};
    try{
      const result=await verifyAndApplyPayment(db,text(data.reference),'reconciliation');
      if(result.status==='paid')summary.paid++;
      else if(result.status==='failed')summary.failed++;
      else summary.pending++;
    }catch(error){
      summary.errors++;
      await doc.ref.set({
        reconciliationStatus:'failed',lastReconciliationAt:FieldValue.serverTimestamp(),
        safeReconciliationError:publicError(error),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
    }
  }
  return summary;
}

export async function adminReconcile(ctx:TenantContext,paymentIdValue?:unknown){
  await requirePermission(ctx,'payments','manage');
  requireSuperAdminFinanceControl(ctx,'payment reconciliation');
  if(paymentIdValue){
    const details=await adminPaymentDetails(ctx,paymentIdValue);
    return {payment:await verifyAndApplyPayment(ctx.db,details.payment.reference,'admin-reconciliation')};
  }
  return {summary:await reconcilePendingPayments(ctx.db,100)};
}

export async function adminExportTransactions(ctx:TenantContext,filters:Record<string,unknown>={}){
  const rows=await adminListTransactions(ctx,filters);
  const escape=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
  if(!ctx.isSuperAdmin){
    const headerRow=['Reference','Date','Payer','Email','Organization','Item','Amount','Currency','Method','Status'];
    const lines=[headerRow.map(escape).join(',')];
    for(const row of rows)lines.push([
      row.reference,row.createdAt,row.payerName,row.payerEmail,row.organizationId,row.description,
      row.amountDecimal,row.currency,row.paymentMethod,row.status,
    ].map(escape).join(','));
    return lines.join('\n');
  }
  const headerRow=['Reference','Date','Payer','Email','Organization','Item','Amount','Currency','Provider','Method','Status','Provider Reference','Verification','Reconciliation'];
  const lines=[headerRow.map(escape).join(',')];
  for(const row of rows)lines.push([
    row.reference,row.createdAt,row.payerName,row.payerEmail,row.organizationId,row.description,
    row.amountDecimal,row.currency,row.provider,row.paymentMethod,row.status,row.providerReference,
    row.verificationStatus,row.reconciliationStatus,
  ].map(escape).join(','));
  return lines.join('\n');
}

export async function listPaymentProviders(ctx:TenantContext){
  await requirePermission(ctx,'payments','view');
  requireSuperAdminFinanceControl(ctx,'payment provider administration');
  return safeProviderCatalog(ctx.db);
}

export function configuredPaymentStatuses(){return [...PAYMENT_STATUSES];}
