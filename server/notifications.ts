import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';

export type NotificationChannel = 'in_app' | 'email';
export type NotificationType =
  | 'learning-support' | 'assignment' | 'mentor-feedback' | 'certificate'
  | 'announcement' | 'event' | 'prayer' | 'invitation' | 'system'
  | 'payment' | 'subscription' | 'study-reminder' | 'security';

export type NotificationDeliveryState =
  | 'queued' | 'sent' | 'delivered' | 'failed' | 'retrying' | 'fallback_in_app'
  | 'suppressed_by_preference' | 'suppressed_by_policy';

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
  /** Mandatory transactional/security notices may bypass user opt-outs, but
   * still require a configured delivery provider. */
  mandatory?: boolean;
}

export interface NotificationDeliveryResult {
  id: string;
  notificationId?: string;
  channel: NotificationChannel;
  state: NotificationDeliveryState;
  suppressionReason?: string;
  fallbackReason?: string;
  providerMessageId?: string;
}

type PersonalNotificationPreferences = {
  enabled: boolean;
  email: boolean;
  announcements: boolean;
  certificates: boolean;
};

function safeActionUrl(value: unknown) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    throw new Error('Notification action must be a safe internal path.');
  }
  return url.slice(0, 500);
}

function normalizedInput(input: CreateNotificationInput) {
  const recipientId = String(input.recipientId || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,180}$/.test(recipientId)) throw new Error('A valid notification recipient is required.');
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!title || title.length > 180 || !body || body.length > 2000) {
    throw new Error('Notification title and message are required and must be within the allowed length.');
  }
  return {
    recipientId,
    title,
    body,
    organizationId: String(input.organizationId || '').trim(),
    hierarchyId: String(input.hierarchyId || '').trim(),
    type: input.type,
    channel: input.channel || 'in_app' as NotificationChannel,
    actionUrl: safeActionUrl(input.actionUrl),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdBy: String(input.createdBy || '').trim(),
    mandatory: input.mandatory === true,
  };
}

function preferencesFrom(data: Record<string, unknown> | undefined): PersonalNotificationPreferences {
  const notifications = data?.notifications && typeof data.notifications === 'object'
    ? data.notifications as Record<string, unknown>
    : {};
  return {
    enabled: notifications.enabled !== false,
    email: notifications.email !== false,
    announcements: notifications.announcements !== false,
    certificates: notifications.certificates !== false,
  };
}

function preferenceSuppression(
  prefs: PersonalNotificationPreferences,
  type: NotificationType,
  channel: NotificationChannel,
  mandatory: boolean,
) {
  if (mandatory) return '';
  if (!prefs.enabled) return 'all_notifications_disabled';
  if (channel === 'email' && !prefs.email) return 'email_notifications_disabled';
  if ((type === 'announcement' || type === 'event') && !prefs.announcements) return 'announcement_notifications_disabled';
  if (type === 'certificate' && !prefs.certificates) return 'certificate_notifications_disabled';
  return '';
}

async function userDeliveryContext(db: Firestore, recipientId: string) {
  const [profile, personal] = await Promise.all([
    db.doc('users/' + recipientId).get(),
    db.doc('users/' + recipientId + '/settings/personal').get(),
  ]);
  return {
    email: String(profile.data()?.email || '').trim().toLowerCase(),
    preferences: preferencesFrom(personal.data() as Record<string, unknown> | undefined),
  };
}

async function platformEmailEnabled(db: Firestore) {
  const snapshot = await db.doc('system/settings').get();
  const data = snapshot.data() || {};
  const systemOptions = data.systemOptions && typeof data.systemOptions === 'object'
    ? data.systemOptions as Record<string, unknown> : {};
  const notifications = data.notifications && typeof data.notifications === 'object'
    ? data.notifications as Record<string, unknown> : {};
  // Keep backward compatibility while the duplicate legacy toggle is retired.
  return systemOptions.enableEmailNotifications === true || notifications.emailEnabled === true;
}

function deliveryBase(input: ReturnType<typeof normalizedInput>) {
  return {
    recipientId: input.recipientId,
    organizationId: input.organizationId,
    hierarchyId: input.hierarchyId,
    title: input.title,
    body: input.body,
    type: input.type,
    channel: input.channel,
    actionUrl: input.actionUrl,
    metadata: input.metadata,
    createdBy: input.createdBy,
    mandatory: input.mandatory,
  };
}

