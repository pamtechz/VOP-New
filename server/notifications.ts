import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type NotificationChannel = 'in_app' | 'email';
export type NotificationType =
  | 'learning-support' | 'assignment' | 'mentor-feedback' | 'certificate'
  | 'announcement' | 'event' | 'prayer' | 'invitation' | 'system';

export interface CreateNotificationInput {
  organizationId?: string;
  hierarchyId?: string;
  recipientId: string;
  title: string;
  body: string;
  type: NotificationType;
  channel?: NotificationChannel;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

function safeActionUrl(value: unknown) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    throw new Error('Notification action must be a safe internal path.');
  }
  return url.slice(0, 500);
}

type NotificationPreferences={
  enabled:boolean;
  email:boolean;
  announcements:boolean;
  certificates:boolean;
};

export type NotificationDeliveryResult={
  id:string;
  status:'sent'|'fallback_in_app'|'suppressed';
  channel:NotificationChannel|'none';
  reason?:string;
};

function normalizedPreferences(data:unknown):NotificationPreferences{
  const settings=data&&typeof data==='object'?data as Record<string,unknown>:{};
  const notifications=settings.notifications&&typeof settings.notifications==='object'
    ?settings.notifications as Record<string,unknown>:{};
  return {
    enabled:notifications.enabled!==false,
    email:notifications.email!==false,
    announcements:notifications.announcements!==false,
    certificates:notifications.certificates!==false,
  };
}

export async function notificationPreferences(db:Firestore,recipientId:string){
  const snapshot=await db.doc('users/'+recipientId+'/settings/personal').get();
  return normalizedPreferences(snapshot.data());
}

export function notificationPreferenceDecision(
  preferences:NotificationPreferences,
  type:NotificationType,
  requestedChannel:NotificationChannel='in_app',
){
  const mandatory=type==='system'||type==='invitation';
  if(!mandatory&&!preferences.enabled)return {allowed:false,channel:'none' as const,reason:'all_notifications_disabled'};
  if((type==='announcement'||type==='event')&&!preferences.announcements){
    return {allowed:false,channel:'none' as const,reason:'announcement_notifications_disabled'};
  }
  if(type==='certificate'&&!preferences.certificates){
    return {allowed:false,channel:'none' as const,reason:'certificate_notifications_disabled'};
  }
  if(requestedChannel==='email'&&!preferences.email){
    return {allowed:true,channel:'in_app' as const,reason:'email_notifications_disabled'};
  }
  return {allowed:true,channel:requestedChannel};
}

