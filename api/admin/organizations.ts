import { FieldValue } from 'firebase-admin/firestore';
import { authenticateTenant, getAdminDb, requireOrgRole, writeTenantAudit, enforceMemberQuota } from '../../server/tenant';

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
      items.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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
        if (action === 'listAudit') {
      const snap = await ctx.db.collection(`organizations/${ctx.organizationId}/audit`).orderBy('timestamp','desc').limit(100).get();
      return res.status(200).json({ ok:true, items:snap.docs.map(d=>({id:d.id,...d.data()})) });
    }

    if (action === 'getHierarchy') {
      const organization = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
      const data = organization.exists ? organization.data() || {} : {};
      const hierarchy = data.settings && typeof data.settings === 'object' && (data.settings as Record<string, unknown>).hierarchy && typeof (data.settings as Record<string, unknown>).hierarchy === 'object'
        ? (data.settings as Record<string, unknown>).hierarchy
        : { levels: [{ id:'level1', label:'Level 1', parentId:null }, { id:'level2', label:'Level 2', parentId:'level1' }, { id:'level3', label:'Level 3', parentId:'level2' }] };
      return res.status(200).json({ok:true,item:hierarchy});
    }

    if (action === 'saveHierarchy') {
      requireOrgRole(ctx,['owner','admin']);
      const hierarchy = body.hierarchy && typeof body.hierarchy === 'object' && !Array.isArray(body.hierarchy) ? body.hierarchy as Record<string, unknown> : null;
      if (!hierarchy) throw new Error('A valid hierarchy configuration is required.');
      const levels = Array.isArray(hierarchy.levels) ? hierarchy.levels : [];
      if (levels.length > 20) throw new Error('A maximum of 20 hierarchy levels is supported.');
      const seen = new Set<string>();
      for (const raw of levels) {
        if (!raw || typeof raw !== 'object') throw new Error('Each hierarchy level must be an object.');
        const level = raw as Record<string, unknown>;
        const id = String(level.id || '').trim();
        const label = String(level.label || '').trim();
        const parentId = level.parentId == null ? null : String(level.parentId).trim();
        if (!id || !label || id.length > 64 || label.length > 120 || seen.has(id)) throw new Error('Hierarchy levels require unique IDs and non-empty labels.');
        if (parentId && parentId === id) throw new Error('A hierarchy level cannot be its own parent.');
        seen.add(id);
      }
      for (const raw of levels) {
        const parentId = raw && typeof raw === 'object' && (raw as Record<string, unknown>).parentId != null ? String((raw as Record<string, unknown>).parentId).trim() : '';
        if (parentId && !seen.has(parentId)) throw new Error('Hierarchy parent references must point to an existing level.');
      }
      const organization = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
      const organizationSettings = organization.data()?.settings && typeof organization.data()?.settings === 'object' ? organization.data()?.settings as Record<string, unknown> : {};
      await ctx.db.doc(`organizations/${ctx.organizationId}`).set({settings:{...organizationSettings,hierarchy:{...hierarchy,levels}} ,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await writeTenantAudit(ctx,'organization.hierarchy.update',`organizations/${ctx.organizationId}`,undefined,{levels:levels.length});
      return res.status(200).json({ok:true,item:{...hierarchy,levels}});
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

    if (action === 'getAnalytics') {
      const orgId = ctx.organizationId;
      const memberSnap = await ctx.db.collection(`organizations/${orgId}/members`).where('active','==',true).get();
      const roleCounts: Record<string,number> = {};
      memberSnap.docs.forEach(doc => { const role=String(doc.data()?.role || 'learner'); roleCounts[role]=(roleCounts[role]||0)+1; });
      const count = async (collection:string) => (await ctx.db.collection(collection).where('organizationId','==',orgId).get()).size;
      const guideSnap = await ctx.db.collection('guides').where('organizationId','==',orgId).get();
      const lessons = (await Promise.all(guideSnap.docs.map(guide => guide.ref.collection('lessons').get()))).reduce((total, snap) => total + snap.size, 0);
      const [guides,quizzes,announcements,radio,materials,candidates,certificates] = await Promise.all([
        count('guides'), count('quizzes'), count('announcements'),
        count('radioBroadcasts'), count('books'), count('candidates'), count('certificates')
      ]);
      const audit = await ctx.db.collection(`organizations/${orgId}/audit`).orderBy('timestamp','desc').limit(20).get();
      return res.status(200).json({ok:true,analytics:{
        members:memberSnap.size, roleCounts, content:{guides,quizzes,lessons,announcements,radio,materials,candidates,certificates},
        recentActivity:audit.docs.map(doc=>({id:doc.id,...doc.data()}))
      }});
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
        settings: data.settings && typeof data.settings === 'object' ? data.settings : undefined,
        branding: data.branding && typeof data.branding === 'object' ? data.branding : undefined,
        updatedAt: FieldValue.serverTimestamp(),
      };
      Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
      const before = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
      await ctx.db.doc(`organizations/${ctx.organizationId}`).set(allowed, { merge:true });
      await writeTenantAudit(ctx, 'organization.update', `organizations/${ctx.organizationId}`, before.data(), allowed);
      return res.status(200).json({ ok:true });
    }

    if (action === 'listInvites') {
      const snap = await ctx.db.collection('organizationInvites').where('organizationId','==',ctx.organizationId).limit(100).get();
      const now = Date.now();
      const items = snap.docs.map(d => {
        const data = d.data() || {};
        const expiresAt = String(data.expiresAt || '');
        const expired = data.status === 'pending' && (!expiresAt || new Date(expiresAt).getTime() < now);
        return { id:d.id, ...data, status: expired ? 'expired' : String(data.status || 'pending') };
      });
      return res.status(200).json({ok:true,items});
    }

    if (action === 'revokeInvite') {
      const token = String(body.token || '').trim();
      if (!token) throw new Error('Invitation token is required.');
      const ref = ctx.db.doc(`organizationInvites/${token}`);
      const invite = await ref.get();
      if (!invite.exists || String(invite.data()?.organizationId || '') !== ctx.organizationId) throw new Error('Invitation not found.');
      if (String(invite.data()?.status || '') !== 'pending') throw new Error('Only pending invitations can be revoked.');
      await ref.set({status:'revoked',revokedAt:new Date().toISOString(),revokedBy:ctx.auth.uid},{merge:true});
      await writeTenantAudit(ctx,'membership.invite.revoke',`organizationInvites/${token}`,invite.data(),{status:'revoked'});
      return res.status(200).json({ok:true});
    }

    if (action === 'resendInvite') {
      const token = String(body.token || '').trim();
      if (!token) throw new Error('Invitation token is required.');
      const ref = ctx.db.doc(`organizationInvites/${token}`);
      const invite = await ref.get();
      if (!invite.exists || String(invite.data()?.organizationId || '') !== ctx.organizationId) throw new Error('Invitation not found.');
      const data = invite.data() || {};
      if (!['pending','expired'].includes(String(data.status || 'pending'))) throw new Error('Only pending or expired invitations can be resent.');
      const email = String(data.email || '').trim().toLowerCase();
      if (!email) throw new Error('The invitation has no recipient email.');
      const now = new Date();
      const expiresAt = new Date(now.getTime()+7*24*60*60*1000).toISOString();
      await ref.set({status:'pending',expiresAt,resentAt:now.toISOString(),resentBy:ctx.auth.uid},{merge:true});
      const origin = String(req.headers?.origin || '').trim() || `${String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0]}://${String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0]}`.replace(/\/$/,'');
      const inviteUrl = `${origin}/?invite=${token}`;
      let emailSent = false;
      if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
          from:process.env.RESEND_FROM_EMAIL,to:[email],subject:'VOP organization invitation',
          html:`<p>You have been invited to join an organization in VOP.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`
        })});
        emailSent = true;
      }
      await writeTenantAudit(ctx,'membership.invite.resend',`organizationInvites/${token}`,data,{status:'pending',expiresAt});
      return res.status(200).json({ok:true,item:{email,expiresAt,inviteUrl,emailSent}});
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
      const existingMembership = await bootstrapDb.doc(`organizations/${organizationId}/members/${ctx.auth.uid}`).get();
      if (!existingMembership.exists || existingMembership.data()?.active !== true) await enforceMemberQuota(ctx, organizationId);
      const now = new Date().toISOString();
      await bootstrapDb.doc(`organizations/${organizationId}/members/${ctx.auth.uid}`).set({uid:ctx.auth.uid,organizationId,role:String(data.role || 'learner'),active:true,joinedAt:now,invitedBy:String(data.invitedBy || ''),updatedAt:now},{merge:true});
      const userRef = bootstrapDb.doc(`users/${ctx.auth.uid}`);
      const userSnap = await userRef.get();
      const existingIds = Array.isArray(userSnap.data()?.organizationIds) ? userSnap.data()?.organizationIds.map((value: unknown) => String(value)).filter(Boolean) : [];
      const organizationIds = [...new Set([...existingIds, organizationId])];
      await userRef.set({organizationId,organizationRole:String(data.role || 'learner'),organizationIds,updatedAt:FieldValue.serverTimestamp()},{merge:true});
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
      const existingMember = await ctx.db.doc(`organizations/${ctx.organizationId}/members/${uid}`).get();
      if (body.active !== false && (!existingMember.exists || existingMember.data()?.active !== true)) await enforceMemberQuota(ctx);
      const now = new Date().toISOString();
      await ctx.db.doc(`organizations/${ctx.organizationId}/members/${uid}`).set({ uid, organizationId: ctx.organizationId, role: memberRole, active: body.active !== false, invitedBy: ctx.auth.uid, joinedAt: now, updatedAt: now }, { merge: true });
      await writeTenantAudit(ctx, 'membership.upsert', `organizations/${ctx.organizationId}/members/${uid}`, undefined, { uid, role:memberRole, active:body.active !== false });
      const userRef = ctx.db.doc(`users/${uid}`);
      const userSnap = await userRef.get();
      const existingIds = Array.isArray(userSnap.data()?.organizationIds) ? userSnap.data()?.organizationIds.map((value: unknown) => String(value)).filter(Boolean) : [];
      const organizationIds = [...new Set([...existingIds, ctx.organizationId])];
      const activeOrganizationId = String(userSnap.data()?.organizationId || '').trim() || ctx.organizationId;
      await userRef.set({ organizationId: activeOrganizationId, organizationRole: activeOrganizationId === ctx.organizationId ? memberRole : userSnap.data()?.organizationRole || memberRole, organizationIds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