async function markSuppressed(
  db: Firestore,
  input: ReturnType<typeof normalizedInput>,
  reason: string,
  state: Extract<NotificationDeliveryState, 'suppressed_by_preference' | 'suppressed_by_policy'>,
  explicitId?: string,
) {
  const ref = explicitId
    ? db.collection('notificationDeliveries').doc(explicitId)
    : db.collection('notificationDeliveries').doc();
  await ref.set({
    ...deliveryBase(input),
    state,
    suppressionReason: reason,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: ref.id, channel: input.channel, state, suppressionReason: reason } satisfies NotificationDeliveryResult;
}

async function ensureInAppEmailFallback(
  db: Firestore,
  ref: DocumentReference,
  input: ReturnType<typeof normalizedInput>,
  reason: string,
  context = await userDeliveryContext(db, input.recipientId),
) {
  const inAppSuppression = preferenceSuppression(
    context.preferences, input.type, 'in_app', input.mandatory,
  );
  if (inAppSuppression) {
    return {notificationId:'',suppressionReason:inAppSuppression};
  }
  const notificationRef = db.collection('notifications').doc('email_fallback__' + ref.id);
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return;
    transaction.create(notificationRef, {
      ...deliveryBase(input),
      channel:'in_app',
      requestedChannel:'email',
      deliveryState:'sent',
      deliveryReason:reason,
      sourceDeliveryId:ref.id,
      deliveredAt:FieldValue.serverTimestamp(),
      createdAt:FieldValue.serverTimestamp(),
      read:false,
      readAt:null,
    });
  });
  await ref.set({
    fallbackNotificationId:notificationRef.id,
    fallbackReason:reason,
    fallbackAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  return {notificationId:notificationRef.id,suppressionReason:''};
}

async function fallbackEmailDelivery(
  db: Firestore,
  ref: DocumentReference,
  input: ReturnType<typeof normalizedInput>,
  reason: string,
  context = await userDeliveryContext(db, input.recipientId),
): Promise<NotificationDeliveryResult> {
  const fallback = await ensureInAppEmailFallback(db,ref,input,reason,context);
  if(!fallback.notificationId){
    await ref.set({
      state:'suppressed_by_preference',
      suppressionReason:fallback.suppressionReason,
      updatedAt:FieldValue.serverTimestamp(),
      nextAttemptAt:FieldValue.delete(),
    },{merge:true});
    return {
      id:ref.id,channel:'email',state:'suppressed_by_preference',
      suppressionReason:fallback.suppressionReason,
    };
  }
  await ref.set({
    state:'fallback_in_app',
    fallbackReason:reason,
    fallbackNotificationId:fallback.notificationId,
    nextAttemptAt:FieldValue.delete(),
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  return {
    id:ref.id,notificationId:fallback.notificationId,channel:'in_app',
    state:'fallback_in_app',fallbackReason:reason,
  };
}

async function attemptEmailDelivery(
  db: Firestore,
  ref: DocumentReference,
  input: ReturnType<typeof normalizedInput>,
  retryCount = 0,
): Promise<NotificationDeliveryResult> {
  const context = await userDeliveryContext(db, input.recipientId);
  const suppression = preferenceSuppression(context.preferences, input.type, 'email', input.mandatory);
  if (suppression) {
    if(suppression==='email_notifications_disabled'){
      return fallbackEmailDelivery(db,ref,input,suppression,context);
    }
    await ref.set({
      state: 'suppressed_by_preference',
      suppressionReason: suppression,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { id: ref.id, channel: 'email', state: 'suppressed_by_preference', suppressionReason: suppression };
  }

  if (!(await platformEmailEnabled(db))) {
    return fallbackEmailDelivery(db,ref,input,'platform_email_delivery_disabled',context);
  }

  if (!context.email) {
    await ref.set({
      failureCode: 'RECIPIENT_EMAIL_MISSING',
      failureMessage: 'The recipient account has no deliverable email address.',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return fallbackEmailDelivery(db,ref,input,'recipient_email_missing',context);
  }

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM_EMAIL || '').trim();
  if (!apiKey || !from) {
    await ref.set({
      failureCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      failureMessage: 'Email delivery provider credentials are not configured.',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return fallbackEmailDelivery(db,ref,input,'email_provider_not_configured',context);
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        from,
        to: [context.email],
        subject: input.title,
        text: input.body,
      }),
    });
    const provider = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (response.ok) {
      await ref.set({
        state: 'sent',
        provider: 'resend',
        providerMessageId: String(provider.id || ''),
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        failureCode: FieldValue.delete(),
        failureMessage: FieldValue.delete(),
        nextAttemptAt: FieldValue.delete(),
      }, { merge: true });
      return {
        id: ref.id,
        channel: 'email',
        state: 'sent',
        providerMessageId: String(provider.id || '') || undefined,
      };
    }

    const transient = response.status === 429 || response.status >= 500;
    const nextCount = retryCount + 1;
    const retrying = transient && nextCount < 4;
    const failureCode='RESEND_' + response.status;
    const failureMessage=String(provider.message || provider.name || 'Email provider rejected the message.').slice(0, 500);
    await ref.set({
      state: retrying ? 'retrying' : 'failed',
      provider: 'resend',
      retryCount: nextCount,
      failureCode,
      failureMessage,
      nextAttemptAt: retrying ? new Date(Date.now() + Math.min(24, 2 ** nextCount) * 60 * 60 * 1000).toISOString() : null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if(!retrying)return fallbackEmailDelivery(db,ref,input,'email_provider_rejected',context);
    const fallback=await ensureInAppEmailFallback(db,ref,input,'email_delivery_retrying',context);
    if(!fallback.notificationId){
      return {id:ref.id,channel:'email',state:'retrying',suppressionReason:fallback.suppressionReason};
    }
    return {
      id:ref.id,notificationId:fallback.notificationId,channel:'email',
      state:'retrying',fallbackReason:'email_delivery_retrying',
    };
  } catch (error) {
    const nextCount = retryCount + 1;
    const retrying = nextCount < 4;
    await ref.set({
      state: retrying ? 'retrying' : 'failed',
      provider: 'resend',
      retryCount: nextCount,
      failureCode: 'EMAIL_PROVIDER_NETWORK_ERROR',
      failureMessage: (error instanceof Error ? error.message : 'Email provider request failed.').slice(0, 500),
      nextAttemptAt: retrying ? new Date(Date.now() + Math.min(24, 2 ** nextCount) * 60 * 60 * 1000).toISOString() : null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if(!retrying)return fallbackEmailDelivery(db,ref,input,'email_provider_network_failed',context);
    const fallback=await ensureInAppEmailFallback(db,ref,input,'email_delivery_retrying',context);
    return {
      id:ref.id,
      notificationId:fallback.notificationId||undefined,
      channel:'email',
      state:'retrying',
      fallbackReason:fallback.notificationId?'email_delivery_retrying':undefined,
      suppressionReason:fallback.suppressionReason||undefined,
    };
  }
}

export async function deliverNotification(db: Firestore, raw: CreateNotificationInput): Promise<NotificationDeliveryResult> {
  const input = normalizedInput(raw);
  const context = await userDeliveryContext(db, input.recipientId);
  const suppression = preferenceSuppression(context.preferences, input.type, input.channel, input.mandatory);

  if (suppression) {
    if(input.channel==='email'&&suppression==='email_notifications_disabled'){
      const ref=db.collection('notificationDeliveries').doc();
      await ref.set({
        ...deliveryBase(input),state:'queued',retryCount:0,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      });
      return fallbackEmailDelivery(db,ref,input,suppression,context);
    }
    return markSuppressed(db, input, suppression, 'suppressed_by_preference');
  }

  if (input.channel === 'email') {
    const ref = db.collection('notificationDeliveries').doc();
    await ref.set({
      ...deliveryBase(input),
      state: 'queued',
      retryCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return attemptEmailDelivery(db, ref, input, 0);
  }

  const ref = db.collection('notifications').doc();
  await ref.set({
    ...deliveryBase(input),
    channel: 'in_app',
    deliveryState: 'sent',
    deliveredAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    read: false,
    readAt: null,
  });
  return { id: ref.id, notificationId: ref.id, channel: 'in_app', state: 'sent' };
}

/** Backward-compatible helper used by existing call sites. New code that needs
 * delivery state should call deliverNotification(). */
export async function createNotification(db: Firestore, input: CreateNotificationInput) {
  return (await deliverNotification(db, input)).id;
}

export async function retryPendingEmailNotifications(db: Firestore, limit = 50) {
  const snapshot = await db.collection('notificationDeliveries')
    .where('channel', '==', 'email')
    .where('state', '==', 'retrying')
    .limit(Math.max(1, Math.min(100, limit)))
    .get();
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  const now = Date.now();

  for (const document of snapshot.docs) {
    const data = document.data() || {};
    const nextAttemptAt = Date.parse(String(data.nextAttemptAt || ''));
    if (Number.isFinite(nextAttemptAt) && nextAttemptAt > now) continue;
    attempted += 1;
    const input = normalizedInput({
      recipientId: String(data.recipientId || ''),
      organizationId: String(data.organizationId || ''),
      hierarchyId: String(data.hierarchyId || ''),
      title: String(data.title || ''),
      body: String(data.body || ''),
      type: data.type as NotificationType,
      channel: 'email',
      actionUrl: String(data.actionUrl || ''),
      metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {},
      createdBy: String(data.createdBy || ''),
      mandatory: data.mandatory === true,
    });
    const result = await attemptEmailDelivery(db, document.ref, input, Math.max(0, Number(data.retryCount || 0)));
    if (result.state === 'sent') sent += 1;
    else if (result.state === 'suppressed_by_preference' || result.state === 'suppressed_by_policy') suppressed += 1;
    else if (result.state === 'failed') failed += 1;
  }
  return { attempted, sent, failed, suppressed };
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
 * per organization member, and preference suppressions are tracked without
 * placing suppressed notices in the recipient inbox.
 */
export async function notifyOrganizationMembers(db: Firestore, input: NotifyOrganizationInput) {
  const organizationId = String(input.organizationId || '').trim();
  const sourceId = String(input.sourceId || '').trim();
  if (!organizationId || !sourceId) throw new Error('Organization and source are required for publication delivery.');
  const audience = normalizePublicationAudience(input.targetAudience);
  const members = await db.collection(`organizations/${organizationId}/members`).where('active', '==', true).get();
  const recipients = members.docs
    .filter(document => audienceAllowsRole(audience, document.data()?.role))
    .map(document => String(document.data()?.uid || document.id).trim())
    .filter(uid => /^[A-Za-z0-9:_-]{1,180}$/.test(uid));

  let delivered = 0;
  let suppressed = 0;
  for (let offset = 0; offset < recipients.length; offset += 150) {
    const chunk = recipients.slice(offset, offset + 150);
    const notificationRefs = chunk.map(uid => db.collection('notifications').doc(publicationNotificationId(input.type, sourceId, uid)));
    const deliveryRefs = chunk.map(uid => db.collection('notificationDeliveries').doc(
      'publication__' + publicationNotificationId(input.type, sourceId, uid),
    ));
    const personalRefs = chunk.map(uid => db.doc('users/' + uid + '/settings/personal'));
    const [existingNotifications, existingDeliveries, personalSettings] = await Promise.all([
      db.getAll(...notificationRefs),
      db.getAll(...deliveryRefs),
      db.getAll(...personalRefs),
    ]);

    const batch = db.batch();
    let writes = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (existingNotifications[index]?.exists || existingDeliveries[index]?.exists) continue;
      const uid = chunk[index];
      const normalized = normalizedInput({
        organizationId,
        recipientId: uid,
        title: input.title,
        body: input.body,
        type: input.type,
        channel: 'in_app',
        actionUrl: input.actionUrl,
        metadata: { ...(input.metadata || {}), sourceId, targetAudience: audience },
        createdBy: input.createdBy,
      });
      const prefs = preferencesFrom(personalSettings[index]?.data() as Record<string, unknown> | undefined);
      const suppression = preferenceSuppression(prefs, input.type, 'in_app', false);
      if (suppression) {
        batch.create(deliveryRefs[index], {
          ...deliveryBase(normalized),
          state: 'suppressed_by_preference',
          suppressionReason: suppression,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deliveryKey: `${input.type}:${sourceId}`,
        });
        writes += 1;
        suppressed += 1;
        continue;
      }

      batch.create(notificationRefs[index], {
        ...deliveryBase(normalized),
        channel: 'in_app',
        deliveryState: 'sent',
        deliveredAt: FieldValue.serverTimestamp(),
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
  return { delivered, suppressed, recipients: recipients.length, audience };
}
