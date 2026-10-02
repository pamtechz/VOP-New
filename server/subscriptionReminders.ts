import { ensureOrganizationDefaultSubscription } from './tenant.js';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

const RECIPIENT_ROLES=new Set(['owner','admin']);

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

export async function organizationUsesFreeTier(db:Firestore,organizationId:string){
  if(!organizationId)return false;
  const subscription=await db.doc(`organizations/${organizationId}/subscription/current`).get();
  if(!subscription.exists)return false;
  const data=subscription.data()||{};
  const status=String(data.status||'').trim().toLowerCase();
  return ['active','trialing'].includes(status)&&planPrice(data)===0;
}

export async function sendFreeTierUpgradeReminder(
  db:Firestore,
  organizationId:string,
  now=new Date(),
){
  if(!(await organizationUsesFreeTier(db,organizationId)))return {organizationId,recipients:0,delivered:0,freeTier:false};
  const organization=await db.doc(`organizations/${organizationId}`).get();
  if(!organization.exists||organization.data()?.status!=='active')return {organizationId,recipients:0,delivered:0,freeTier:false};
  const members=await db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
  const recipients=members.docs
    .filter(document=>RECIPIENT_ROLES.has(String(document.data()?.role||'').trim().toLowerCase()))
    .map(document=>String(document.data()?.uid||document.id).trim())
    .filter(Boolean);
  const key=dayKey(now);
  const name=String(organization.data()?.name||'your organization').trim();
  let delivered=0;
  for(let offset=0;offset<recipients.length;offset+=400){
    const chunk=recipients.slice(offset,offset+400);
    const refs=chunk.map(uid=>db.collection('notifications').doc(
      `subscription_free_${safe(organizationId)}_${key}_${safe(uid)}`.slice(0,500),
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
        organizationId,
        hierarchyId:'',
        title:'Free plan active — upgrade when ready',
        body:`${name} is currently using the free VOP plan. Paid plans provide higher limits and additional capacity. Your free limits remain enforced until the organization upgrades.`,
        type:'system',
        channel:'in_app',
        actionUrl:'/?route=payments',
        metadata:{kind:'free_subscription_upgrade',organizationId,reminderDate:now.toISOString().slice(0,10)},
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
  return {organizationId,recipients:recipients.length,delivered,freeTier:true};
}

export async function remindFreeTierOrganizations(db:Firestore,limit=200){
  const organizations=await db.collection('organizations').where('status','==','active').limit(Math.max(1,Math.min(500,limit))).get();
  let freeTierOrganizations=0,delivered=0,recipients=0;
  for(const organization of organizations.docs){
    await ensureOrganizationDefaultSubscription(db,organization.id,'system:subscription-reconciliation');
    const result=await sendFreeTierUpgradeReminder(db,organization.id);
    if(!result.freeTier)continue;
    freeTierOrganizations+=1;
    delivered+=result.delivered;
    recipients+=result.recipients;
  }
  return {checked:organizations.size,freeTierOrganizations,recipients,delivered};
}
