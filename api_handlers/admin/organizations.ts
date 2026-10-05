import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { authenticateTenant, ensureOrganizationDefaultSubscription, getAdminDb, requireOrgRole, writeTenantAudit, enforceOrganizationMembershipQuotas, organizationUsageSnapshot } from '../../server/tenant.js';
import { requirePermission } from '../../server/permissions.js';
import { createNotification } from '../../server/notifications.js';
import { normalizedBillingCountryName, organizationBillingProfile } from '../../server/billing.js';
import { appendImmutableAudit, applyOrganizationAuditVisibility } from '../../server/auditLedger.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function id(value: unknown) { const v = String(value || '').trim(); if (!/^[a-zA-Z0-9_-]{2,80}$/.test(v)) throw new Error('A valid organization identifier is required.'); return v; }
function slug(value: unknown) { const v = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!v) throw new Error('Organization name is required.'); return v.slice(0, 80); }
const INVITE_TARGET_KINDS=['organization','program','guide','lesson','section','assessment','material','radio','event','announcement','master-guide','scripture-memory','iron-duels','prayer'] as const;
type InviteTargetKind=typeof INVITE_TARGET_KINDS[number];
function targetId(value:unknown,label:string){
  const result=String(value||'').trim();
  if(result&&!/^[A-Za-z0-9_-]{1,160}$/.test(result))throw new Error('A valid '+label+' reference is required.');
  return result;
}
function inviteTarget(body:Record<string,unknown>){
  const rawKind=String(body.targetKind||'organization').trim();
  const kind=(INVITE_TARGET_KINDS as readonly string[]).includes(rawKind)?rawKind as InviteTargetKind:'organization';
  const programId=targetId(body.programId,'program');
  const guideId=targetId(body.guideId,'guide');
  const lessonId=targetId(body.lessonId,'lesson');
  const sectionId=targetId(body.sectionId,'section');
  const resourceId=targetId(body.resourceId,'resource');
  const page=Math.max(0,Math.min(9999,Math.trunc(Number(body.page||0)||0)));
  const params=new URLSearchParams();
  let label='Organization home';
  if(kind==='program'){
    if(!programId)throw new Error('A program reference is required.');
    params.set('route','lessons');params.set('program',programId);label='Course / program';
  }else if(kind==='guide'){
    if(!guideId)throw new Error('A guide reference is required.');
    params.set('route','lessons');params.set('guide',guideId);label='Guide / module';
  }else if(kind==='lesson'||kind==='assessment'){
    if(!guideId||!lessonId)throw new Error('Guide and lesson references are required.');
    params.set('route','lessons');params.set('guide',guideId);params.set('lesson',lessonId);
    if(kind==='assessment')params.set('assessment','1');
    label=kind==='assessment'?'Assessment':'Lesson';
  }else if(kind==='section'){
    if(!guideId||!lessonId||!sectionId)throw new Error('Guide, lesson and section references are required.');
    params.set('route','lessons');params.set('guide',guideId);params.set('lesson',lessonId);params.set('section',sectionId);
    if(page>0)params.set('page',String(page));
    label='Lesson section';
  }else if(['material','radio','event','announcement'].includes(kind)){
    params.set('route',kind==='material'?'resources':kind==='radio'?'radio':kind==='event'?'events':'announcements');
    if(resourceId)params.set(kind==='material'?'material':kind,resourceId);
    label=kind==='material'?(resourceId?'Study material':'Library')
      :kind==='radio'?(resourceId?'Radio item':'Radio & broadcasts')
      :kind==='event'?(resourceId?'Event':'Events')
      :resourceId?'Announcement':'Announcements';
  }else if(kind!=='organization'){
    params.set('route',kind);
    label=kind==='master-guide'?'Master Guide':kind==='scripture-memory'?'Scripture Memory':kind==='iron-duels'?'Iron Duels':'Prayer requests';
  }
  return {
    targetKind:kind,targetLabel:String(body.targetLabel||label).trim().slice(0,160)||label,
    targetPath:params.size?'/?'+params.toString():'/',
    programId,guideId,lessonId,sectionId,resourceId,page,
  };
}
function invitationPublicView(data:Record<string,unknown>,organizationName:string){
  return {
    organizationId:String(data.organizationId||''),organizationName,
    role:String(data.role||'learner'),status:String(data.status||'pending'),
    expiresAt:String(data.expiresAt||''),targetKind:String(data.targetKind||'organization'),
    targetLabel:String(data.targetLabel||'Organization home'),
    targetPath:String(data.targetPath||'/'),emailBound:Boolean(String(data.email||'').trim()),
  };
}
async function writeOrganizationAuditMaintenance(
  ctx:Awaited<ReturnType<typeof authenticateTenant>>,
  organizationId:string,
  action:string,
  before:Record<string,unknown>,
  after:Record<string,unknown>,
){
  await appendImmutableAudit(ctx.db,{kind:'organization',organizationId},{
    actorUid:ctx.auth.uid,
    actorEmail:ctx.auth.email||'',
    action,
    target:'organizations/'+organizationId+'/audit',
    organizationId,
    tenantType:'organization',
    tenantId:organizationId,
    before,
    after,
  });
  if(ctx.isSuperAdmin){
    await writeTenantAudit(ctx,action,'organizations/'+organizationId+'/audit',before,{...after,organizationId});
  }
}

