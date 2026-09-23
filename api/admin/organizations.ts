import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, requireOrgRole, writeTenantAudit } from '../../server/tenant';

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
    const ctx = await authenticateTenant(req, requestedOrg, action === 'acceptInvite');
    if (action === 'listPlans') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can view platform plans.');
      const snap=await bootstrapDb.collection('plans').where('active','==',true).get();
      const items=snap.docs.map(doc=>({id:doc.id,name:String(doc.data()?.name||doc.id),active:true})).sort((a,b)=>a.name.localeCompare(b.name));
      return res.status(200).json({ok:true,items});
    }

    if (action === 'create') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can create organizations.');
      const name = String(body.name || '').trim();
      const organizationId = id(body.id || slug(name));
      const ref = bootstrapDb.doc(`organizations/${organizationId}`);
      if ((await ref.get()).exists) throw new Error('That organization already exists.');
      const now = new Date().toISOString();
      await ref.set({ id: organizationId, name, slug: slug(name), status: 'active', ownerUid: ctx.auth.uid, plan: '', quotas: {}, features: {}, createdAt: now, updatedAt: now });
      await ref.collection('members').doc(ctx.auth.uid).set({ uid: ctx.auth.uid, organizationId, role: 'owner', active: true, joinedAt: now, updatedAt: now });
      return res.status(200).json({ ok: true, item: { id: organizationId, name, status: 'active' } });
    }
    if (action === 'list') {
      if (!ctx.isSuperAdmin) {
        requireOrgRole(ctx, ['owner','admin']);
        const organization = await bootstrapDb.doc(`organizations/${ctx.organizationId}`).get();
        const data = organization.data() || {};
        const members = await organization.ref.collection('members').where('active','==',true).get();
        return res.status(200).json({ ok:true, items:[{
          id: organization.id, name:String(data.name || organization.id), slug:String(data.slug || organization.id),
          status:String(data.status || 'active'), ownerUid:String(data.ownerUid || ''), plan:String(data.plan || ''),
          quotas:data.quotas || {}, createdAt:String(data.createdAt || ''), updatedAt:String(data.updatedAt || ''), memberCount:members.size
        }]});
      }
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
          plan: String(data.plan || ''),
          quotas: data.quotas || {},
          createdAt: String(data.createdAt || ''),
          updatedAt: String(data.updatedAt || ''),
          memberCount: members.size,
        };
      }));
      return res.status(200).json({ ok: true, items });
    }

    requireOrgRole(ctx, ['owner','admin']);
    if (action === 'listAudit') {
      const snap = await ctx.db.collection(`organizations/${ctx.organizationId}/audit`).orderBy('timestamp','desc').limit(100).get();
      return res.status(200).json({ ok:true, items:snap.docs.map(d=>({id:d.id,...d.data()})) });
    }

    if (action === 'getUsage') {
      const orgId = ctx.organizationId;
      const count = async (collection: string) => (await ctx.db.collection(collection).where('organizationId','==',orgId).get()).size;
      const [members, guides, quizzes, announcements, radio, books, playlists] = await Promise.all([
        ctx.db.collection(`organizations/${orgId}/members`).where('active','==',true).get(),
        count('guides'), count('quizzes'), count('announcements'), count('radioBroadcasts'), count('books'), count('radioPlaylists'),
      ]);
      return res.status(200).json({ ok:true, usage:{ members:members.size, guides, quizzes, announcements, radio, books, playlists } });
    }

    if (action === 'update') {
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      if (!ctx.isSuperAdmin && data.plan !== undefined) throw new Error('Only the VOP Super Admin can change organization plans.');
      if (!ctx.isSuperAdmin && data.quotas !== undefined) throw new Error('Only the VOP Super Admin can change organization quotas.');
      const allowed: Record<string, unknown> = {
        name: typeof data.name === 'string' ? data.name.trim() : undefined,
        slug: typeof data.slug === 'string' ? slug(data.slug) : undefined,
        plan: typeof data.plan === 'string' ? data.plan.trim() : undefined,
        quotas: data.quotas && typeof data.quotas === 'object' ? data.quotas : undefined,
        branding: data.branding && typeof data.branding === 'object' ? data.branding : undefined,
        updatedAt: FieldValue.serverTimestamp(),
      };
      Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
      const before = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
      await ctx.db.doc(`organizations/${ctx.organizationId}`).set(allowed, { merge:true });
      await writeTenantAudit(ctx, 'organization.update', `organizations/${ctx.organizationId}`, before.data(), allowed);
      return res.status(200).json({ ok:true });
    }

    if (action === 'sendInvite') {
      requireOrgRole(ctx, ['owner','admin']);
      const email = String(body.email || '').trim().toLowerCase();
      const inviteRole = String(body.role || 'learner');
      if (!/^\S+@\S+\.\S+$/.test(email) || !['admin','editor','mentor','teacher','learner','viewer'].includes(inviteRole)) throw new Error('A valid email and organization role are required.');
      const token = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
      const now = new Date();
      const expiresAt = new Date(now.getTime()+7*24*60*60*1000).toISOString();
      await ctx.db.doc(`organizationInvites/${token}`).set({
        token,email,organizationId:ctx.organizationId,role:inviteRole,invitedBy:ctx.auth.uid,
        createdAt:now.toISOString(),expiresAt,status:'pending'
      });
      await writeTenantAudit(ctx,'membership.invite',`organizationInvites/${token}`,undefined,{email,role:inviteRole,expiresAt});
      const origin = String(req.headers?.origin || '').trim() || `${String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0]}://${String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0]}`.replace(/\/$/,'');
      const inviteUrl = `${origin}/?invite=${token}`;
      if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
          from:process.env.RESEND_FROM_EMAIL,to:[email],subject:'VOP organization invitation',
          html:`<p>You have been invited to join an organization in VOP.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`
        })});
      }
      return res.status(200).json({ok:true,item:{email,role:inviteRole,expiresAt,inviteUrl,emailSent:Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)}});
    }

    if (action === 'acceptInvite') {
      const token = String(body.token || '').trim();
      if (!token) throw new Error('Invitation token is required.');
      const invite = await bootstrapDb.doc(`organizationInvites/${token}`).get();
      if (!invite.exists) throw new Error('This invitation is not valid.');
      const data = invite.data() || {};
      if (data.status !== 'pending' || new Date(String(data.expiresAt || 0)).getTime() < Date.now()) throw new Error('This invitation has expired or has already been used.');
      const email = String(ctx.auth.email || '').trim().toLowerCase();
      if (email !== String(data.email || '').trim().toLowerCase()) throw new Error('Sign in with the email address that received this invitation.');
      const organizationId = String(data.organizationId || '');
      const organization = await bootstrapDb.doc(`organizations/${organizationId}`).get();
      if (!organization.exists || organization.data()?.status !== 'active') throw new Error('The organization is not available.');
      const now = new Date().toISOString();
      await bootstrapDb.doc(`organizations/${organizationId}/members/${ctx.auth.uid}`).set({uid:ctx.auth.uid,organizationId,role:String(data.role || 'learner'),active:true,joinedAt:now,invitedBy:String(data.invitedBy || ''),updatedAt:now},{merge:true});
      await bootstrapDb.doc(`users/${ctx.auth.uid}`).set({organizationId,organizationRole:String(data.role || 'learner'),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await bootstrapDb.doc(`organizationInvites/${token}`).set({status:'accepted',acceptedBy:ctx.auth.uid,acceptedAt:now},{merge:true});
      return res.status(200).json({ok:true,organizationId,role:String(data.role || 'learner')});
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
      await writeTenantAudit(ctx, 'membership.upsert', `organizations/${ctx.organizationId}/members/${uid}`, undefined, { uid, role:memberRole, active:body.active !== false });
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
