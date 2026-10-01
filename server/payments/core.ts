import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import {
  PAYABLE_ITEM_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES,
  amountToMinor, canTransitionPaymentStatus, minorToDecimal, normalizeCurrency,
  normalizePhone, safePaymentId, safeReference,
  type PayableItem, type PaymentMethod, type PaymentStatus, type PaymentTransaction,
} from '../../shared/payments.js';
import {
  accessibleOrganizationIds, authenticateTenant, organizationInHierarchyScope,
  tenantOwnerKey, writeTenantAudit, type TenantContext,
} from '../tenant.js';
import { requirePermission } from '../permissions.js';
import {
  getPaymentProvider, paymentProviderCatalog, registeredPaymentProviderKeys,
  type ProviderVerification,
} from './providers.js';

type RequestLike={headers?:Record<string,string|string[]|undefined>};
function text(value:unknown,fallback=''){return String(value??fallback).trim();}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function bool(value:unknown,fallback=false){return typeof value==='boolean'?value:fallback;}
function stringArray(value:unknown){return Array.isArray(value)?value.map(text).filter(Boolean):[];}
function nowIso(){return new Date().toISOString();}
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
  return {
    key,
    enabled:snap.exists?data.enabled!==false:adapter.configured(),
    methods:stringArray(data.methods).length?stringArray(data.methods):stringArray(adapter.publicConfiguration().methods),
    environment:text(adapter.publicConfiguration().environment),
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
        id:itemId,name:text(data.name),interval:text(data.interval)||'month',
        quotas:object(data.quotas),features:object(data.features),
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

export async function upsertPayableItem(ctx:TenantContext,input:Record<string,unknown>){
  await requirePermission(ctx,'payable_items','manage');
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

export async function listPayableItems(ctx:TenantContext,admin=false){
  if(admin)await requirePermission(ctx,'payable_items','view');
  const snap=await ctx.db.collection('payableItems').get();
  const items=[];
  for(const doc of snap.docs){
    const data=doc.data();
    if(admin){
      if(ctx.isSuperAdmin||await itemVisibleToUser(ctx,{...data,active:true}))items.push({id:doc.id,...data});
    }else if(await itemVisibleToUser(ctx,data))items.push({id:doc.id,...data});
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
    payableItemId:text(data.payableItemId),itemId:text(data.itemId),itemType:text(data.itemType),
    description:text(data.description),currency:text(data.currency),amountMinor:Number(data.amountMinor||0),
    amountDecimal:text(data.amountDecimal),provider:text(data.provider),paymentMethod:text(data.paymentMethod),
    status:text(data.status),providerStatus:text(data.providerStatus),providerTransactionId:text(data.providerTransactionId),
    providerReference:text(data.providerReference),verificationStatus:text(data.verificationStatus),
    webhookStatus:text(data.webhookStatus),reconciliationStatus:text(data.reconciliationStatus),
    settlementStatus:text(data.settlementStatus),fulfilmentStatus:text(data.fulfilmentStatus),
    receiptId:text(data.receiptId),
    createdAt:timestampIso(data.createdAt),initiatedAt:timestampIso(data.initiatedAt),
    paidAt:timestampIso(data.paidAt),failedAt:timestampIso(data.failedAt),
    cancelledAt:timestampIso(data.cancelledAt),expiredAt:timestampIso(data.expiredAt),
    refundedAt:timestampIso(data.refundedAt),verifiedAt:timestampIso(data.verifiedAt),
    settledAt:timestampIso(data.settledAt),fulfilledAt:timestampIso(data.fulfilledAt),
    itemSnapshot:object(data.itemSnapshot),metadata:object(data.metadata),
  };
}

async function loadPaymentByReference(db:Firestore,reference:string){
  const snap=await db.collection('paymentTransactions').where('reference','==',reference).limit(1).get();
  if(snap.empty)return null;
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

export async function createCheckout(ctx:TenantContext,input:Record<string,unknown>){
  await enforcePaymentRateLimit(ctx,'checkout',8,60_000);
  const payableItemId=safePaymentId(input.payableItemId,'payable item identifier');
  const providerKey=text(input.provider||'lenco').toLowerCase();
  const method=text(input.paymentMethod) as PaymentMethod;
  if(!PAYMENT_METHODS.includes(method as never)||method==='manual'||method==='bank')throw new Error('Select a supported online payment method.');

  const itemRef=ctx.db.doc('payableItems/'+payableItemId),itemSnap=await itemRef.get();
  if(!itemSnap.exists)throw new Error('The payable item was not found.');
  const item=itemSnap.data()||{};
  if(!(await itemVisibleToUser(ctx,item)))throw new Error('This charge is not available to your account.');
  if(item.paymentRequired===false)throw new Error('This item does not require payment.');
  if(!activeWindow(item))throw new Error('This payment is not currently available.');
  const provider=await providerAllowed(ctx.db,item,providerKey,method);
  const organizationId=text(item.organizationId)||text(ctx.profile.organizationId)||ctx.organizationId;
  const lockKey=hash(ctx.auth.uid+':'+payableItemId+':'+organizationId);
  const lockRef=ctx.db.doc('paymentLocks/'+lockKey);
  const paymentId='pay_'+randomUUID().replaceAll('-','');
  const paymentRef=ctx.db.doc('paymentTransactions/'+paymentId);
  const reference=newReference();
  const amountMinor=Number(item.amountMinor);
  const currency=normalizeCurrency(item.currency);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('The configured payment amount is invalid.');

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
      payableItemId,itemId:text(item.itemId),itemType:text(item.itemType) as PaymentTransaction['itemType'],
      description:text(item.name),itemSnapshot:{
        name:text(item.name),description:text(item.description),itemId:text(item.itemId),
        itemType:text(item.itemType),amountMinor,currency,organizationName:text(item.organizationName),fulfilmentConfig:object(item.fulfilmentConfig),
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
    tx.set(lockRef,{paymentId,payerUid:ctx.auth.uid,payableItemId,organizationId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  if(reused)return {payment:reused,reused:true};

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
    return {payment:serializePayment(paymentId,latest.data()||{}),checkout:result.checkout||null,reused:false};
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
  const verification=await provider.verifyPayment(reference);
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
  const existing=await fulfilmentRef.get();
  if(existing.data()?.status==='fulfilled'){
    if(payment.fulfilmentStatus!=='fulfilled')await paymentRef.set({fulfilmentStatus:'fulfilled',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return;
  }

  const config=object(item.fulfilmentConfig);
  const uid=text(payment.payerUid),organizationId=text(payment.organizationId);
  const receiptRef=db.doc('paymentReceipts/'+paymentId);
  const receiptNumber='RCPT-'+text(payment.reference);
  const batch=db.batch();
  batch.set(fulfilmentRef,{paymentId,status:'processing',startedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  batch.set(receiptRef,{
    id:paymentId,receiptNumber,paymentId,reference:text(payment.reference),
    payerUid:uid,payerEmail:text(payment.payerEmail),payerName:text(payment.payerName),
    organizationId,itemSnapshot:object(payment.itemSnapshot),amountMinor:Number(payment.amountMinor),
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
    if(!organizationId)throw new Error('A subscription payment requires an organization.');
    const plan=object(config.planSnapshot);
    const interval=text(plan.interval)||'month';
    const start=new Date(),end=new Date(start);
    if(interval==='year')end.setUTCFullYear(end.getUTCFullYear()+1);
    else if(interval==='month')end.setUTCMonth(end.getUTCMonth()+1);
    else end.setUTCFullYear(end.getUTCFullYear()+100);
    batch.set(db.doc('organizations/'+organizationId),{
      plan:text(plan.id)||text(payment.itemId),quotas:object(plan.quotas),featureEntitlements:object(plan.features),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    batch.set(db.doc('organizations/'+organizationId+'/subscription/current'),{
      organizationId,planId:text(plan.id)||text(payment.itemId),status:'active',
      activationSource:'payment',billingProvider:text(payment.provider),lastPaymentId:paymentId,
      lastPaidAt:FieldValue.serverTimestamp(),currentPeriodStart:start.toISOString(),
      currentPeriodEnd:end.toISOString(),renewalMode:'manual',
      activatedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  }else if(!['donation'].includes(itemType)){
    batch.set(db.doc('paymentEntitlements/'+hash(uid+':'+text(payment.payableItemId))),{
      uid,organizationId,payableItemId:text(payment.payableItemId),itemId:text(payment.itemId),
      itemType,paymentId,status:'active',grantedAt:FieldValue.serverTimestamp(),source:'verified-payment',
    },{merge:true});
  }

  batch.set(fulfilmentRef,{status:'fulfilled',fulfilledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  batch.set(paymentRef,{
    fulfilmentStatus:'fulfilled',fulfilledAt:FieldValue.serverTimestamp(),
    receiptId:paymentId,updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  await batch.commit();
  await paymentAudit(db,paymentId,'fulfilment.completed','system',{itemType});
}

export async function paymentHistory(ctx:TenantContext){
  const snap=await ctx.db.collection('paymentTransactions').where('payerUid','==',ctx.auth.uid).limit(200).get();
  return snap.docs.map(doc=>serializePayment(doc.id,doc.data())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
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
  return serializePayment(doc.id,doc.data());
}

export async function receiptForUser(ctx:TenantContext,paymentIdValue:unknown){
  const paymentId=safePaymentId(paymentIdValue,'payment identifier');
  const payment=await ctx.db.doc('paymentTransactions/'+paymentId).get();
  if(!payment.exists||text(payment.data()?.payerUid)!==ctx.auth.uid)throw new Error('The receipt was not found.');
  const receipt=await ctx.db.doc('paymentReceipts/'+paymentId).get();
  if(!receipt.exists)throw new Error('The receipt is not available yet.');
  const data=receipt.data()||{};
  return {...data,paidAt:timestampIso(data.paidAt),issuedAt:timestampIso(data.issuedAt)};
}

export async function adminListTransactions(ctx:TenantContext,filters:Record<string,unknown>={}){
  await requirePermission(ctx,'payments','view');
  const allowed=new Set(await accessibleOrganizationIds(ctx));
  const snap=await ctx.db.collection('paymentTransactions').limit(500).get();
  let rows=snap.docs.filter(doc=>{
    const data=doc.data(),org=text(data.organizationId);
    return ctx.isSuperAdmin||(!org&&ctx.tenantType==='hierarchy')||allowed.has(org)||(ctx.tenantType==='organization'&&org===ctx.organizationId);
  }).map(doc=>serializePayment(doc.id,doc.data()));
  const search=text(filters.search).toLowerCase();
  const status=text(filters.status),provider=text(filters.provider),method=text(filters.paymentMethod),organizationId=text(filters.organizationId);
  if(search)rows=rows.filter(row=>[
    row.reference,row.providerReference,row.payerName,row.payerEmail,row.description,
  ].some(value=>text(value).toLowerCase().includes(search)));
  if(status)rows=rows.filter(row=>row.status===status);
  if(provider)rows=rows.filter(row=>row.provider===provider);
  if(method)rows=rows.filter(row=>row.paymentMethod===method);
  if(organizationId){
    if(!ctx.isSuperAdmin&&!allowed.has(organizationId))throw new Error('The organization is outside your scope.');
    rows=rows.filter(row=>row.organizationId===organizationId);
  }
  return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

export async function adminPaymentDetails(ctx:TenantContext,paymentIdValue:unknown){
  await requirePermission(ctx,'payments','view');
  const paymentId=safePaymentId(paymentIdValue,'payment identifier');
  const ref=ctx.db.doc('paymentTransactions/'+paymentId),snap=await ref.get();
  if(!snap.exists)throw new Error('The transaction was not found.');
  const org=text(snap.data()?.organizationId);
  if(!ctx.isSuperAdmin){
    const allowed=new Set(await accessibleOrganizationIds(ctx));
    if(org&&!allowed.has(org))throw new Error('The transaction is outside your authorized scope.');
  }
  const [attempts,audit,receipt]=await Promise.all([
    ref.collection('attempts').orderBy('createdAt','desc').limit(50).get(),
    ref.collection('audit').orderBy('createdAt','desc').limit(100).get(),
    ctx.db.doc('paymentReceipts/'+paymentId).get(),
  ]);
  return {
    payment:serializePayment(paymentId,snap.data()||{}),
    attempts:attempts.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:timestampIso(doc.data().createdAt),updatedAt:timestampIso(doc.data().updatedAt)})),
    audit:audit.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:timestampIso(doc.data().createdAt)})),
    receipt:receipt.exists?{...receipt.data(),issuedAt:timestampIso(receipt.data()?.issuedAt),paidAt:timestampIso(receipt.data()?.paidAt)}:null,
  };
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
  const raw=rawWebhookBody(req);
  const signature=header(req,'x-lenco-signature');
  if(!provider.verifyWebhook(raw,signature))throw new Error('Invalid payment webhook signature.');
  const event=object(req.body);
  const data=object(event.data);
  const reference=safeReference(data.reference);
  const eventType=text(event.event)||'provider.event';
  const eventId=hash(providerKey+':'+eventType+':'+reference+':'+text(data.lencoReference)+':'+text(data.status)+':'+text(data.completedAt));
  const eventRef=db.doc('paymentWebhookEvents/'+eventId);
  const paymentDoc=await loadPaymentByReference(db,reference);
  if(!paymentDoc){
    await eventRef.set({provider:providerKey,eventType,reference,status:'orphaned',receivedAt:FieldValue.serverTimestamp()},{merge:false});
    return {duplicate:false,orphaned:true};
  }
  let duplicate=false;
  await db.runTransaction(async tx=>{
    const existing=await tx.get(eventRef);
    if(existing.exists){duplicate=true;return;}
    tx.create(eventRef,{
      provider:providerKey,eventType,reference,paymentId:paymentDoc.id,
      providerStatus:text(data.status),providerReference:text(data.lencoReference),
      receivedAt:FieldValue.serverTimestamp(),processingStatus:'received',
    });
    tx.set(paymentDoc.ref,{webhookStatus:'received',lastWebhookAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  if(duplicate){
    await paymentDoc.ref.set({webhookStatus:'duplicate',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {duplicate:true,paymentId:paymentDoc.id};
  }
  try{
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
  if(paymentIdValue){
    const details=await adminPaymentDetails(ctx,paymentIdValue);
    return {payment:await verifyAndApplyPayment(ctx.db,details.payment.reference,'admin-reconciliation')};
  }
  if(!ctx.isSuperAdmin)throw new Error('Only Super Admin can run platform-wide payment reconciliation.');
  return {summary:await reconcilePendingPayments(ctx.db,100)};
}

export async function adminExportTransactions(ctx:TenantContext,filters:Record<string,unknown>={}){
  const rows=await adminListTransactions(ctx,filters);
  const headerRow=['Reference','Date','Payer','Email','Organization','Item','Amount','Currency','Provider','Method','Status','Provider Reference','Verification','Reconciliation'];
  const escape=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
  const lines=[headerRow.map(escape).join(',')];
  for(const row of rows)lines.push([
    row.reference,row.createdAt,row.payerName,row.payerEmail,row.organizationId,row.description,
    row.amountDecimal,row.currency,row.provider,row.paymentMethod,row.status,row.providerReference,
    row.verificationStatus,row.reconciliationStatus,
  ].map(escape).join(','));
  return lines.join('\n');
}

export async function listPaymentProviders(ctx:TenantContext){
  const catalog=await safeProviderCatalog(ctx.db);
  return catalog;
}

export function configuredPaymentStatuses(){return [...PAYMENT_STATUSES];}
