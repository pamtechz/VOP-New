import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type NotificationChannel='in_app'|'email';
export type NotificationType='learning-support'|'assignment'|'mentor-feedback'|'certificate'|'announcement'|'prayer'|'system';

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
}

export async function createNotification(db: Firestore,input:CreateNotificationInput){
  const recipientId=String(input.recipientId||'').trim();
  if(!recipientId)throw new Error('Notification recipient is required.');
  const title=String(input.title||'').trim();
  const body=String(input.body||'').trim();
  if(!title||!body)throw new Error('Notification title and body are required.');
  const ref=db.collection('notifications').doc();
  await ref.set({
    organizationId:String(input.organizationId||'').trim(),
    hierarchyId:String(input.hierarchyId||'').trim(),
    recipientId,
    title,
    body,
    type:input.type,
    channel:input.channel||'in_app',
    actionUrl:String(input.actionUrl||'').trim(),
    metadata:input.metadata||{},
    createdAt:FieldValue.serverTimestamp(),
    read:false,
    readAt:null,
  });
  return ref.id;
}

// Canonical notification persistence remains server-authoritative and scope-aware.
// Full validation branch: engagement implementation against main baseline.
