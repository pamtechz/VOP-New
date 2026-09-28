import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type NotificationChannel = 'in_app' | 'email';
export type NotificationType =
  | 'learning-support' | 'assignment' | 'mentor-feedback' | 'certificate'
  | 'announcement' | 'event' | 'prayer' | 'system';

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


export interface NotifyOrganizationInput {
  organizationId: string;
  sourceId: string;
  title: string;
  body: string;
  type: Extract<NotificationType, 'announcement' | 'event'>;
  actionUrl: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

/**
 * Idempotent in-app publication fan-out. A source is delivered at most once
 * per organization member, even if an HTTP request is retried.
 */
export async function notifyOrganizationMembers(db: Firestore, input: NotifyOrganizationInput) {
  const organizationId = String(input.organizationId || '').trim();
  const sourceId = String(input.sourceId || '').trim();
  if (!organizationId || !sourceId) throw new Error('Organization and source are required for publication delivery.');
  const members = await db.collection(`organizations/${organizationId}/members`).where('active', '==', true).get();
  const recipients = members.docs
    .map(doc => String(doc.data()?.uid || doc.id).trim())
    .filter(uid => /^[A-Za-z0-9:_-]{1,180}$/.test(uid));
  let delivered = 0;
  for (let offset = 0; offset < recipients.length; offset += 400) {
    const batch = db.batch();
    for (const uid of recipients.slice(offset, offset + 400)) {
      const safeSource = sourceId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
      const safeUid = uid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
      const notificationId = `${input.type}__${safeSource}__${safeUid}`.slice(0, 500);
      const ref = db.collection('notifications').doc(notificationId);
      batch.set(ref, {
        recipientId: uid,
        userId: uid,
        organizationId,
        hierarchyId: '',
        title: String(input.title || '').trim().slice(0, 180),
        body: String(input.body || '').trim().slice(0, 2000),
        type: input.type,
        channel: 'in_app',
        actionUrl: safeActionUrl(input.actionUrl),
        metadata: { ...(input.metadata || {}), sourceId },
        createdBy: String(input.createdBy || '').trim(),
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        readAt: null,
        deliveryKey: `${input.type}:${sourceId}`,
      }, { merge: false });
      delivered += 1;
    }
    await batch.commit();
  }
  return { delivered, recipients: recipients.length };
}
