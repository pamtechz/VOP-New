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

export async function createNotification(db: Firestore, input: CreateNotificationInput) {
  const recipientId = String(input.recipientId || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,180}$/.test(recipientId)) throw new Error('A valid notification recipient is required.');
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!title || title.length > 180 || !body || body.length > 2000) {
    throw new Error('Notification title and message are required and must be within the allowed length.');
  }
  const ref = db.collection('notifications').doc();
  await ref.set({
    recipientId,
    userId: recipientId,
    organizationId: String(input.organizationId || '').trim(),
    hierarchyId: String(input.hierarchyId || '').trim(),
    title,
    body,
    type: input.type,
    channel: input.channel || 'in_app',
    actionUrl: safeActionUrl(input.actionUrl),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdBy: String(input.createdBy || '').trim(),
    createdAt: FieldValue.serverTimestamp(),
    read: false,
    readAt: null,
  });
  return ref.id;
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