function escapeHtml(value:string){
  return value.replace(/[&<>"']/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[character]||character));
}

async function recordSuppressedDelivery(db:Firestore,input:CreateNotificationInput,recipientId:string,reason:string){
  const ref=db.collection('notificationDeliveries').doc();
  await ref.set({
    recipientId,organizationId:String(input.organizationId||'').trim(),
    type:input.type,requestedChannel:input.channel||'in_app',
    status:'suppressed',reason,createdBy:String(input.createdBy||'').trim(),
    createdAt:FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function deliverNotification(db: Firestore, input: CreateNotificationInput):Promise<NotificationDeliveryResult> {
  const recipientId = String(input.recipientId || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,180}$/.test(recipientId)) throw new Error('A valid notification recipient is required.');
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!title || title.length > 180 || !body || body.length > 2000) {
    throw new Error('Notification title and message are required and must be within the allowed length.');
  }

  const requestedChannel=input.channel||'in_app';
  const preferences=await notificationPreferences(db,recipientId);
  const decision=notificationPreferenceDecision(preferences,input.type,requestedChannel);
  if(!decision.allowed){
    const id=await recordSuppressedDelivery(db,input,recipientId,decision.reason||'preference');
    return {id,status:'suppressed',channel:'none',reason:decision.reason};
  }

  let channel:NotificationChannel=decision.channel;
  let status:'sent'|'fallback_in_app'='sent';
  let fallbackReason=decision.reason||'';
  if(channel==='email'){
    const profile=await db.doc('users/'+recipientId).get();
    const to=String(profile.data()?.email||'').trim();
    const apiKey=String(process.env.RESEND_API_KEY||'').trim();
    const from=String(process.env.RESEND_FROM_EMAIL||'').trim();
    if(to&&apiKey&&from){
      try{
        const response=await fetch('https://api.resend.com/emails',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},
          body:JSON.stringify({
            from,to:[to],subject:title,
            html:'<p>'+escapeHtml(body).replace(/\n/g,'<br/>')+'</p>',
          }),
        });
        if(!response.ok)throw new Error('provider_rejected');
      }catch{
        channel='in_app';status='fallback_in_app';fallbackReason='email_delivery_failed';
      }
    }else{
      channel='in_app';status='fallback_in_app';
      fallbackReason=!preferences.email?'email_notifications_disabled':!to?'recipient_email_missing':'email_provider_not_configured';
    }
  }else if(requestedChannel==='email'&&decision.channel==='in_app'){
    status='fallback_in_app';
  }

  const ref = db.collection('notifications').doc();
  await ref.set({
    recipientId,userId:recipientId,
    organizationId:String(input.organizationId||'').trim(),
    hierarchyId:String(input.hierarchyId||'').trim(),
    title,body,type:input.type,channel,
    requestedChannel,
    deliveryStatus:status,
    deliveryReason:fallbackReason,
    actionUrl:safeActionUrl(input.actionUrl),
    metadata:input.metadata&&typeof input.metadata==='object'?input.metadata:{},
    createdBy:String(input.createdBy||'').trim(),
    createdAt:FieldValue.serverTimestamp(),
    sentAt:FieldValue.serverTimestamp(),
    read:false,readAt:null,
  });
  return {id:ref.id,status,channel,reason:fallbackReason||undefined};
}

export async function createNotification(db: Firestore, input: CreateNotificationInput) {
  return (await deliverNotification(db,input)).id;
}


export function publicationNotificationId(type: 'announcement' | 'event', sourceId: string, recipientId: string) {
  const safeSource = String(sourceId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  const safeRecipient = String(recipientId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
  if (!safeSource || !safeRecipient) throw new Error('A valid publication source and recipient are required.');
  return `${type}__${safeSource}__${safeRecipient}`.slice(0, 500);
}

export type PublicationAudience = 'all' | 'learners' | 'leaders' | 'mentors' | 'teachers' | 'staff';

export function normalizePublicationAudience(value: unknown): PublicationAudience {
  const audience = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!audience || ['all','everyone','members','all members','all users','users'].includes(audience)) return 'all';
  if (['learner','learners','student','students'].includes(audience)) return 'learners';
  if (['leader','leaders','admin','admins','administrators'].includes(audience)) return 'leaders';
  if (['mentor','mentors'].includes(audience)) return 'mentors';
  if (['teacher','teachers'].includes(audience)) return 'teachers';
  if (['staff','ministry team','ministry teams'].includes(audience)) return 'staff';
  throw new Error('Target audience must be All members, Learners, Leaders, Mentors, Teachers, or Staff.');
}

export function audienceAllowsRole(audience: PublicationAudience, roleValue: unknown) {
  const role = String(roleValue || '').trim().toLowerCase();
  if (audience === 'all') return true;
  if (audience === 'learners') return ['learner','student','viewer','member'].includes(role);
  if (audience === 'mentors') return role === 'mentor';
  if (audience === 'teachers') return role === 'teacher';
  if (audience === 'leaders') return ['owner','admin','editor','mentor','teacher'].includes(role);
  return ['owner','admin','editor','mentor','teacher','staff'].includes(role);
}

export interface NotifyOrganizationInput {
  organizationId: string;
  sourceId: string;
  title: string;
  body: string;
  type: Extract<NotificationType, 'announcement' | 'event'>;
  actionUrl: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
  targetAudience?: PublicationAudience | string;
}

/**
 * Idempotent in-app publication fan-out. A source is delivered at most once
 * per organization member, even if an HTTP request is retried.
 */
export async function notifyOrganizationMembers(db: Firestore, input: NotifyOrganizationInput) {
  const organizationId = String(input.organizationId || '').trim();
  const sourceId = String(input.sourceId || '').trim();
  if (!organizationId || !sourceId) throw new Error('Organization and source are required for publication delivery.');
  const audience = normalizePublicationAudience(input.targetAudience);
  const members = await db.collection(`organizations/${organizationId}/members`).where('active', '==', true).get();
  const recipients = members.docs
    .filter(doc => audienceAllowsRole(audience, doc.data()?.role))
    .map(doc => String(doc.data()?.uid || doc.id).trim())
    .filter(uid => /^[A-Za-z0-9:_-]{1,180}$/.test(uid));
  let delivered = 0;
  for (let offset = 0; offset < recipients.length; offset += 400) {
    const chunk = recipients.slice(offset, offset + 400);
    const refs = chunk.map(uid => db.collection('notifications').doc(
      publicationNotificationId(input.type, sourceId, uid),
    ));
    const existing = await db.getAll(...refs);
    const batch = db.batch();
    let writes = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (existing[index]?.exists) continue;
      const uid = chunk[index];
      batch.create(refs[index], {
        recipientId: uid,
        userId: uid,
        organizationId,
        hierarchyId: '',
        title: String(input.title || '').trim().slice(0, 180),
        body: String(input.body || '').trim().slice(0, 2000),
        type: input.type,
        channel: 'in_app',
        actionUrl: safeActionUrl(input.actionUrl),
        metadata: { ...(input.metadata || {}), sourceId, targetAudience:audience },
        createdBy: String(input.createdBy || '').trim(),
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        readAt: null,
        deliveryKey: `${input.type}:${sourceId}`,
      });
      writes += 1;
      delivered += 1;
    }
    if (writes) await batch.commit();
  }
  return { delivered, recipients: recipients.length, audience };
}
