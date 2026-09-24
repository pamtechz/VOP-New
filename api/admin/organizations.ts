import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { authenticateTenant, getAdminDb, requireOrgRole, writeTenantAudit, enforceQuota } from '../../server/tenant.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function id(value: unknown) { const v = String(value || '').trim(); if (!/^[a-zA-Z0-9_-]{2,80}$/.test(v)) throw new Error('A valid organization identifier is required.'); return v; }
const QUOTA_KEYS = ['maxUsers','maxGuides','maxQuizzes','maxAnnouncements','maxRadioItems','maxRadioPlaylists','maxMaterials'] as const;
function normalizeQuotas(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid usage limits.');
  const input = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const key of QUOTA_KEYS) {
    if (input[key] === undefined || input[key] === null || input[key] === '') continue;
    const number = Number(input[key]);
    if (!Number.isInteger(number) || number < 0) throw new Error('Usage limits must be whole numbers zero or greater.');
    result[key] = number;
  }
  return result;
}

function slug(value: unknown) { const v = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!v) throw new Error('Organization name is required.'); return v.slice(0, 80); }
function hierarchyRole(role: string) { return ['union_admin','conference_admin','district_admin','church_admin'].includes(role) ? role : ''; }
function organizationInHierarchy(data: Record<string, unknown>, role: string, nodeId: string) {
  const field = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : role === 'church_admin' ? 'churchId' : '';
  if (field && String(data[field] || '').trim() === nodeId) return true;
  const hierarchy = data.hierarchy && typeof data.hierarchy === 'object' ? data.hierarchy as Record<string, unknown> : {};
  if (field && String(hierarchy[field] || '').trim() === nodeId) return true;
  return String(data.hierarchyType || '').trim() === field.replace('Id','') && String(data.hierarchyId || '').trim() === nodeId;
}
async function organizationAllowedForHierarchy(ctx: Awaited<ReturnType<typeof authenticateTenant>>, organizationId: string, role: string, nodeId: string) {
  const organization = await ctx.db.doc('organizations/' + organizationId).get();
  if (!organization.exists || organization.data()?.status !== 'active') return false;
  if (organizationInHierarchy(organization.data() || {}, role, nodeId)) return true;
  const field = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  const users = await ctx.db.collection('users').where(field, '==', nodeId).limit(100).get();
  return users.docs.some(doc => String(doc.data()?.organizationId || '').trim() === organizationId);
}
async function resolveManagedOrganization(ctx: Awaited<ReturnType<typeof authenticateTenant>>, requestedOrg: string) {
  if (ctx.isSuperAdmin) return requestedOrg || ctx.organizationId;
  if (ctx.organizationId) return ctx.organizationId;
  const role = hierarchyRole(String(ctx.profile.role || ''));
  if (!role || !requestedOrg) throw new Error('Select an organization within your hierarchy.');
  const organization = await ctx.db.doc('organizations/' + requestedOrg).get();
  if (!(await organizationAllowedForHierarchy(ctx, requestedOrg, role, String(ctx.profile.adminNodeId || '').trim()))) throw new Error('The selected organization is outside your assigned hierarchy scope.');
  return requestedOrg;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || 'list');
    const requestedOrg = typeof body.organizationId === 'string' ? body.organizationId : undefined;
    const bootstrapDb = getAdminDb();
    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    if (!authorization) throw new Error('Sign in first.');
    const ctx = await authenticateTenant(req, action === 'delete' ? undefined : requestedOrg, action === 'acceptInvite');
    if (action === 'create') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can create organizations.');
      const name = String(body.name || '').trim();
      const organizationId = id(body.id || slug(name));
      const ref = bootstrapDb.doc(`organizations/${organizationId}`);
      if ((await ref.get()).exists) throw new Error('That organization already exists.');
      const now = new Date().toISOString();
      await ref.set({ id: organizationId, name, slug: slug(name), status: 'active', ownerUid: '', createdAt: now, updatedAt: now });
      return res.status(200).json({ ok: true, item: { id: organizationId, name, status: 'active' } });
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
      const organizationId = String(data.organizationId || '').trim();
      const organization = await bootstrapDb.doc(`organizations/${organizationId}`).get();
      if (!organization.exists || organization.data()?.status !== 'active') throw new Error('The organization is not available.');
      const existingProfile = await bootstrapDb.doc(`users/${ctx.auth.uid}`).get();
      const existingOrganizationId = String(existingProfile.data()?.organizationId || '').trim();
      if (existingOrganizationId && existingOrganizationId !== organizationId) {
        throw new Error('This account is already assigned to another organization. An account cannot accept an invitation from a second tenant.');
      }
      const role = String(data.role || 'learner');
      if (!['admin','editor','mentor','teacher','learner','viewer'].includes(role)) throw new Error('This invitation contains an invalid organization role.');
      const now = new Date().toISOString();
      await bootstrapDb.runTransaction(async transaction => {
        transaction.set(
          bootstrapDb.doc(`organizations/${organizationId}/members/${ctx.auth.uid}`),
          {uid:ctx.auth.uid,organizationId,role,active:true,joinedAt:now,invitedBy:String(data.invitedBy || ''),updatedAt:now},
          {merge:true},
        );
        transaction.set(
          bootstrapDb.doc(`users/${ctx.auth.uid}`),
          {organizationId,organizationRole:role,updatedAt:FieldValue.serverTimestamp()},
          {merge:true},
        );
        transaction.set(
          bootstrapDb.doc(`organizationInvites/${token}`),
          {status:'accepted',acceptedBy:ctx.auth.uid,acceptedAt:now},
          {merge:true},
        );
      });
      const authService = getAuth(bootstrapDb.app);
      const currentRole = String(ctx.profile.role || '').trim();
      const preservedPlatformRole = ['union_admin','conference_admin','district_admin','church_admin'].includes(currentRole) ? currentRole : 'student';
      await authService.setCustomUserClaims(ctx.auth.uid, {
        role: preservedPlatformRole,
        organizationId,
        organizationRole: role,
      });
      return res.status(200).json({ok:true,organizationId,role});
    }

    if (action === 'delete') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can delete organizations.');
      const organizationId = String(requestedOrg || ctx.organizationId || '').trim();
      if (!organizationId) throw new Error('An organization is required.');
      const organizationRef = bootstrapDb.doc(`organizations/${organizationId}`);
      const organizationSnap = await organizationRef.get();
      if (!organizationSnap.exists) throw new Error('The organization does not exist.');

      const memberSnap = await organizationRef.collection('members').get();
      const memberProfiles = await Promise.all(memberSnap.docs.map(async member => ({
        uid: member.id,
        profile: await bootstrapDb.doc(`users/${member.id}`).get(),
      })));
      const inviteSnap = await bootstrapDb.collection('organizationInvites')
        .where('organizationId','==',organizationId).get();

      await bootstrapDb.runTransaction(async transaction => {
        for (const entry of memberProfiles) {
          if (!entry.profile.exists) continue;
          const profile = entry.profile.data() || {};
          if (String(profile.organizationId || '').trim() !== organizationId) continue;
          transaction.set(entry.profile.ref, {
            organizationId:'',
            organizationRole:'learner',
            updatedAt:FieldValue.serverTimestamp(),
          }, { merge:true });
        }
        for (const invite of inviteSnap.docs) transaction.delete(invite.ref);
      });

      const authService = getAuth(bootstrapDb.app);
      await Promise.all(memberProfiles.map(async entry => {
        try {
          const profile = entry.profile.data() || {};
          if (String(profile.organizationId || '').trim() === organizationId) {
            await authService.setCustomUserClaims(entry.uid, {
              role:'student',
              organizationId:'',
              organizationRole:'learner',
            });
          }
        } catch {
          // A stale/deleted Auth account must not prevent organization cleanup.
        }
      }));

      await bootstrapDb.recursiveDelete(organizationRef);
      return res.status(200).json({ ok:true, organizationId, deleted:true });
    }

    if (action === 'list') {
      if (!ctx.isSuperAdmin && hierarchyRole(String(ctx.profile.role || ''))) {
        const role = hierarchyRole(String(ctx.profile.role || ''));
        const nodeId = String(ctx.profile.adminNodeId || '').trim();
        const scopeField = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
        const scopedUsers = await bootstrapDb.collection('users').where(scopeField, '==', nodeId).get();
        const inferredOrganizationIds = new Set(scopedUsers.docs.map(doc => String(doc.data()?.organizationId || '').trim()).filter(Boolean));
        const snap = await bootstrapDb.collection('organizations').get();
        const items = await Promise.all(snap.docs.filter(doc => organizationInHierarchy(doc.data() || {}, role, nodeId) || inferredOrganizationIds.has(doc.id)).map(async organization => {
          const data = organization.data() || {};
          const members = await organization.ref.collection('members').where('active','==',true).get();
          return { id:organization.id, name:String(data.name || organization.id), slug:String(data.slug || organization.id), status:String(data.status || 'active'), ownerUid:String(data.ownerUid || ''), plan:String(data.plan || 'standard'), quotas:data.quotas || {}, createdAt:String(data.createdAt || ''), updatedAt:String(data.updatedAt || ''), memberCount:members.size };
        }));
        return res.status(200).json({ok:true,items:items.filter(item => item.status === 'active')});
      }
      if (!ctx.isSuperAdmin) {
        requireOrgRole(ctx, ['owner','admin']);
        const organization = await bootstrapDb.doc(`organizations/${ctx.organizationId}`).get();
        const data = organization.data() || {};
        const members = await organization.ref.collection('members').where('active','==',true).get();
        return res.status(200).json({ ok:true, items:[{
          id: organization.id, name:String(data.name || organization.id), slug:String(data.slug || organization.id),
          status:String(data.status || 'active'), ownerUid:String(data.ownerUid || ''), plan:String(data.plan || 'standard'),
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
          plan: String(data.plan || 'standard'),
          quotas: data.quotas || {},
          createdAt: String(data.createdAt || ''),
          updatedAt: String(data.updatedAt || ''),
          memberCount: members.size,
        };
      }));
      return res.status(200).json({ ok: true, items });
    }


    const managedOrganizationId = await resolveManagedOrganization(ctx, String(requestedOrg || '').trim());
    if (!ctx.isSuperAdmin && !hierarchyRole(String(ctx.profile.role || ''))) requireOrgRole(ctx, ['owner','admin']);
    if (action === 'listAudit') {
      const snap = await ctx.db.collection(`organizations/${managedOrganizationId}/audit`).orderBy('timestamp','desc').limit(100).get();
      return res.status(200).json({ ok:true, items:snap.docs.map(d=>({id:d.id,...d.data()})) });
    }

    if (action === 'getUsage') {
      const orgId = managedOrganizationId;
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
        quotas: ctx.isSuperAdmin && data.quotas !== undefined ? normalizeQuotas(data.quotas) : undefined,
        branding: data.branding && typeof data.branding === 'object' ? data.branding : undefined,
        updatedAt: FieldValue.serverTimestamp(),
      };
      Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
      const before = await ctx.db.doc(`organizations/${managedOrganizationId}`).get();
      if (!ctx.isSuperAdmin && data.quotas !== undefined) throw new Error('Only the VOP Super Admin can change organization quotas.');
      if (allowed.quotas !== undefined) {
        const raw = allowed.quotas as Record<string, unknown>;
        const normalized: Record<string, number> = {};
        for (const key of ['maxUsers','maxGuides','maxQuizzes','maxAnnouncements','maxRadioItems','maxRadioPlaylists','maxMaterials']) {
          if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
          const value = Number(raw[key]);
          if (!Number.isInteger(value) || value < -1) throw new Error('Organization limits must be whole numbers of -1 or greater.');
          normalized[key] = value;
        }
        allowed.quotas = normalized;
      }
      await ctx.db.doc(`organizations/${managedOrganizationId}`).set(allowed, { merge:true });
      await writeTenantAudit(ctx, 'organization.update', `organizations/${managedOrganizationId}`, before.data(), allowed);
      return res.status(200).json({ ok:true });
    }

    if (action === 'sendInvite') {
      if (!hierarchyRole(String(ctx.profile.role || ''))) requireOrgRole(ctx, ['owner','admin']);
      const email = String(body.email || '').trim().toLowerCase();
      const inviteRole = String(body.role || 'learner');
      if (!/^\S+@\S+\.\S+$/.test(email) || !['admin','editor','mentor','teacher','learner','viewer'].includes(inviteRole)) throw new Error('A valid email and organization role are required.');
      const token = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
      const now = new Date();
      const expiresAt = new Date(now.getTime()+7*24*60*60*1000).toISOString();
      await ctx.db.doc(`organizationInvites/${token}`).set({
        token,email,organizationId:managedOrganizationId,role:inviteRole,invitedBy:ctx.auth.uid,
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

    if (action === 'assignOwner') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can assign organization ownership.');
      const uid = String(body.uid || '').trim();
      const organizationId = String(body.organizationId || '').trim();
      if (!uid || !organizationId) throw new Error('An organization and user are required.');
      const organizationRef = bootstrapDb.doc(`organizations/${organizationId}`);
      const organizationSnap = await organizationRef.get();
      if (!organizationSnap.exists || organizationSnap.data()?.status !== 'active') throw new Error('The organization is not available.');

      const targetProfileRef = bootstrapDb.doc(`users/${uid}`);
      const targetProfileSnap = await targetProfileRef.get();
      if (!targetProfileSnap.exists) throw new Error('The selected user account does not exist.');
      const targetProfile = targetProfileSnap.data() || {};
      const targetOrganizationId = String(targetProfile.organizationId || '').trim();
      if (targetOrganizationId && targetOrganizationId !== organizationId) {
        throw new Error('The selected user belongs to another organization. Remove or reassign that membership before assigning ownership.');
      }
      const platformRole = String(targetProfile.role || '').trim();
      if (platformRole === 'super_admin') throw new Error('The platform Super Admin cannot be assigned as an organization owner.');

      const previousOwnerUid = String(organizationSnap.data()?.ownerUid || '').trim();
      const previousOwnerProfileRef = previousOwnerUid ? bootstrapDb.doc(`users/${previousOwnerUid}`) : null;
      const previousOwnerMemberRef = previousOwnerUid ? organizationRef.collection('members').doc(previousOwnerUid) : null;
      const targetMemberRef = organizationRef.collection('members').doc(uid);
      const now = new Date().toISOString();

      await bootstrapDb.runTransaction(async transaction => {
        if (previousOwnerUid && previousOwnerUid !== uid && previousOwnerProfileRef && previousOwnerMemberRef) {
          const previousProfileSnap = await transaction.get(previousOwnerProfileRef);
          const previousMemberSnap = await transaction.get(previousOwnerMemberRef);
          if (previousMemberSnap.exists) {
            transaction.set(previousOwnerMemberRef, { role:'admin', active:true, updatedAt:now }, { merge:true });
          }
          if (previousProfileSnap.exists) {
            transaction.set(previousOwnerProfileRef, { organizationId, organizationRole:'admin', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
          }
        }
        transaction.set(targetMemberRef, {
          uid, organizationId, role:'owner', active:true,
          joinedAt:String(targetProfile.organizationId || '') === organizationId ? String(targetProfile.joinedAt || now) : now,
          assignedBy:ctx.auth.uid, updatedAt:now
        }, { merge:true });
        transaction.set(targetProfileRef, {
          organizationId, organizationRole:'owner', updatedAt:FieldValue.serverTimestamp()
        }, { merge:true });
        transaction.set(organizationRef, { ownerUid:uid, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      });

      const authService = getAuth(bootstrapDb.app);
      await authService.setCustomUserClaims(uid, { role: ['union_admin','conference_admin','district_admin','church_admin'].includes(platformRole) ? platformRole : 'student', ...( ['union_admin','conference_admin','district_admin','church_admin'].includes(platformRole) ? { adminNodeType:targetProfile.adminNodeType, adminNodeId:targetProfile.adminNodeId } : {} ), organizationId, organizationRole:'owner' });
      if (previousOwnerUid && previousOwnerUid !== uid) {
        await authService.setCustomUserClaims(previousOwnerUid, { role: hierarchyRole(String((await previousOwnerProfileRef?.get())?.data()?.role || '')) || 'student', organizationId, organizationRole:'admin' }).catch(() => undefined);
      }
      await writeTenantAudit(
        { db:bootstrapDb, auth:ctx.auth, profile:ctx.profile, organizationId, membership:{role:'owner',active:true}, isSuperAdmin:true, tenantType:'organization', tenantId:organizationId },
        'organization.owner.assign',
        organizationRef.path,
        organizationSnap.data(),
        { ownerUid:uid }
      );
      return res.status(200).json({ ok:true, item:{organizationId, ownerUid:uid} });
    }

    if (action === 'searchUsers') {
      const query = String(body.query || '').trim().toLowerCase();
      const searchOrganizationId = managedOrganizationId;
      if (!searchOrganizationId) throw new Error('Select an organization before searching accounts.');
      if (query.length < 2) return res.status(200).json({ ok:true, items:[] });
      const users = await ctx.db.collection('users').limit(1000).get();
      const items = users.docs.map(doc => ({ uid:doc.id, ...(doc.data() || {}) }))
        .filter(user => {
          const orgId = String(user.organizationId || '').trim();
          const platformRole = String(user.role || '').trim();
          const organizationRole = String(user.organizationRole || '').trim();
          // Super Admin and hierarchy administrators are platform/tenant
          // administrators, not organization members. Never expose them through
          // organization member search.
          if (platformRole === 'super_admin' || ['union_admin','conference_admin','district_admin','church_admin'].includes(platformRole)) return false;
          // An organization member search may only return accounts already in
          // the selected organization or unassigned accounts that can safely be
          // added to it. Never expose another organization's users.
          if (orgId && orgId !== searchOrganizationId) return false;
          if (organizationRole === 'owner' && orgId !== searchOrganizationId) return false;
          const haystack = [user.displayName, user.email, user.phoneNumber].map(value => String(value || '').toLowerCase()).join(' ');
          return haystack.includes(query);
        }).slice(0, 20)
        .map(user => ({ uid:String(user.uid || ''), displayName:String(user.displayName || ''), email:String(user.email || ''), organizationId:String(user.organizationId || ''), organizationName:String(user.organizationName || '') }));
      return res.status(200).json({ ok:true, items });
    }

    if (action === 'listMembers') {
      const memberOrganizationId = managedOrganizationId;
      if (!memberOrganizationId) throw new Error('Select an organization before loading members.');
      const snap = await ctx.db.collection(`organizations/${memberOrganizationId}/members`).where('active','==',true).get();
      const items = await Promise.all(snap.docs.map(async d => {
        const member = d.data() || {};
        const profile = await ctx.db.doc('users/' + d.id).get();
        const data = profile.data() || {};
        return { id:d.id, ...member, displayName:String(data.displayName || ''), email:String(data.email || '') };
      }));
      return res.status(200).json({ ok: true, items });
    }
    if (action === 'createAndAssign') {
      const email = String(body.email || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim();
      const role = String(body.role || 'learner');
      const password = String(body.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email) || !displayName) throw new Error('A valid name and email are required.');
      if (!['admin','editor','mentor','teacher','learner','viewer'].includes(role)) throw new Error('A valid organization role is required.');
      if (password && password.length < 6) throw new Error('Password must contain at least 6 characters.');
      if (ctx.organizationId) await enforceQuota(ctx, 'users', 'maxUsers');
      const authService = getAuth(ctx.db.app);
      let created;
      try {
        created = await authService.createUser({ email, displayName, ...(password ? { password } : {}), disabled:false });
      } catch (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code.includes('email-already-exists')) throw new Error('An account already exists for this email. Search for the user and assign the existing account instead.');
        throw error;
      }
      const now = new Date().toISOString();
      await ctx.db.runTransaction(async transaction => {
        transaction.set(ctx.db.doc('users/' + created.uid), {
          uid:created.uid, email, displayName,
          userType:role === 'learner' || role === 'viewer' ? 'learner' : role,
          role: role === 'mentor' ? 'mentor' : 'student',
          organizationId:managedOrganizationId, organizationRole:role,
          privileges:{admin:role==='admin',guardian:role==='admin',editor:role==='admin'||role==='editor'||role==='mentor',manager:role==='admin',developer:false,coordinator:role==='admin'},
          information:{enrollmentDate:now,graduating:false,graduated:false,baptismCandidate:false,baptized:false},
          progress:{discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]},
          createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
        }, {merge:true});
        transaction.set(ctx.db.doc('organizations/' + managedOrganizationId + '/members/' + created.uid), {uid:created.uid,organizationId:managedOrganizationId,role,active:true,invitedBy:ctx.auth.uid,joinedAt:now,updatedAt:now},{merge:true});
      });
      await authService.setCustomUserClaims(created.uid, { role:'student', organizationId:managedOrganizationId, organizationRole:role });
      await writeTenantAudit(ctx,'membership.create','organizations/' + managedOrganizationId + '/members/' + created.uid,undefined,{uid:created.uid,role});
      return res.status(200).json({ok:true,item:{uid:created.uid,email,displayName,role}});
    }

    if (action === 'setMember') {
      const uid = String(body.uid || '').trim();
      if (!uid || uid === ctx.auth.uid) throw new Error('An administrator cannot change their own organization membership from this screen.');
      const profileRef = ctx.db.doc(`users/${uid}`);
      const existingProfile = await profileRef.get();
      if (!existingProfile.exists) throw new Error('The selected user account does not exist.');
      const memberRole = String(body.role || 'learner');
      if (!['admin','editor','mentor','teacher','learner','viewer'].includes(memberRole)) throw new Error('A valid organization role is required.');
      const existingData = existingProfile.data() || {};
      const existingOrganizationId = String(existingData.organizationId || '').trim();
      const targetMemberRef = ctx.db.doc(`organizations/${managedOrganizationId}/members/${uid}`);
      const existingMember = await targetMemberRef.get();
      if (String(existingMember.data()?.role || '') === 'owner' || String(existingData.organizationRole || '') === 'owner') {
        throw new Error('The organization owner cannot be changed from the member manager.');
      }
      if (existingOrganizationId && existingOrganizationId !== ctx.organizationId) {
        throw new Error('This user belongs to another organization and cannot be managed from this organization.');
      }
      const now = new Date().toISOString();
      const previousMemberRef = null;
      await ctx.db.runTransaction(async transaction => {
        transaction.set(targetMemberRef, {
          uid, organizationId: managedOrganizationId, role: memberRole, active: body.active !== false,
          invitedBy: ctx.auth.uid, joinedAt: String(existingData.organizationId || '') === managedOrganizationId ? String(existingData.joinedAt || now) : now, updatedAt: now
        }, { merge: true });
        transaction.set(profileRef, {
          organizationId: managedOrganizationId, organizationRole: memberRole, updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      });
      const authService = getAuth(ctx.db.app);
      await authService.setCustomUserClaims(uid, { role: hierarchyRole(String(existingData.role || '')) || 'student', ...(hierarchyRole(String(existingData.role || '')) ? { adminNodeType:existingData.adminNodeType, adminNodeId:existingData.adminNodeId } : {}), organizationId:managedOrganizationId, organizationRole:memberRole });
      await writeTenantAudit(ctx, 'membership.upsert', targetMemberRef.path, existingMember.exists ? existingMember.data() : undefined, { uid, role:memberRole, active:body.active !== false, previousOrganizationId: existingOrganizationId || null });
      return res.status(200).json({ ok: true });
    }

    if (action === 'removeMember') {
      const uid = String(body.uid || '').trim();
      if (!uid || uid === ctx.auth.uid) throw new Error('An administrator cannot remove their own organization membership from this screen.');
      const organizationRef = ctx.db.doc(`organizations/${managedOrganizationId}`);
      const [organizationSnap, memberSnap, profileSnap] = await Promise.all([
        organizationRef.get(),
        ctx.db.doc(`organizations/${managedOrganizationId}/members/${uid}`).get(),
        ctx.db.doc(`users/${uid}`).get()
      ]);
      if (!memberSnap.exists) throw new Error('That user is not a member of this organization.');
      const memberData = memberSnap.data() || {};
      const profileData = profileSnap.data() || {};
      const isOwner = String(memberData.role || '') === 'owner'
        || String(organizationSnap.data()?.ownerUid || '') === uid
        || String(profileData.organizationRole || '') === 'owner';
      if (isOwner && !ctx.isSuperAdmin) {
        throw new Error('The organization owner cannot be removed by an organization administrator. Assign organization ownership to another user first.');
      }
      const now = new Date().toISOString();
      await ctx.db.runTransaction(async transaction => {
        transaction.set(memberSnap.ref, {
          active:false, removedAt:now, removedBy:ctx.auth.uid, updatedAt:now
        }, { merge:true });
        transaction.set(profileSnap.ref, {
          ...(hierarchyRole(String(profileData.role || '')) ? { organizationRole:'learner' } : { organizationId:'', organizationRole:'learner' }),
          updatedAt:FieldValue.serverTimestamp()
        }, { merge:true });
        if (isOwner && ctx.isSuperAdmin) {
          transaction.set(organizationRef, {
            ownerUid:'',
            updatedAt:FieldValue.serverTimestamp()
          }, { merge:true });
        }
      });
      const authService = getAuth(ctx.db.app);
      await authService.setCustomUserClaims(uid, hierarchyRole(String(profileData.role || '')) || 'student');
      await writeTenantAudit(ctx, 'membership.remove', memberSnap.ref.path, memberData, { uid, active:false, removedBy:ctx.auth.uid });
      return res.status(200).json({ ok:true });
    }
    if (action === 'setStatus') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can change organization status.');
      const status = ['active','suspended','archived'].includes(String(body.status)) ? String(body.status) : '';
      if (!status) throw new Error('Invalid organization status.');
      await ctx.db.doc(`organizations/${managedOrganizationId}`).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unsupported organization action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Organization operation failed.';
    const code = /Sign in|membership|permission|Super Admin|organization is not available|already exists/.test(message) ? 403 : 400;
    return res.status(code).json({ error: message });
  }
}
