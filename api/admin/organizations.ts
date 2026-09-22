import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { authenticateTenant, getAdminDb, requireOrgRole } from '../lib/tenant';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function id(value: unknown) { const v = String(value || '').trim(); if (!/^[a-zA-Z0-9_-]{2,80}$/.test(v)) throw new Error('A valid organization identifier is required.'); return v; }
function slug(value: unknown) { const v = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!v) throw new Error('Organization name is required.'); return v.slice(0, 80); }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || 'list');
    const requestedOrg = typeof body.organizationId === 'string' ? body.organizationId : undefined;
    const bootstrapDb = getAdminDb();
    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    if (!authorization) throw new Error('Sign in first.');
    const ctx = await authenticateTenant(req, requestedOrg);
    if (action === 'create') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can create organizations.');
      const name = String(body.name || '').trim();
      const organizationId = id(body.id || slug(name));
      const ref = bootstrapDb.doc(`organizations/${organizationId}`);
      if ((await ref.get()).exists) throw new Error('That organization already exists.');
      const now = new Date().toISOString();
      await ref.set({ id: organizationId, name, slug: slug(name), status: 'active', ownerUid: ctx.auth.uid, createdAt: now, updatedAt: now });
      await ref.collection('members').doc(ctx.auth.uid).set({ uid: ctx.auth.uid, organizationId, role: 'owner', active: true, joinedAt: now, updatedAt: now });
      return res.status(200).json({ ok: true, item: { id: organizationId, name, status: 'active' } });
    }
    if (action === 'list') {
      if (!ctx.isSuperAdmin) requireOrgRole(ctx, ['owner','admin']);
      const snap = await bootstrapDb.collection('organizations').orderBy('name').get();
      const items = await Promise.all(snap.docs.map(async organization => {
        const data = organization.data() || {};
        const members = await organization.ref.collection('members').where('active','==',true).get();
        return {
          id: organization.id,
          name: String(data.name || organization.id),
          slug: String(data.slug || organization.id),
          status: String(data.status || 'active'),
          ownerUid: String(data.ownerUid || ''),
          plan: String(data.plan || 'standard'),
          quotas: data.quotas || {},
          createdAt: String(data.createdAt || ''),
          updatedAt: String(data.updatedAt || ''),
          memberCount: members.size,
        };
      }));
      return res.status(200).json({ ok: true, items });
    }

    requireOrgRole(ctx, ['owner','admin']);
    if (action === 'getUsage') {
      const orgId = ctx.organizationId;
      const count = async (collection: string) => (await ctx.db.collection(collection).where('organizationId','==',orgId).get()).size;
      const [members, guides, quizzes, announcements, radio, books] = await Promise.all([
        ctx.db.collection(`organizations/${orgId}/members`).where('active','==',true).get(),
        count('guides'), count('quizzes'), count('announcements'), count('radioBroadcasts'), count('books'),
      ]);
      return res.status(200).json({ ok:true, usage:{ members:members.size, guides, quizzes, announcements, radio, books } });
    }

    if (action === 'update') {
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      if (!ctx.isSuperAdmin && data.plan !== undefined) throw new Error('Only the VOP Super Admin can change organization plans.');
      const allowed: Record<string, unknown> = {
        name: typeof data.name === 'string' ? data.name.trim() : undefined,
        slug: typeof data.slug === 'string' ? slug(data.slug) : undefined,
        plan: typeof data.plan === 'string' ? data.plan.trim() : undefined,
        quotas: data.quotas && typeof data.quotas === 'object' ? data.quotas : undefined,
        branding: data.branding && typeof data.branding === 'object' ? data.branding : undefined,
        updatedAt: FieldValue.serverTimestamp(),
      };
      Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
      await ctx.db.doc(`organizations/${ctx.organizationId}`).set(allowed, { merge:true });
      return res.status(200).json({ ok:true });
    }

    if (action === 'listMembers') {
      const snap = await ctx.db.collection(`organizations/${ctx.organizationId}/members`).get();
      return res.status(200).json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    }
    if (action === 'setMember') {
      const uid = String(body.uid || '').trim();
      if (!(await ctx.db.doc(`users/${uid}`).get()).exists) throw new Error('The selected user account does not exist.');
      const memberRole = String(body.role || 'learner');
      if (!uid || !['owner','admin','editor','mentor','teacher','learner','viewer'].includes(memberRole)) throw new Error('Valid member details are required.');
      if (!ctx.isSuperAdmin && memberRole === 'owner') throw new Error('Only the VOP Super Admin can assign platform ownership.');
      const now = new Date().toISOString();
      await ctx.db.doc(`organizations/${ctx.organizationId}/members/${uid}`).set({ uid, organizationId: ctx.organizationId, role: memberRole, active: body.active !== false, invitedBy: ctx.auth.uid, joinedAt: now, updatedAt: now }, { merge: true });
      await ctx.db.doc(`users/${uid}`).set({ organizationId: ctx.organizationId, organizationRole: memberRole, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (action === 'setStatus') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can change organization status.');
      const status = ['active','suspended','archived'].includes(String(body.status)) ? String(body.status) : '';
      if (!status) throw new Error('Invalid organization status.');
      await ctx.db.doc(`organizations/${ctx.organizationId}`).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unsupported organization action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Organization operation failed.';
    const code = /Sign in|membership|permission|Super Admin|organization is not available|already exists/.test(message) ? 403 : 400;
    return res.status(code).json({ error: message });
  }
}
