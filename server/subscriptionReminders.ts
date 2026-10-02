import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  billingTenantAudienceEnabled, billingTenantRef, billingTenantSubscriptionRef,
  ensureBillingTenantDefaultSubscription, type BillingTenantType,
} from './tenant.js';

const RECIPIENT_ROLES=new Set(['owner','admin']);
const INSTITUTIONAL_TENANTS:Array<{type:BillingTenantType;collection:string}>=[
  {type:'organization',collection:'organizations'},
  {type:'church',collection:'churches'},
  {type:'district',collection:'districts'},
  {type:'conference',collection:'conferences'},
  {type:'union',collection:'unions'},
];

function safe(value:unknown){
  return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,120);
}

function dayKey(date:Date){
  return date.toISOString().slice(0,10).replaceAll('-','');
}

function planPrice(data:Record<string,unknown>){
  const snapshot=data.planSnapshot&&typeof data.planSnapshot==='object'
    ?data.planSnapshot as Record<string,unknown>:{};
  const value=Number(snapshot.priceUsd??data.priceUsd??NaN);
  return Number.isFinite(value)?value:NaN;
}

export async function billingTenantUsesFreeTier(
  db:Firestore,
  billingTenantType:BillingTenantType,
  billingTenantId:string,
){
  if(!billingTenantId||!(await billingTenantAudienceEnabled(db,billingTenantType)))return false;
  const subscription=await billingTenantSubscriptionRef(db,billingTenantType,billingTenantId).get();
  if(!subscription.exists)return false;
  const data=subscription.data()||{};
  const status=String(data.status||'').trim().toLowerCase();
  return ['active','trialing'].includes(status)&&planPrice(data)===0;
}

async function billingTenantReminderRecipients(
  db:Firestore,
  billingTenantType:BillingTenantType,
  billingTenantId:string,
){
  if(billingTenantType==='organization'){
    const members=await db.collection(`organizations/${billingTenantId}/members`).where('active','==',true).get();
    return members.docs
      .filter(document=>RECIPIENT_ROLES.has(String(document.data()?.role||'').trim().toLowerCase()))
      .map(document=>String(document.data()?.uid||document.id).trim())
      .filter(Boolean);
  }
  const role=billingTenantType+'_admin';
  const users=await db.collection('users').where('role','==',role).limit(500).get();
  return users.docs
    .filter(document=>String(document.data()?.adminNodeId||'').trim()===billingTenantId)
    .map(document=>String(document.data()?.uid||document.id).trim())
    .filter(Boolean);
}

export async function sendBillingTenantFreeTierUpgradeReminder(
  db:Firestore,
  billingTenantType:BillingTenantType,
  billingTenantId:string,
  now=new Date(),
){
  const base={
    billingTenantType,billingTenantId,
    organizationId:billingTenantType==='organization'?billingTenantId:'',
  };
  if(!(await billingTenantUsesFreeTier(db,billingTenantType,billingTenantId))){
    return {...base,recipients:0,delivered:0,freeTier:false};
  }
  const tenant=await billingTenantRef(db,billingTenantType,billingTenantId).get();
  if(!tenant.exists)return {...base,recipients:0,delivered:0,freeTier:false};
  const status=String(tenant.data()?.status||'').trim().toLowerCase();
  if(['inactive','disabled','archived','deleted'].includes(status)){
    return {...base,recipients:0,delivered:0,freeTier:false};
  }
  const recipients=await billingTenantReminderRecipients(db,billingTenantType,billingTenantId);
  const key=dayKey(now);
  const name=String(tenant.data()?.name||tenant.data()?.title||'your institution').trim();
  let delivered=0;
  for(let offset=0;offset<recipients.length;offset+=400){
    const chunk=recipients.slice(offset,offset+400);
    const refs=chunk.map(uid=>db.collection('notifications').doc(
      `subscription_free_${safe(billingTenantType)}_${safe(billingTenantId)}_${key}_${safe(uid)}`.slice(0,500),
    ));
    const existing=await db.getAll(...refs);
    const batch=db.batch();
    let writes=0;
    for(let index=0;index<chunk.length;index+=1){
      if(existing[index]?.exists)continue;
      const uid=chunk[index];
      batch.create(refs[index],{
        recipientId:uid,
        userId:uid,
        organizationId:billingTenantType==='organization'?billingTenantId:'',
        hierarchyId:billingTenantType==='organization'?'':billingTenantId,
        title:'Free plan active — upgrade when ready',
        body:`${name} is currently using the free VOP plan. Paid plans provide higher limits and additional capacity. Free-plan limits remain enforced until the institution upgrades.`,
        type:'system',
        channel:'in_app',
        actionUrl:'/?route=payments',
        metadata:{
          kind:'free_subscription_upgrade',
          billingTenantType,billingTenantId,
          organizationId:billingTenantType==='organization'?billingTenantId:'',
          reminderDate:now.toISOString().slice(0,10),
        },
        createdBy:'system:subscription-reminder',
        createdAt:FieldValue.serverTimestamp(),
        read:false,
        readAt:null,
      });
      delivered+=1;
      writes+=1;
    }
    if(writes)await batch.commit();
  }
  return {...base,recipients:recipients.length,delivered,freeTier:true};
}

export async function organizationUsesFreeTier(db:Firestore,organizationId:string){
  return billingTenantUsesFreeTier(db,'organization',organizationId);
}

export async function sendFreeTierUpgradeReminder(
  db:Firestore,
  organizationId:string,
  now=new Date(),
){
  return sendBillingTenantFreeTierUpgradeReminder(db,'organization',organizationId,now);
}

// Legacy function name retained for the scheduled payment reconciliation caller.
// It now reconciles and reminds every subscription-bearing institutional tenant.
export async function remindFreeTierOrganizations(db:Firestore,limit=200){
  let checked=0,freeTierOrganizations=0,freeTierTenants=0,delivered=0,recipients=0;
  for(const definition of INSTITUTIONAL_TENANTS){
    if(!(await billingTenantAudienceEnabled(db,definition.type)))continue;
    const snapshot=await db.collection(definition.collection).limit(Math.max(1,Math.min(500,limit))).get();
    for(const tenant of snapshot.docs){
      if(checked>=limit*INSTITUTIONAL_TENANTS.length)break;
      checked+=1;
      await ensureBillingTenantDefaultSubscription(
        db,definition.type,tenant.id,'system:subscription-reconciliation',
      );
      const result=await sendBillingTenantFreeTierUpgradeReminder(db,definition.type,tenant.id);
      if(!result.freeTier)continue;
      freeTierTenants+=1;
      if(definition.type==='organization')freeTierOrganizations+=1;
      delivered+=result.delivered;
      recipients+=result.recipients;
    }
  }
  return {checked,freeTierOrganizations,freeTierTenants,recipients,delivered};
}
