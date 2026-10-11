import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, canEditCanonicalContent, enforceQuota, requireOrgRole, tenantOwnerKey, writeTenantAudit } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../../shared/mediaSources.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function id(value: unknown) {
  const valueId = String(value || '').trim();
  if (!valueId || valueId.length > 120 || valueId.includes('/')) throw new Error('A valid Radio content ID is required.');
  return valueId;
}

function header(request: Request, name: string) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
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
    const urls = ['audioUrl', 'videoUrl', 'streamUrl'].map(key => String(incoming[key] || '').trim()).filter(Boolean);
    if (!urls.length || urls.some(url => !validUrl(url))) throw new Error('Add at least one safe HTTPS Radio media URL.');
    for(const key of ['audioUrl','videoUrl']){
      const link=String(incoming[key]||'').trim();
      if(link && !resolveMediaSource(link)) throw new Error('Radio media must be a supported playable file or trusted embed source.');
    }
    if (!String(incoming.title || '').trim()) throw new Error('Radio title is required.');

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
      title: String(incoming.title||'').trim().slice(0,160),
      speaker: String(incoming.speaker||'').trim().slice(0,120),
      series: String(incoming.series||'').trim().slice(0,120),
      description: String(incoming.description||'').trim().slice(0,3000),
      mediaType: String(incoming.mediaType||'audio').trim().slice(0,40),
      audioUrl: String(incoming.audioUrl||'').trim(),
      videoUrl: String(incoming.videoUrl||'').trim(),
      streamUrl: String(incoming.streamUrl||'').trim(),
      posterUrl: validUrl(incoming.posterUrl) ? String(incoming.posterUrl).trim() : '',
      broadcastTime: String(incoming.broadcastTime||'').trim().slice(0,50),
      id: documentId,
      title: String(incoming.title).trim(),
      published,
      organizationId: String(existing.data()?.organizationId||organizationId),
      ownerOrganizationId: existing.data()?.ownerOrganizationId || (ctx.tenantType === 'organization' ? ctx.organizationId : ''),
      ownerTenantId: existing.data()?.ownerTenantId || tenantOwnerKey(ctx),
      ownerUid: existing.data()?.ownerUid || ctx.auth.uid,
      scope: existing.data()?.scope || (organizationId?'organization':'platform'),
      canonical: existing.exists ? existing.data()?.canonical === true : !organizationId,
      sharingScope: existing.exists
        ? (existing.data()?.sharingScope || 'organization')
        : organizationId ? (incoming.sharingScope === 'shared' ? 'shared' : 'organization') : 'shared',
      createdAt: existing.data()?.createdAt || new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: ctx.auth.uid,
    };

    await ref.set(savedData, { merge: true });
    const saved = await ref.get();
    if (!saved.exists) throw new Error('Radio content was not written to Firestore.');
    const savedPublished = saved.data()?.published === true;
    const savedTitle = String(saved.data()?.title || '');
    if (savedTitle !== String(savedData.title) || savedPublished !== (incoming.published === true)) {
      throw new Error('Radio content was written but could not be verified in Firestore.');
    }

    await writeTenantAudit(ctx, existing.exists ? 'radio.update' : 'radio.create', `radioBroadcasts/${documentId}`, existing.exists ? existing.data() : undefined, saved.data());
    return res.status(200).json({ ok: true, item: { id: saved.id, ...saved.data() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save Radio content.';
    return res.status(500).json({ error: message });
  }
}
