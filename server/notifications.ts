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