function publicOrigin(req:Request){
  const origin=String(req.headers?.origin||'').trim();
  if(origin&&/^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(origin))return origin.replace(/\/$/,'');
  const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()==='http'?'http':'https';
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').split(',')[0].trim();
  if(!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)||host.includes('..'))return '';
  return proto+'://'+host;
}
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

const CANDIDATE_ROLES=new Set(['learner','student','candidate']);
function organizationPeopleCounts(documents:Array<{data:()=>Record<string,unknown>}>){
  let candidates=0;
  for(const document of documents){
    const role=String(document.data()?.role||'').trim().toLowerCase();
    if(CANDIDATE_ROLES.has(role))candidates+=1;
  }
  return {memberCount:documents.length-candidates,candidateCount:candidates};
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || 'list');
    const requestedOrg = typeof body.organizationId === 'string' ? body.organizationId : undefined;
    const bootstrapDb = getAdminDb();

    if(action==='previewInvite'){
      const token=String(body.token||'').trim();
      if(!/^[A-Za-z0-9]{32,128}$/.test(token))throw new Error('A valid invitation token is required.');
      const snap=await bootstrapDb.doc('organizationInvites/'+token).get();
      if(!snap.exists)return res.status(404).json({error:'This invitation is not valid.'});
      const data=snap.data()||{};
      const organizationId=String(data.organizationId||'').trim();
      const organization=organizationId?await bootstrapDb.doc('organizations/'+organizationId).get():null;
      if(!organization?.exists||organization.data()?.status!=='active')return res.status(404).json({error:'The organization is not available.'});
      const expiresAt=Date.parse(String(data.expiresAt||''));
      const expired=!Number.isFinite(expiresAt)||expiresAt<Date.now();
      return res.status(200).json({ok:true,item:invitationPublicView(
        {...data,status:expired&&data.status==='pending'?'expired':data.status},
        String(organization.data()?.name||organizationId),
      )});
    }

    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    if (!authorization) throw new Error('Sign in first.');
    const ctx = await authenticateTenant(req, action === 'delete' ? undefined : requestedOrg, ['acceptInvite','declineInvite','listInvites','dismissInvite','clearInviteHistory'].includes(action));
    const permissionAction = action === 'list' ? 'view' : action === 'create' ? 'create' : ['update','assignOwner','transferOwnership'].includes(action) ? 'update' : action === 'delete' ? 'delete' : '';
    if (permissionAction) await requirePermission(ctx, 'organizations', permissionAction);
    if (action === 'create') {
      if (!ctx.isSuperAdmin) throw new Error('Only the VOP Super Admin can create organizations.');
      const name = String(body.name || '').trim();
      const organizationId = id(body.id || slug(name));
      const billingCountry=normalizedBillingCountryName(body.billingCountry||'Zambia');
      const billingProfile=organizationBillingProfile({billingCountry});
      const ref = bootstrapDb.doc(`organizations/${organizationId}`);
      if ((await ref.get()).exists) throw new Error('That organization already exists.');
      const now = new Date().toISOString();
      await ref.set({
        id:organizationId,name,slug:slug(name),status:'active',ownerUid:'',
        billingCountry,countryCode:billingProfile.countryCode,billingProfile,
        plan:'unsubscribed',quotas:{},featureEntitlements:{},billingAccessSuspended:false,
        createdAt:now,updatedAt:now,
      });
      const defaultSubscription=await ensureOrganizationDefaultSubscription(bootstrapDb,organizationId,ctx.auth.uid);
      const created=await ref.get();
      return res.status(200).json({
        ok:true,
        item:{
          id:organizationId,name,status:'active',billingCountry,countryCode:billingProfile.countryCode,billingProfile,
          plan:String(created.data()?.plan||'unsubscribed'),
          defaultSubscriptionPlanId:defaultSubscription?.planId||null,
        },
      });
    }
    if (action === 'acceptInvite') {
      const token = String(body.token || '').trim();
      if (!token) throw new Error('Invitation token is required.');
      const inviteRef = bootstrapDb.doc(`organizationInvites/${token}`);
      const email = String(ctx.auth.email || '').trim().toLowerCase();
      const existingProfileRef = bootstrapDb.doc(`users/${ctx.auth.uid}`);
      const now = new Date().toISOString();
      let organizationId = '';
      let role = 'learner';
      let invitedBy = '';

      const invitePreflight=await inviteRef.get();
      if(!invitePreflight.exists)throw new Error('This invitation is not valid.');
      const invitePreflightData=invitePreflight.data()||{};
      const preflightOrganizationId=String(invitePreflightData.organizationId||'').trim();
      const preflightRole=String(invitePreflightData.role||'learner');
      if(preflightOrganizationId)await enforceOrganizationMembershipQuotas(ctx,preflightOrganizationId,preflightRole,ctx.auth.uid);

      // Read and consume the invitation in the same transaction so the same
      // invitation cannot be accepted concurrently by two browser sessions.
      await bootstrapDb.runTransaction(async transaction => {
        const inviteSnapshot = await transaction.get(inviteRef);
        if (!inviteSnapshot.exists) throw new Error('This invitation is not valid.');
        const data = inviteSnapshot.data() || {};
        const expiresAt = new Date(String(data.expiresAt || 0)).getTime();
        if (data.status !== 'pending' || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
          throw new Error('This invitation has expired or has already been used.');
        }
        const invitedEmail=String(data.email||'').trim().toLowerCase();
        if (invitedEmail && email !== invitedEmail) {
          throw new Error('Sign in with the email address that received this invitation.');
        }

        organizationId = String(data.organizationId || '').trim();
        role = String(data.role || 'learner');
        invitedBy = String(data.invitedBy || '');
        if (!organizationId) throw new Error('This invitation is missing its organization.');
        if (!['admin','editor','mentor','teacher','learner','viewer'].includes(role)) {
          throw new Error('This invitation contains an invalid organization role.');
        }

        const organizationRef = bootstrapDb.doc(`organizations/${organizationId}`);
        const organizationSnapshot = await transaction.get(organizationRef);
        if (!organizationSnapshot.exists || organizationSnapshot.data()?.status !== 'active') {
          throw new Error('The organization is not available.');
        }

        const existingProfile = await transaction.get(existingProfileRef);
        const existingOrganizationId = String(existingProfile.data()?.organizationId || '').trim();
        if (existingOrganizationId && existingOrganizationId !== organizationId) {
          throw new Error('This account is already assigned to another organization. An account cannot accept an invitation from a second tenant.');
        }

        transaction.set(
          bootstrapDb.doc(`organizations/${organizationId}/members/${ctx.auth.uid}`),
          {uid:ctx.auth.uid,organizationId,role,active:true,joinedAt:now,invitedBy,updatedAt:now},
          {merge:true},
        );
        transaction.set(
          existingProfileRef,
          {organizationId,organizationRole:role,updatedAt:FieldValue.serverTimestamp()},
          {merge:true},
        );
        transaction.update(inviteRef, {
          status:'accepted',
          acceptedBy:ctx.auth.uid,
          acceptedAt:now,
          updatedAt:FieldValue.serverTimestamp(),
        });
      });
      const authService = getAuth();
      const currentRole = String(ctx.profile.role || '').trim();
      const preservedPlatformRole = ['union_admin','conference_admin','district_admin','church_admin'].includes(currentRole) ? currentRole : 'student';
      await authService.setCustomUserClaims(ctx.auth.uid, {
        role: preservedPlatformRole,
        organizationId,
        organizationRole: role,
      });
      if(invitedBy&&invitedBy!==ctx.auth.uid){
        const organization=await bootstrapDb.doc('organizations/'+organizationId).get();
        await createNotification(bootstrapDb,{
          organizationId,recipientId:invitedBy,type:'invitation',
          title:'Organization invitation accepted',
          body:`${String(ctx.auth.name||ctx.auth.email||'A member')} accepted the invitation to join ${String(organization.data()?.name||organizationId)} as ${role}.`,
          actionUrl:'/admin/organizations',
          metadata:{source:'organization-invite-response',inviteToken:token,status:'accepted',memberUid:ctx.auth.uid},
          createdBy:ctx.auth.uid,
        });
      }
      const acceptedInvite=await inviteRef.get();
      const acceptedData=acceptedInvite.data()||{};
      return res.status(200).json({ok:true,organizationId,role,
        targetPath:String(acceptedData.targetPath||'/'),
        targetKind:String(acceptedData.targetKind||'organization'),
        targetLabel:String(acceptedData.targetLabel||'Organization home'),
      });
    }

    if (action === 'listInvites') {
      const email=String(ctx.auth.email||'').trim().toLowerCase();
      const [receivedSnap,sentSnap,acceptedSnap,declinedSnap]=await Promise.all([
        email?bootstrapDb.collection('organizationInvites').where('email','==',email).limit(200).get():Promise.resolve(null),
        bootstrapDb.collection('organizationInvites').where('invitedBy','==',ctx.auth.uid).limit(200).get(),
        bootstrapDb.collection('organizationInvites').where('acceptedBy','==',ctx.auth.uid).limit(200).get(),
        bootstrapDb.collection('organizationInvites').where('declinedBy','==',ctx.auth.uid).limit(200).get(),
      ]);
      const rowsByKey=new Map<string,Record<string,unknown>&{token:string;direction:'received'|'sent'}>();
      for(const doc of [...(receivedSnap?.docs||[]),...acceptedSnap.docs,...declinedSnap.docs]){
        rowsByKey.set('received:'+doc.id,{token:doc.id,...doc.data(),direction:'received'});
      }
      for(const doc of sentSnap.docs){
        rowsByKey.set('sent:'+doc.id,{token:doc.id,...doc.data(),direction:'sent'});
      }
      const rows=[...rowsByKey.values()];
      const organizationIds=[...new Set(rows.map(item=>String(item.organizationId||'')).filter(Boolean))];
      const organizationSnaps=organizationIds.length?await bootstrapDb.getAll(...organizationIds.map(orgId=>bootstrapDb.doc('organizations/'+orgId))):[];
      const names=new Map(organizationSnaps.map(doc=>[doc.id,String(doc.data()?.name||doc.id)]));
      const origin=publicOrigin(req);
      const items=rows.filter(item=>!Array.isArray(item.hiddenForUids)||!item.hiddenForUids.map(String).includes(ctx.auth.uid)).map(item=>({
        ...item,
        organizationName:names.get(String(item.organizationId||''))||String(item.organizationId||''),
        inviteUrl:origin?`${origin}/?invite=${item.token}`:'',
      } as Record<string,unknown>&{token:string;direction:'received'|'sent'})).sort((a,b)=>Date.parse(String(b.createdAt||0))-Date.parse(String(a.createdAt||0)));
      return res.status(200).json({ok:true,items});
    }

    if (action === 'declineInvite') {
      const token=String(body.token||'').trim();
      if(!token)throw new Error('Invitation token is required.');
      const inviteRef=bootstrapDb.doc('organizationInvites/'+token);
      const invite=await inviteRef.get();
      if(!invite.exists)throw new Error('This invitation is not valid.');
      const data=invite.data()||{};
      const invitedEmail=String(data.email||'').trim().toLowerCase();
      if(invitedEmail&&invitedEmail!==String(ctx.auth.email||'').trim().toLowerCase())throw new Error('This invitation belongs to another account.');
      if(String(data.status||'')!=='pending')throw new Error('This invitation is no longer pending.');
      await inviteRef.set({status:'declined',declinedBy:ctx.auth.uid,declinedAt:new Date().toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      const invitedBy=String(data.invitedBy||'').trim();
      if(invitedBy&&invitedBy!==ctx.auth.uid){
        const organizationId=String(data.organizationId||'').trim();
        const organization=organizationId?await bootstrapDb.doc('organizations/'+organizationId).get():null;
        await createNotification(bootstrapDb,{
          organizationId,recipientId:invitedBy,type:'invitation',
          title:'Organization invitation declined',
          body:`${String(ctx.auth.name||ctx.auth.email||'The invited member')} declined the invitation to ${String(organization?.data()?.name||organizationId||'your organization')}.`,
          actionUrl:'/admin/organizations',
          metadata:{source:'organization-invite-response',inviteToken:token,status:'declined'},
          createdBy:ctx.auth.uid,
        });
      }
      return res.status(200).json({ok:true,status:'declined'});
    }

    if (action === 'dismissInvite') {
      const token=String(body.token||'').trim();
      if(!token)throw new Error('Invitation token is required.');
      const ref=bootstrapDb.doc('organizationInvites/'+token);
      const snap=await ref.get();
      if(!snap.exists)return res.status(200).json({ok:true,status:'dismissed'});
      const data=snap.data()||{};
      const email=String(ctx.auth.email||'').trim().toLowerCase();
      const participant=String(data.invitedBy||'')===ctx.auth.uid
        || (email&&String(data.email||'').trim().toLowerCase()===email)
        || (!String(data.email||'').trim()&&String(data.acceptedBy||data.declinedBy||'')===ctx.auth.uid);
      if(!participant)throw new Error('This invitation is not part of your invitation history.');
      if(String(data.status||'pending')==='pending')throw new Error('Respond to or cancel a pending invitation before deleting it from history.');
      await ref.set({hiddenForUids:FieldValue.arrayUnion(ctx.auth.uid),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return res.status(200).json({ok:true,status:'dismissed'});
    }

    if (action === 'clearInviteHistory') {
      const email=String(ctx.auth.email||'').trim().toLowerCase();
      const [received,sent]=await Promise.all([
        email?bootstrapDb.collection('organizationInvites').where('email','==',email).limit(500).get():Promise.resolve(null),
        bootstrapDb.collection('organizationInvites').where('invitedBy','==',ctx.auth.uid).limit(500).get(),
      ]);
      const map=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
      received?.docs.forEach(doc=>map.set(doc.id,doc));
      sent.docs.forEach(doc=>map.set(doc.id,doc));
      const docs=[...map.values()].filter(doc=>String(doc.data()?.status||'pending')!=='pending'
        && !(Array.isArray(doc.data()?.hiddenForUids)&&doc.data()?.hiddenForUids.map(String).includes(ctx.auth.uid)));
      for(let offset=0;offset<docs.length;offset+=400){
        const batch=bootstrapDb.batch();
        docs.slice(offset,offset+400).forEach(doc=>batch.set(doc.ref,{hiddenForUids:FieldValue.arrayUnion(ctx.auth.uid),updatedAt:FieldValue.serverTimestamp()},{merge:true}));
        await batch.commit();
      }
      return res.status(200).json({ok:true,cleared:docs.length});
    }

    if (action === 'cancelInvite') {
      const token=String(body.token||'').trim();
      if(!token)throw new Error('Invitation token is required.');
      const inviteRef=bootstrapDb.doc('organizationInvites/'+token);
      const invite=await inviteRef.get();
      if(!invite.exists)throw new Error('Invitation was not found.');
      const inviteData=invite.data()||{};
      const inviteOrganizationId=String(inviteData.organizationId||'').trim();
      const managed=await resolveManagedOrganization(ctx,inviteOrganizationId);
      if(managed!==inviteOrganizationId)throw new Error('This invitation is outside your organization scope.');
      const creator=String(inviteData.invitedBy||'')===ctx.auth.uid;
      if(!creator&&!ctx.isSuperAdmin&&!hierarchyRole(String(ctx.profile.role||'')))requireOrgRole(ctx,['owner','admin']);
      if(String(inviteData.status||'')!=='pending')throw new Error('Only a pending invitation can be cancelled.');
      await inviteRef.set({status:'cancelled',cancelledBy:ctx.auth.uid,cancelledAt:new Date().toISOString(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return res.status(200).json({ok:true,status:'cancelled'});
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

      const authService = getAuth();
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
          const people=organizationPeopleCounts(members.docs as unknown as Array<{data:()=>Record<string,unknown>}>);
          return { id:organization.id, name:String(data.name || organization.id), slug:String(data.slug || organization.id), status:String(data.status || 'active'), ownerUid:String(data.ownerUid || ''), plan:String(data.plan || 'unsubscribed'), quotas:data.quotas || {}, billingCountry:String(data.billingCountry||data.billingProfile?.countryName||(String(data.countryCode||'ZM')==='ZM'?'Zambia':'International')), countryCode:String(data.countryCode||data.billingProfile?.countryCode||'ZM'), billingProfile:data.billingProfile||organizationBillingProfile(data), createdAt:String(data.createdAt || ''), updatedAt:String(data.updatedAt || ''), ...people };
        }));
        return res.status(200).json({ok:true,items:items.filter(item => item.status === 'active')});
      }
      if (!ctx.isSuperAdmin) {
        requireOrgRole(ctx, ['owner','admin']);
        const organization = await bootstrapDb.doc(`organizations/${ctx.organizationId}`).get();
        const data = organization.data() || {};
        const members = await organization.ref.collection('members').where('active','==',true).get();
        const people=organizationPeopleCounts(members.docs as unknown as Array<{data:()=>Record<string,unknown>}>);
        return res.status(200).json({ ok:true, items:[{
          id: organization.id, name:String(data.name || organization.id), slug:String(data.slug || organization.id),
          status:String(data.status || 'active'), ownerUid:String(data.ownerUid || ''), plan:String(data.plan || 'unsubscribed'),
          quotas:data.quotas || {}, billingCountry:String(data.billingCountry||data.billingProfile?.countryName||(String(data.countryCode||'ZM')==='ZM'?'Zambia':'International')), countryCode:String(data.countryCode||data.billingProfile?.countryCode||'ZM'), billingProfile:data.billingProfile||organizationBillingProfile(data), createdAt:String(data.createdAt || ''), updatedAt:String(data.updatedAt || ''), ...people
        }]});
      }
      const snap = await bootstrapDb.collection('organizations').orderBy('name').get();
      const items = await Promise.all(snap.docs.map(async organization => {
        const data = organization.data() || {};
        const members = await organization.ref.collection('members').where('active','==',true).get();
        const people=organizationPeopleCounts(members.docs as unknown as Array<{data:()=>Record<string,unknown>}>);
        return {
          id: organization.id,
          name: String(data.name || organization.id),
          slug: String(data.slug || organization.id),
          status: String(data.status || 'active'),
          ownerUid: String(data.ownerUid || ''),
          plan: String(data.plan || 'unsubscribed'),
          quotas: data.quotas || {},
          billingCountry:String(data.billingCountry||data.billingProfile?.countryName||(String(data.countryCode||'ZM')==='ZM'?'Zambia':'International')),
          countryCode:String(data.countryCode||data.billingProfile?.countryCode||'ZM'),
          billingProfile:data.billingProfile||organizationBillingProfile(data),
          createdAt: String(data.createdAt || ''),
          updatedAt: String(data.updatedAt || ''),
          ...people,
        };
      }));
      return res.status(200).json({ ok: true, items });
    }


    const managedOrganizationId = await resolveManagedOrganization(ctx, String(requestedOrg || '').trim());
    // Shareable learner invitations are a member capability. All other
    // organization-management mutations below retain the owner/admin gate.
    if (action !== 'createMemberInvite' && !ctx.isSuperAdmin && !hierarchyRole(String(ctx.profile.role || ''))) {
      requireOrgRole(ctx, ['owner','admin']);
    }
    if (action === 'listAudit') {
      const snap = await ctx.db.collection(`organizations/${managedOrganizationId}/audit`).orderBy('timestamp','desc').limit(250).get();
      const visible=await applyOrganizationAuditVisibility(ctx.db,managedOrganizationId,snap.docs);
      const items=visible.filter(item=>item.hiddenFromOrganizationView!==true).slice(0,200);
      return res.status(200).json({
        ok:true,
        items,
        hiddenCount:Math.max(0,visible.length-items.length),
        immutable:true,
      });
    }

    if(action==='deleteAudit'){
      const requested=Array.isArray(body.auditIds)?body.auditIds:[body.auditId];
      const auditIds=[...new Set(requested.map(value=>String(value||'').trim()).filter(value=>/^[A-Za-z0-9_-]{1,180}$/.test(value)))].slice(0,200);
      if(!auditIds.length)throw new Error('Select at least one audit record to remove from this view.');
      const collection=ctx.db.collection(`organizations/${managedOrganizationId}/audit`);
      const refs=auditIds.map(auditId=>collection.doc(auditId));
      const snapshots=await ctx.db.getAll(...refs);
      const found=snapshots.filter(snapshot=>snapshot.exists);
      if(found.length){
        const batch=ctx.db.batch();
        found.forEach(snapshot=>batch.set(
          ctx.db.doc(`organizations/${managedOrganizationId}/auditVisibility/${snapshot.id}`),
          {
            hidden:true,
            hiddenAt:FieldValue.serverTimestamp(),
            hiddenByUid:ctx.auth.uid,
            hiddenByEmail:ctx.auth.email||'',
            reason:'manual_hide',
          },
          {merge:false},
        ));
        await batch.commit();
      }
      await writeOrganizationAuditMaintenance(
        ctx,managedOrganizationId,'audit.history.hide',
        {auditIds:found.map(snapshot=>snapshot.id)},
        {hiddenCount:found.length,immutableLedgerPreserved:true},
      );
      return res.status(200).json({ok:true,hidden:found.length,immutable:true});
    }

    if(action==='clearAudit'){
      const collection=ctx.db.collection(`organizations/${managedOrganizationId}/audit`);
      const count=await collection.count().get();
      const hiddenBefore=new Date().toISOString();
      await ctx.db.doc(`organizations/${managedOrganizationId}/auditVisibility/__cutoff`).set({
        hiddenBefore,
        hiddenByUid:ctx.auth.uid,
        hiddenByEmail:ctx.auth.email||'',
        updatedAt:FieldValue.serverTimestamp(),
        reason:'clear_view',
      },{merge:false});
      const hidden=Math.max(0,Number(count.data().count||0));
      await writeOrganizationAuditMaintenance(
        ctx,managedOrganizationId,'audit.history.clear_view',
        {hiddenBefore},
        {hiddenCount:hidden,immutableLedgerPreserved:true},
      );
      return res.status(200).json({ok:true,hidden,hiddenBefore,immutable:true});
    }

    if (action === 'getUsage') {
      const usage=await organizationUsageSnapshot(ctx.db,managedOrganizationId);
      return res.status(200).json({ok:true,usage});
    }

    if (action === 'update') {
      const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
      if (data.plan !== undefined || data.quotas !== undefined || data.featureEntitlements !== undefined) {
        throw new Error('Plan, feature entitlements and usage limits are managed through Billing & Subscriptions.');
      }
      if (!ctx.isSuperAdmin && data.billingCountry !== undefined) throw new Error('Only the VOP Super Admin can change an organization billing country.');
      const nextBillingCountry=data.billingCountry!==undefined?normalizedBillingCountryName(data.billingCountry):undefined;
      const nextBillingProfile=nextBillingCountry?organizationBillingProfile({billingCountry:nextBillingCountry}):undefined;
      const allowed: Record<string, unknown> = {
        name: typeof data.name === 'string' ? data.name.trim() : undefined,
        slug: typeof data.slug === 'string' ? slug(data.slug) : undefined,
        billingCountry:nextBillingCountry,
        countryCode:nextBillingProfile?.countryCode,
        billingProfile:nextBillingProfile,
        branding: data.branding && typeof data.branding === 'object' ? data.branding : undefined,
        updatedAt: FieldValue.serverTimestamp(),
      };
      Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
      const before = await ctx.db.doc(`organizations/${managedOrganizationId}`).get();
      await ctx.db.doc(`organizations/${managedOrganizationId}`).set(allowed, { merge:true });
      await writeTenantAudit(ctx, 'organization.update', `organizations/${managedOrganizationId}`, before.data(), allowed);
      return res.status(200).json({ ok:true });
    }

    if (action === 'createMemberInvite') {
      const organizationId=String(requestedOrg||ctx.organizationId||'').trim();
      if(!organizationId)throw new Error('An organization is required.');
      const [organization,membership]=await Promise.all([
        bootstrapDb.doc('organizations/'+organizationId).get(),
        bootstrapDb.doc('organizations/'+organizationId+'/members/'+ctx.auth.uid).get(),
      ]);
      if(!organization.exists||organization.data()?.status!=='active')throw new Error('The organization is not available.');
      const hierarchyAccess=ctx.isSuperAdmin||Boolean(hierarchyRole(String(ctx.profile.role||'')));
      if(!hierarchyAccess&&(!membership.exists||membership.data()?.active!==true)){
        throw new Error('Active organization membership is required to invite someone.');
      }
      const target=inviteTarget(body);
      const requestedRole=String(body.role||'learner');
      const canAssignRoles=hierarchyAccess||['owner','admin'].includes(String(membership.data()?.role||ctx.membership?.role||''));
      const role=canAssignRoles&&['admin','editor','mentor','teacher','learner','viewer'].includes(requestedRole)
        ?requestedRole:'learner';
      const token=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
      const now=new Date();
      const expiresAt=new Date(now.getTime()+7*24*60*60*1000).toISOString();
      await bootstrapDb.doc('organizationInvites/'+token).set({
        token,email:'',organizationId,role,invitedBy:ctx.auth.uid,source:'member-link',
        ...target,createdAt:now.toISOString(),expiresAt,status:'pending',
      });
      await writeTenantAudit(
        {...ctx,organizationId} as typeof ctx,
        'membership.invite.link','organizationInvites/'+token,undefined,
        {role,targetKind:target.targetKind,targetPath:target.targetPath,expiresAt},
      ).catch(()=>undefined);
      const origin=publicOrigin(req);
      if(!origin)throw new Error('The public host could not be determined.');
      const inviteUrl=origin+'/?invite='+token;
      return res.status(200).json({ok:true,item:{
        token,organizationId,organizationName:String(organization.data()?.name||organizationId),
        role,expiresAt,inviteUrl,...target,
      }});
    }

    if (action === 'sendInvite') {
      if (!hierarchyRole(String(ctx.profile.role || ''))) requireOrgRole(ctx, ['owner','admin']);
      const email = String(body.email || '').trim().toLowerCase();
      const inviteRole = String(body.role || 'learner');
      if (!/^\S+@\S+\.\S+$/.test(email) || !['admin','editor','mentor','teacher','learner','viewer'].includes(inviteRole)) throw new Error('A valid email and organization role are required.');
      const target=inviteTarget(body);
      const token = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
      const now = new Date();
      const expiresAt = new Date(now.getTime()+7*24*60*60*1000).toISOString();
      await ctx.db.doc(`organizationInvites/${token}`).set({
        token,email,organizationId:managedOrganizationId,role:inviteRole,invitedBy:ctx.auth.uid,source:'email',
        ...target,createdAt:now.toISOString(),expiresAt,status:'pending'
      });
      await writeTenantAudit(ctx,'membership.invite',`organizationInvites/${token}`,undefined,{email,role:inviteRole,expiresAt});
      const organization=await ctx.db.doc('organizations/'+managedOrganizationId).get();
      const organizationName=String(organization.data()?.name||managedOrganizationId);
      const existingAccount=await ctx.db.collection('users').where('email','==',email).limit(1).get();
      if(!existingAccount.empty){
        await createNotification(ctx.db,{
          organizationId:managedOrganizationId,
          recipientId:existingAccount.docs[0].id,
          type:'invitation',
          title:'Organization invitation',
          body:`You were invited to join ${organizationName} as ${inviteRole}. Review the invitation to accept or decline it.`,
          actionUrl:'/invites',
          metadata:{source:'organization-invite',inviteToken:token,organizationId:managedOrganizationId,role:inviteRole},
          createdBy:ctx.auth.uid,
        });
      }
      const origin=publicOrigin(req);
      if(!origin)throw new Error('The public host could not be determined.');
      const inviteUrl = `${origin}/?invite=${token}`;
      if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
          from:process.env.RESEND_FROM_EMAIL,to:[email],subject:'VOP organization invitation',
          html:`<p>You have been invited to join an organization in VOP.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`
        })});
      }
      return res.status(200).json({ok:true,item:{email,role:inviteRole,expiresAt,inviteUrl,...target,emailSent:Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)}});
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
      await enforceOrganizationMembershipQuotas(ctx,organizationId,'owner',uid);
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

      const authService = getAuth();
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
      const items = users.docs.map(doc => ({ uid:doc.id, ...(doc.data() || {}) } as Record<string,unknown>&{uid:string}))
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
      await enforceOrganizationMembershipQuotas(ctx,managedOrganizationId,role);
      const authService = getAuth();
      let created;
      try {
        created = await authService.createUser({ email, displayName, ...(password ? { password } : {}), disabled:false });
      } catch (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code.includes('email-already-exists')) throw new Error('An account already exists for this email. Search for the user and assign the existing account instead.');
        throw error;
      }
      const now = new Date().toISOString();
      const actorHierarchyRole = hierarchyRole(String(ctx.profile.role || ''));
      const actorHierarchyNodeId = String(ctx.profile.adminNodeId || '').trim();
      await ctx.db.runTransaction(async transaction => {
        transaction.set(ctx.db.doc('users/' + created.uid), {
          uid:created.uid, email, displayName,
          userType:role === 'learner' || role === 'viewer' ? 'learner' : role,
          role: role === 'mentor' ? 'mentor' : 'student',
          ...(actorHierarchyRole ? {
            unionId: actorHierarchyRole === 'union_admin' ? actorHierarchyNodeId : '',
            conferenceId: actorHierarchyRole === 'conference_admin' ? actorHierarchyNodeId : '',
            districtId: actorHierarchyRole === 'district_admin' ? actorHierarchyNodeId : '',
            churchId: actorHierarchyRole === 'church_admin' ? actorHierarchyNodeId : '',
          } : {}),
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
      if(body.active!==false)await enforceOrganizationMembershipQuotas(ctx,managedOrganizationId,memberRole,uid);
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
      const authService = getAuth();
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
      const authService = getAuth();
      await authService.setCustomUserClaims(uid, { role: hierarchyRole(String(profileData.role || '')) || 'student', organizationId:'', organizationRole:'learner' });
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
    if (/expired or has already been used|already been used/i.test(message)) {
      return res.status(409).json({error:message});
    }
    const code = /expired or has already been used|already been used/.test(message)
      ?409
      :/Sign in|membership|permission|Super Admin|organization is not available|already exists/.test(message)
        ?403:400;
    return res.status(code).json({ error: message });
  }
}
