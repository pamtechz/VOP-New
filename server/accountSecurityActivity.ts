import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type AccountSecurityAction =
  | 'passkey_sign_in' | 'passkey_added' | 'passkey_removed'
  | 'sessions_revoked' | 'account_exported'
  | 'deletion_requested' | 'deletion_cancelled';

const EVENT_LABELS:Record<AccountSecurityAction,{title:string;body:string}>={
  passkey_sign_in:{title:'Passkey sign-in',body:'Your VOP account was accessed using a registered passkey.'},
  passkey_added:{title:'Passkey added',body:'A new passkey was added to your VOP account.'},
  passkey_removed:{title:'Passkey removed',body:'A passkey was removed from your VOP account.'},
  sessions_revoked:{title:'All sessions signed out',body:'VOP revoked refresh tokens for your account.'},
  account_exported:{title:'Account data exported',body:'Your VOP account data was requested for export.'},
  deletion_requested:{title:'Account deletion requested',body:'A deletion request was submitted for your VOP account.'},
  deletion_cancelled:{title:'Account deletion cancelled',body:'Your pending account deletion request was cancelled.'},
};

function requireUid(uid:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw new Error('A valid account is required.');
  return uid;
}

export async function recordAccountSecurityEvent(db:Firestore,uid:string,action:AccountSecurityAction){
  const owner=requireUid(uid);
  const label=EVENT_LABELS[action];
  if(!label)throw new Error('Unsupported account security event.');
  const occurredAt=new Date().toISOString();
  const event=db.collection('accountSecurityEvents').doc();
  const notificationNeeded=action!=='passkey_sign_in';
  const notice=db.collection('notifications').doc();
  const batch=db.batch();
  batch.create(event,{
    uid:owner,action,title:label.title,occurredAt,
    createdAt:FieldValue.serverTimestamp(),source:'server',
    ...(notificationNeeded?{notificationId:notice.id}:{}),
  });
  if(notificationNeeded)batch.create(notice,{
    recipientId:owner,type:'security',channel:'in_app',
    title:label.title,body:label.body,
    mandatory:true,sourceSecurityEventId:event.id,
    read:false,readAt:null,deliveryState:'sent',
    deliveredAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return {id:event.id,action,title:label.title,occurredAt};
}

export async function recentAccountSecurityEvents(db:Firestore,uid:string,limit=30){
  const owner=requireUid(uid);
  const size=Math.max(1,Math.min(50,Math.trunc(limit)));
  const snapshot=await db.collection('accountSecurityEvents')
    .where('uid','==',owner).orderBy('occurredAt','desc').limit(size).get();
  const entries=snapshot.docs.map(document=>{
    const data=document.data();
    return {
      id:document.id,
      action:String(data.action||''),
      title:String(data.title||''),
      occurredAt:String(data.occurredAt||''),
    };
  }).filter(row=>Object.hasOwn(EVENT_LABELS,row.action));
  return entries;
}
