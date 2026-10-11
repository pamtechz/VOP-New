import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, canEditCanonicalContent, enforceQuota, requireOrgRole, tenantOwnerKey, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';
import { isSafeHttpsMediaUrl, identifyRadioMedia, parseAudioVerseEmbedCode } from '../../shared/mediaSources.js';
import { identifyPublicMedia } from '../../api/media.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function id(value: unknown) {
  const valueId = String(value || '').trim();
  if (!valueId || valueId.length > 120 || valueId.includes('/')) throw new Error('A valid Radio content ID is required.');
  return valueId;
}

function validUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return isSafeHttpsMediaUrl(raw);
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || 'upsert');
    const ctx = await authenticateTenant(req);

    // Radio is a platform/global canonical resource. Authorization is still
    // enforced by the configurable permission matrix; Super Admin is always
    // allowed by requirePermission.
    if (action === 'delete') await requirePermission(ctx, 'radio', 'delete');
    else await requirePermission(ctx, 'radio', 'create');
    if (!ctx.isSuperAdmin && ctx.tenantType !== 'hierarchy') requireOrgRole(ctx, ['owner', 'admin', 'editor']);

    const documentId = id(body.id);
    const ref = ctx.db.doc(`radioBroadcasts/${documentId}`);
    const existing = await ref.get();

    if (action === 'delete') {
      if (!existing.exists) return res.status(404).json({ error: 'Radio content was not found.' });
      if (!canEditCanonicalContent(ctx, existing.data())) return res.status(403).json({ error: 'Only the contributor who added this Radio content or VOP Super Admin can delete it.' });
      await ref.delete();
      if ((await ref.get()).exists) throw new Error('Radio content could not be deleted from Firestore.');
      await writeTenantAudit(ctx, 'radio.delete', `radioBroadcasts/${documentId}`, existing.data(), undefined);
      return res.status(200).json({ ok: true, deleted: true, id: documentId });
    }

    const incoming = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
    const mediaUrl = String(incoming.mediaUrl || incoming.videoUrl ||
      incoming.audioUrl || incoming.streamUrl || '').trim();
    if(!isSafeHttpsMediaUrl(mediaUrl)) throw new Error('Add one safe public HTTPS audio, video, live stream or approved provider URL.');
    // Re-resolve on the trusted server: never accept a manually selected mediaType
    // or client supplied media URL classification as authority.
    const inspected = await identifyPublicMedia(mediaUrl);
    const detected = identifyRadioMedia(inspected);
    const isOriginalStream = !incoming.mediaUrl && !incoming.videoUrl &&
      !incoming.audioUrl && Boolean(incoming.streamUrl);
    const actualField = isOriginalStream && detected.mediaType === 'audio'
      ? 'streamUrl' : detected.field;
    const actualType = actualField === 'streamUrl' ? 'stream' : detected.mediaType;
    const normalizedMedia = {
      mediaType:actualType, mediaProvider:detected.provider,
      mediaUrl:detected.sourceUrl,
      audioUrl:actualField === 'audioUrl' ? detected.sourceUrl : '',
      videoUrl:actualField === 'videoUrl' ? detected.sourceUrl : '',
      streamUrl:actualField === 'streamUrl' ? detected.sourceUrl : '',
    };
    const title=String(incoming.title || inspected.title || '').trim();
    if (!title) throw new Error('Add a title. This publisher did not expose one automatically.');
    const previous=existing.data();
    const sameSource=String(previous?.mediaUrl || '').trim() === detected.sourceUrl;
    const approvedEmbed=detected.provider==='AudioVerse'
      ? parseAudioVerseEmbedCode(inspected.embedUrl ||
          (sameSource ? previous?.audioEmbedUrl : '') || detected.playbackUrl)
      : '';

    if (existing.exists) {
      await requirePermission(ctx, 'radio', 'update');
      if (!canEditCanonicalContent(ctx, existing.data())) throw new Error('Only the contributor who added this Radio content or VOP Super Admin can edit it.');
    } else if (ctx.tenantType !== 'hierarchy') {
      await enforceQuota(ctx, 'radioBroadcasts', 'maxRadioItems');
    }

    const organizationId = ctx.tenantType === 'organization' ? ctx.organizationId : '';
    const published = incoming.published === true;
    // An organisation controls its own channel; public sharing is opt-in.
    // Preserve existing ownership/scope when editing older canonical broadcasts.
    const savedData = {
      title: title.slice(0,160),
      speaker: String(incoming.speaker || inspected.speaker || '').trim().slice(0,120),
      series: String(incoming.series || '').trim().slice(0,120),
      description: String(incoming.description || inspected.description || '').trim().slice(0,3000),
      ...normalizedMedia,
      audioEmbedUrl: approvedEmbed,
      posterUrl: validUrl(incoming.posterUrl) ? String(incoming.posterUrl).trim()
        : validUrl(inspected.posterUrl) ? inspected.posterUrl : '',
      broadcastTime: String(incoming.broadcastTime||'').trim().slice(0,50),
      id: documentId,
      published,
      organizationId: String(existing.data()?.organizationId||organizationId),
      ownerOrganizationId: existing.data()?.ownerOrganizationId || (ctx.tenantType === 'organization' ? ctx.organizationId : ''),
      ownerTenantId: existing.data()?.ownerTenantId || tenantOwnerKey(ctx),
      ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
      scope: existing.data()?.scope || (organizationId?'organization':'platform'),
      canonical: existing.exists ? existing.data()?.canonical === true : !organizationId,
      sharingScope: organizationId
        ? (incoming.sharingScope === 'shared' ? 'shared' : 'organization')
        : existing.exists ? (existing.data()?.sharingScope || 'shared') : 'shared',
      createdAt: existing.data()?.createdAt || new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: ctx.auth.uid,
    };

    await ref.set(savedData, { merge: true });
    const saved = await ref.get();
    if (!saved.exists) throw new Error('Radio content was not written to Firestore.');
    const savedPublished = saved.data()?.published === true;
    const savedTitle = String(saved.data()?.title || '');
    const savedMediaUrl=String(saved.data()?.mediaUrl||'');
    if (savedTitle !== String(savedData.title) || savedPublished !== (incoming.published === true) || savedMediaUrl !== detected.sourceUrl) {
      throw new Error('Radio content was written but could not be verified in Firestore.');
    }

    await writeTenantAudit(ctx, existing.exists ? 'radio.update' : 'radio.create', `radioBroadcasts/${documentId}`, existing.exists ? existing.data() : undefined, saved.data());
    return res.status(200).json({ ok: true, item: { id: saved.id, ...saved.data() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save Radio content.';
    return res.status(500).json({ error: message });
  }
}
