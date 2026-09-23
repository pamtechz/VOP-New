import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, requireOrgRole, canEditCanonicalContent, enforceQuota, enforceFeature, writeTenantAudit } from '../server/tenant';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('A valid quiz ID is required.');
  return id;
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
      const [owned, shared] = await Promise.all([
        ctx.db.collection('quizzes').where('organizationId','==',ctx.organizationId).get(),
        ctx.db.collection('quizzes').where('sharingScope','==','shared').where('published','==',true).get(),
      ]);
      const items = [...owned.docs, ...shared.docs.filter(doc => String(doc.data().organizationId || '') !== ctx.organizationId)]
        .map(d => ({ id:d.id, editable: canEditCanonicalContent(ctx, d.data()), ...d.data() }));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'get') {
      const id = safeId(body.id);
      const snap = await ctx.db.doc(`quizzes/${id}`).get();
      if (!snap.exists) throw new Error('Quiz was not found.');
      const data = snap.data() || {};
      const visible = ctx.isSuperAdmin || String(data.organizationId || '') === ctx.organizationId || (data.sharingScope === 'shared' && data.published === true);
      if (!visible) throw new Error('This quiz is not available to your organization.');
      return res.status(200).json({ ok: true, item: { id, ...data } });
    }

    if (action === 'upsert') {
      requireOrgRole(ctx, ['owner','admin','editor']);
      await enforceFeature(ctx, 'quizzes');
      if (!ctx.organizationId && !ctx.isSuperAdmin) throw new Error('Select an organization before creating tenant content.');
      const id = safeId(body.id || (ctx.organizationId ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : 'platform-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)));
      const existing = await ctx.db.doc(`quizzes/${id}`).get();
      const current = existing.exists ? existing.data() : undefined;
      if (!existing.exists) await enforceQuota(ctx, 'quizzes', 'maxQuizzes');
      if (existing.exists && !canEditCanonicalContent(ctx, current)) throw new Error('Only the owning organization or VOP Super Admin can edit this quiz.');
      if (existing.exists && String(current?.organizationId || '') !== ctx.organizationId && !ctx.isSuperAdmin) throw new Error('This quiz belongs to another organization.');
      const now = new Date().toISOString();
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      const language = String(data.language || '').trim();
      if (!language) throw new Error('Quiz language is required.');
      const title = String(data.title || '').trim();
      if (!title) throw new Error('Quiz title is required.');
      await ctx.db.doc(`quizzes/${id}`).set({
        ...data,
        id,
        organizationId: ctx.organizationId,
        ownerOrganizationId: current?.ownerOrganizationId || ctx.organizationId,
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
      requireOrgRole(ctx, ['owner','admin','editor']);
      await enforceFeature(ctx, 'quizzes');
      if (!ctx.organizationId) throw new Error('Select an organization before copying content.');
      const sourceId = safeId(body.sourceId);
      const source = await ctx.db.doc(`quizzes/${sourceId}`).get();
      if (!source.exists || source.data()?.published !== true || source.data()?.sharingScope !== 'shared') throw new Error('Only approved shared quizzes can be copied.');
      const id = safeId(body.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20));
      await enforceQuota(ctx, 'quizzes', 'maxQuizzes');
      const now = new Date().toISOString();
      const data = source.data() || {};
      await ctx.db.doc(`quizzes/${id}`).set({
        ...data,
        id,
        organizationId: ctx.organizationId,
        ownerOrganizationId: ctx.organizationId,
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
