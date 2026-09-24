import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, canEditCanonicalContent, enforceQuota, writeTenantAudit, tenantOwnerKey } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('A valid quiz ID is required.');
  return id;
}

function canManageQuizTenant(ctx: Awaited<ReturnType<typeof authenticateTenant>>) {
  return ctx.isSuperAdmin || ctx.tenantType === 'hierarchy' || ['owner','admin','editor'].includes(String(ctx.membership.role || ''));
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 200);
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const ctx = await authenticateTenant(req, typeof body.organizationId === 'string' ? body.organizationId : undefined);
    const action = String(body.action || 'list');

    if (action === 'list') {
      if (ctx.isSuperAdmin && !ctx.organizationId) {
        const snap = await ctx.db.collection('quizzes').get();
        return res.status(200).json({ ok:true, items:snap.docs.map(d => ({id:d.id,...d.data()})) });
      }
      const ownerTenantId = tenantOwnerKey(ctx);
      const owned = ctx.tenantType === 'hierarchy'
        ? await ctx.db.collection('quizzes').where('ownerTenantId','==',ownerTenantId).get()
        : await ctx.db.collection('quizzes').where('organizationId','==',ctx.organizationId).get();
      const shared = await ctx.db.collection('quizzes').where('sharingScope','==','shared').where('published','==',true).get();
      const items = [...owned.docs, ...shared.docs.filter(doc => ctx.tenantType === 'hierarchy'
        ? String(doc.data().ownerTenantId || '') !== ownerTenantId
        : String(doc.data().organizationId || '') !== ctx.organizationId)]
        .map(d => ({
          id:d.id,
          ...d.data(),
          canEdit: ctx.isSuperAdmin || String(d.data().ownerUid || '') === ctx.auth.uid,
        }));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'get') {
      const id = safeId(body.id);
      const snap = await ctx.db.doc(`quizzes/${id}`).get();
      if (!snap.exists) throw new Error('Quiz was not found.');
      const data = snap.data() || {};
      const ownTenant = ctx.tenantType === 'hierarchy'
        ? String(data.ownerTenantId || '') === tenantOwnerKey(ctx)
        : String(data.organizationId || '') === ctx.organizationId;
      const visible = ctx.isSuperAdmin || ownTenant || (data.sharingScope === 'shared' && data.published === true);
      if (!visible) throw new Error('This quiz is not available to your organization.');
      return res.status(200).json({ ok: true, item: { id, ...data } });
    }

    if (action === 'upsert') {
      const existingForPermission = await ctx.db.doc(`quizzes/${safeId(body.id)}`).get();
      await requirePermission(ctx, 'quizzes', existingForPermission.exists ? 'update' : 'create');
      if (!canManageQuizTenant(ctx)) throw new Error('You do not have permission to manage quizzes for this tenant.');
      if (ctx.tenantType === 'platform' && !ctx.isSuperAdmin) throw new Error('Select a tenant before creating content.');
      const id = safeId(body.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20));
      const existing = await ctx.db.doc(`quizzes/${id}`).get();
      const current = existing.exists ? existing.data() : undefined;
      if (!existing.exists) await enforceQuota(ctx, 'quizzes', 'maxQuizzes');
      if (existing.exists && !canEditCanonicalContent(ctx, current)) throw new Error('Only the owning organization or VOP Super Admin can edit this quiz.');
      if (existing.exists && !ctx.isSuperAdmin && !canEditCanonicalContent(ctx, current)) throw new Error('This quiz belongs to another tenant or contributor.');
      const now = new Date().toISOString();
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const language = String(data.language || '').trim();
      if (!language) throw new Error('Quiz language is required.');
      const title = String(data.title || '').trim();
      if (!title) throw new Error('Quiz title is required.');
      await ctx.db.doc(`quizzes/${id}`).set({
        ...data,
        id,
        organizationId: current?.organizationId || (ctx.tenantType === 'organization' ? ctx.organizationId : ''),
        ownerOrganizationId: current?.ownerOrganizationId || (ctx.tenantType === 'organization' ? ctx.organizationId : ''),
        ownerTenantId: current?.ownerTenantId || tenantOwnerKey(ctx),
        ownerUid: current?.ownerUid || ctx.auth.uid,
        canonical: true,
        sharingScope: data.sharingScope === 'shared' ? 'shared' : data.sharingScope === 'private' ? 'private' : 'organization',
        questions: normalizeQuestions(data.questions),
        published: data.published === true,
        createdAt: current?.createdAt || now,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      }, { merge: true });
      const saved = await ctx.db.doc(`quizzes/${id}`).get();
      await writeTenantAudit(ctx, existing.exists ? 'quiz.update' : 'quiz.create', `quizzes/${id}`, current, saved.data());
      return res.status(200).json({ ok: true, item: { id, ...saved.data() } });
    }

    if (action === 'fork') {
      if (!canManageQuizTenant(ctx)) throw new Error('You do not have permission to copy quizzes for this tenant.');
      if (ctx.tenantType === 'platform' && !ctx.isSuperAdmin) throw new Error('Select a tenant before copying content.');
      const sourceId = safeId(body.sourceId);
      const source = await ctx.db.doc(`quizzes/${sourceId}`).get();
      if (!source.exists || source.data()?.published !== true || source.data()?.sharingScope !== 'shared') throw new Error('Only approved shared quizzes can be copied.');
      const id = safeId(body.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20));
      const now = new Date().toISOString();
      const data = source.data() || {};
      await ctx.db.doc(`quizzes/${id}`).set({
        ...data,
        id,
        organizationId: ctx.tenantType === 'organization' ? ctx.organizationId : '',
        ownerOrganizationId: ctx.tenantType === 'organization' ? ctx.organizationId : '',
        ownerTenantId: tenantOwnerKey(ctx),
        ownerUid: ctx.auth.uid,
        sourceContentId: sourceId,
        canonical: true,
        sharingScope: 'organization',
        published: false,
        copiedAt: now,
        copiedBy: ctx.auth.uid,
        createdAt: now,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ctx.auth.uid,
      });
      await writeTenantAudit(ctx, 'quiz.fork', `quizzes/${id}`, undefined, { sourceContentId:sourceId, id });
      return res.status(200).json({ ok: true, item: { id, sourceContentId: sourceId, organizationId: ctx.organizationId } });
    }

    return res.status(400).json({ error: 'Unsupported quiz action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Quiz operation failed.';
    const code = /Sign in|permission|Only|belongs|available|member|Select/.test(message) ? 403 : 400;
    return res.status(code).json({ error: message });
  }
}
