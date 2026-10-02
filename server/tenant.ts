import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore, type DocumentData } from 'firebase-admin/firestore';

type Request = { headers?: Record<string, string | string[] | undefined> };

export interface TenantContext {
  db: Firestore;
  auth: DecodedIdToken;
  profile: DocumentData;
  organizationId: string;
  membership: DocumentData;
  isSuperAdmin: boolean;
  tenantType: 'platform' | 'organization' | 'hierarchy';
  tenantId: string;
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server configuration is missing.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(request: Request, name: string) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function getAdminDb() { return getFirestore(adminApp()); }

export async function authenticateTenant(request: Request, requestedOrganizationId?: string, allowUnassigned = false): Promise<TenantContext> {
  const authorization = header(request, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  const auth = await getAuth(adminApp()).verifyIdToken(authorization.slice(7).trim());
  const db = getAdminDb();
  const profileSnap = await db.doc(`users/${auth.uid}`).get();
  if (!profileSnap.exists) throw new Error('Account profile was not found.');
  const profile = profileSnap.data() || {};
  const isSuperAdmin = String(profile.role || '') === 'super_admin';
  const hierarchyAdmin = ['union_admin', 'conference_admin', 'district_admin', 'church_admin'].includes(String(profile.role || ''));
  const profileOrganizationId = String(profile.organizationId || '').trim();
  const requestedId = String(requestedOrganizationId || '').trim();

  if (hierarchyAdmin) {
    const nodeId = String(profile.adminNodeId || '').trim();
    if (!nodeId) throw new Error('This administrator account is not linked to a hierarchy tenant.');
    const role = String(profile.role || '');
    const collection = role === 'union_admin' ? 'unions' : role === 'conference_admin' ? 'conferences' : role === 'district_admin' ? 'districts' : 'churches';
    const node = await db.doc(collection + '/' + nodeId).get();
    if (!node.exists) throw new Error('The assigned hierarchy tenant does not exist.');
    return { db, auth, profile, organizationId: '', membership: { role, active: true, tenantType: 'hierarchy', tenantId: role + ':' + nodeId }, isSuperAdmin, tenantType: 'hierarchy', tenantId: role + ':' + nodeId };
  }

  if (!isSuperAdmin && requestedId && requestedId !== profileOrganizationId) {
    const requestedMembership = await db.doc(`organizations/${requestedId}/members/${auth.uid}`).get();
    if (!requestedMembership.exists || requestedMembership.data()?.active !== true) {
      if (!hierarchyAdmin) throw new Error('You cannot access another organization.');
    }
  }

  let organizationId = isSuperAdmin ? requestedId : profileOrganizationId;
  if (!isSuperAdmin && requestedId) {
    const requestedOrganization = await db.doc(`organizations/${requestedId}`).get();
    if (!requestedOrganization.exists || requestedOrganization.data()?.status !== 'active') throw new Error('The organization is not available.');
    const requestedMembership = await db.doc(`organizations/${requestedId}/members/${auth.uid}`).get();
    if (requestedMembership.exists && requestedMembership.data()?.active === true) organizationId = requestedId;
  }
  if (!isSuperAdmin && organizationId) {
    const profileMembership = await db.doc(`organizations/${organizationId}/members/${auth.uid}`).get();
    if (!profileMembership.exists || profileMembership.data()?.active !== true) organizationId = '';
  }

  if (!organizationId && !isSuperAdmin) {
    const memberships = await db.collectionGroup('members').where('uid', '==', auth.uid).where('active', '==', true).limit(20).get();
    const organizationMembership = memberships.docs.find(doc => doc.ref.path.startsWith('organizations/'));
    if (organizationMembership) {
      const parts = organizationMembership.ref.path.split('/');
      if (parts.length >= 4) organizationId = parts[1];
    }
  }

  if (!organizationId) {
    if (hierarchyAdmin) {
      const nodeId = String(profile.adminNodeId || '').trim();
      if (!nodeId) throw new Error('This administrator account is not linked to a hierarchy tenant.');
      const role = String(profile.role || '');
      const collection = role === 'union_admin' ? 'unions' : role === 'conference_admin' ? 'conferences' : role === 'district_admin' ? 'districts' : 'churches';
      const node = await db.doc(collection + '/' + nodeId).get();
      if (!node.exists) throw new Error('The assigned hierarchy tenant does not exist.');
      return { db, auth, profile, organizationId: '', membership: { role, active: true, tenantType: 'hierarchy', tenantId: role + ':' + nodeId }, isSuperAdmin, tenantType: 'hierarchy', tenantId: role + ':' + nodeId };
    }
    if (allowUnassigned) return { db, auth, profile, organizationId: '', membership: { role: 'unassigned', active: false }, isSuperAdmin, tenantType: 'platform', tenantId: '' };
    if (isSuperAdmin) return { db, auth, profile, organizationId: '', membership: { role: 'platform', active: true }, isSuperAdmin, tenantType: 'platform', tenantId: '' };
    throw new Error('An organization membership is required.');
  }
  const organizationSnap = await db.doc(`organizations/${organizationId}`).get();
  if (!organizationSnap.exists || organizationSnap.data()?.status !== 'active') throw new Error('The organization is not available.');
  const membershipSnap = await db.doc(`organizations/${organizationId}/members/${auth.uid}`).get();
  if (!isSuperAdmin && (!membershipSnap.exists || membershipSnap.data()?.active !== true)) throw new Error('You are not a member of this organization.');

  let membership = membershipSnap.data() || { role: 'platform' };
  if (!isSuperAdmin && membershipSnap.exists) {
    const profileRole = String(profile.organizationRole || '').trim();
    const membershipRole = String(membership.role || '').trim();
    if (['owner', 'admin'].includes(profileRole) && membershipRole !== profileRole) {
      membership = { ...membership, role: profileRole };
      await db.doc(`organizations/${organizationId}/members/${auth.uid}`).set({ uid: auth.uid, organizationId, role: profileRole, active: true, updatedAt: new Date().toISOString() }, { merge: true });
    }
  }

  return { db, auth, profile, organizationId, membership, isSuperAdmin, tenantType: 'organization', tenantId: organizationId };
}

export function requireOrgRole(ctx: TenantContext, roles: string[]) {
  if (ctx.isSuperAdmin) return;
  const role = String(ctx.membership.role || '');
  if (!roles.includes(role)) throw new Error('You do not have permission to perform this action.');
}

export function hierarchyRole(role: unknown) {
  const value = String(role || '');
  return ['union_admin', 'conference_admin', 'district_admin', 'church_admin'].includes(value) ? value : '';
}

export async function organizationInHierarchyScope(ctx: TenantContext, organizationId: string) {
  if (ctx.isSuperAdmin) return true;
  if (ctx.tenantType === 'organization') return ctx.organizationId === organizationId;
  if (ctx.tenantType !== 'hierarchy') return false;
  const role = hierarchyRole(ctx.profile.role);
  const nodeId = String(ctx.profile.adminNodeId || '').trim();
  if (!role || !nodeId || !organizationId) return false;
  const organization = await ctx.db.doc(`organizations/${organizationId}`).get();
  if (!organization.exists || organization.data()?.status !== 'active') return false;
  const data = organization.data() || {};
  const directField = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  if (String(data[directField] || '').trim() === nodeId) return true;
  const hierarchy = data.hierarchy && typeof data.hierarchy === 'object' ? data.hierarchy as Record<string, unknown> : {};
  if (String(hierarchy[directField] || '').trim() === nodeId) return true;
  if (String(data.hierarchyType || '').trim() === directField.replace('Id','') && String(data.hierarchyId || '').trim() === nodeId) return true;
  if (String(data.adminNodeType || '').trim() === directField.replace('Id','') && String(data.adminNodeId || '').trim() === nodeId) return true;
  const users = await ctx.db.collection('users').where(directField, '==', nodeId).limit(100).get();
  return users.docs.some(doc => String(doc.data()?.organizationId || '').trim() === organizationId);
}

export async function accessibleOrganizationIds(ctx: TenantContext) {
  if (ctx.isSuperAdmin) return (await ctx.db.collection('organizations').where('status', '==', 'active').get()).docs.map(doc => doc.id);
  if (ctx.tenantType === 'organization') return ctx.organizationId ? [ctx.organizationId] : [];
  if (ctx.tenantType !== 'hierarchy') return [];
  const role = hierarchyRole(ctx.profile.role);
  const nodeId = String(ctx.profile.adminNodeId || '').trim();
  if (!role || !nodeId) return [];
  const directField = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  const snapshot = await ctx.db.collection('organizations').where('status', '==', 'active').get();
  const ids = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const hierarchy = data.hierarchy && typeof data.hierarchy === 'object' ? data.hierarchy as Record<string, unknown> : {};
    if (String(data[directField] || '').trim() === nodeId || String(hierarchy[directField] || '').trim() === nodeId || (String(data.hierarchyType || '').trim() === directField.replace('Id','') && String(data.hierarchyId || '').trim() === nodeId) || (String(data.adminNodeType || '').trim() === directField.replace('Id','') && String(data.adminNodeId || '').trim() === nodeId)) ids.add(doc.id);
  }
  const users = await ctx.db.collection('users').where(directField, '==', nodeId).limit(500).get();
  users.docs.forEach(doc => { const id = String(doc.data()?.organizationId || '').trim(); if (id) ids.add(id); });
  return [...ids];
}

export function tenantOwnerKey(ctx: TenantContext) {
  return ctx.tenantType === 'organization' ? ctx.organizationId : ctx.tenantType === 'hierarchy' ? ctx.tenantId : '';
}

export function contentOwnedByOrg(data: DocumentData | undefined, organizationId: string) {
  return String(data?.ownerOrganizationId || data?.organizationId || '') === organizationId;
}

export async function canManageOrganizationContent(ctx: TenantContext, data: DocumentData | undefined) {
  if (ctx.isSuperAdmin) return true;
  const organizationId = String(data?.organizationId || data?.ownerOrganizationId || '').trim();
  if (!organizationId) return false;
  if (ctx.tenantType === 'hierarchy') return organizationInHierarchyScope(ctx, organizationId);
  return organizationId === ctx.organizationId && ['owner', 'admin'].includes(String(ctx.membership.role || '')) && String(data?.ownerUid || '') === ctx.auth.uid;
}

export function canEditCanonicalContent(ctx: TenantContext, data: DocumentData | undefined) {
  if (ctx.isSuperAdmin) return true;
  const ownerKey = String(data?.ownerTenantId || data?.ownerOrganizationId || data?.organizationId || '');
  const currentTenant = tenantOwnerKey(ctx);
  const role = String(ctx.profile.role || '');
  const membershipRole = String(ctx.membership.role || '');
  const isOrgAdminOrOwner = ['owner', 'admin'].includes(membershipRole);
  const isHierarchyAdmin = ['union_admin', 'conference_admin', 'district_admin', 'church_admin'].includes(role);
  const canContribute = isHierarchyAdmin || isOrgAdminOrOwner
    || membershipRole === 'editor' || membershipRole === 'teacher'
    || role === 'editor' || role === 'teacher';
  if (!canContribute) return false;
  // Tenant equality is necessary but never sufficient to edit somebody
  // else's contribution. Neither a shared record nor a later organization
  // switch transfers authorship. Only Super Admin may override the owner.
  return Boolean(ownerKey && currentTenant && ownerKey === currentTenant)
    && Boolean(data?.ownerUid) && String(data?.ownerUid) === ctx.auth.uid;
}

const CANDIDATE_MEMBERSHIP_ROLES=new Set(['learner','student','candidate']);
const MENTOR_MEMBERSHIP_ROLES=new Set(['mentor']);

export async function subscriptionAudiencePolicy(db:Firestore){
  const snapshot=await db.doc('system/billing').get();
  const data=snapshot.data()||{};
  const audience=data.subscriptionAudience&&typeof data.subscriptionAudience==='object'
    ?data.subscriptionAudience as Record<string,unknown>:{};
  return {
    learnersCandidates:audience.learnersCandidates===true,
    organizations:audience.organizations!==false,
    churches:audience.churches!==false,
    districts:audience.districts!==false,
    conferences:audience.conferences!==false,
    unions:audience.unions!==false,
  };
}

function freePlanPrice(data:DocumentData){
  const value=Number(data.priceUsd??data.price??NaN);
  return Number.isFinite(value)?value:NaN;
}

function subscriptionObject(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)
    ?{...(value as Record<string,unknown>)}
    :{};
}

function freePlanSnapshot(planId:string,data:DocumentData){
  return {
    id:planId,
    name:String(data.name||planId).trim(),
    description:String(data.description||'').trim(),
    interval:String(data.interval||'month').trim()||'month',
    version:Math.max(1,Math.trunc(Number(data.version)||1)),
    priceUsd:0,
    baseCurrency:String(data.baseCurrency||'USD').trim()||'USD',
    quotas:subscriptionObject(data.quotas),
    features:subscriptionObject(data.features),
  };
}

export async function defaultFreeSubscriptionPlan(db:Firestore){
  const snapshot=await db.collection('system/plans/catalog').where('active','==',true).get();
  const candidates=snapshot.docs
    .map(document=>({id:document.id,data:document.data()}))
    .filter(item=>freePlanPrice(item.data)===0)
    .sort((left,right)=>{
      const preferred=Number(right.data.defaultForUnsubscribed===true)-Number(left.data.defaultForUnsubscribed===true);
      if(preferred)return preferred;
      const order=Number(left.data.sortOrder||0)-Number(right.data.sortOrder||0);
      if(order)return order;
      const name=String(left.data.name||left.id).localeCompare(String(right.data.name||right.id));
      return name||left.id.localeCompare(right.id);
    });
  return candidates[0]||null;
}

export async function ensureOrganizationDefaultSubscription(
  db:Firestore,
  organizationId:string,
  actorUid='system:auto-free-plan',
){
  if(!organizationId)return null;
  const organizationRef=db.doc(`organizations/${organizationId}`);
  const subscriptionRef=organizationRef.collection('subscription').doc('current');
  const [organization,subscription]=await Promise.all([organizationRef.get(),subscriptionRef.get()]);
  if(!organization.exists||organization.data()?.status!=='active')return null;
  const organizationData=organization.data()||{};
  const assignedPlan=String(organizationData.plan||'').trim();
  const subscriptionData=subscription.data()||{};
  const existingStatus=String(subscriptionData.status||'').trim().toLowerCase();
  const existingPlanId=String(subscriptionData.planId||'').trim();
  if(subscription.exists&&['active','trialing'].includes(existingStatus)&&existingPlanId)return null;
  // A legacy tenant may have an assigned plan id but no lifecycle record.
  // Do not rewrite that tenant implicitly; only inactive lifecycle records fall back.
  if(assignedPlan&&assignedPlan!=='unsubscribed'&&!subscription.exists)return null;
  const legacyQuotas=subscriptionObject(organizationData.quotas);
  const legacyFeatures=subscriptionObject(organizationData.featureEntitlements);
  // Older tenants may have explicit limits/entitlements without a plan id.
  // Preserve that deliberate configuration; only truly unconfigured tenants,
  // explicitly unsubscribed tenants, or tenants whose paid lifecycle ended fall back.
  if(!assignedPlan&&(Object.keys(legacyQuotas).length>0||Object.keys(legacyFeatures).length>0))return null;

  const selected=await defaultFreeSubscriptionPlan(db);
  if(!selected)return null;
  const selectedPlanRef=db.doc('system/plans/catalog/'+selected.id);
  const startedAt=new Date().toISOString();
  let assigned=false;
  let assignedSnapshot:ReturnType<typeof freePlanSnapshot>|null=null;
  await db.runTransaction(async transaction=>{
    const [currentOrganization,currentSubscription,currentPlanSnapshot]=await Promise.all([
      transaction.get(organizationRef),
      transaction.get(subscriptionRef),
      transaction.get(selectedPlanRef),
    ]);
    if(!currentOrganization.exists||currentOrganization.data()?.status!=='active')return;
    const currentData=currentOrganization.data()||{};
    const currentPlan=String(currentData.plan||'').trim();
    const currentSubscriptionData=currentSubscription.data()||{};
    const currentStatus=String(currentSubscriptionData.status||'').trim().toLowerCase();
    const currentSubscriptionPlanId=String(currentSubscriptionData.planId||'').trim();
    if(currentSubscription.exists&&['active','trialing'].includes(currentStatus)&&currentSubscriptionPlanId)return;
    if(currentPlan&&currentPlan!=='unsubscribed'&&!currentSubscription.exists)return;
    const currentLegacyQuotas=subscriptionObject(currentData.quotas);
    const currentLegacyFeatures=subscriptionObject(currentData.featureEntitlements);
    if(!currentPlan&&(Object.keys(currentLegacyQuotas).length>0||Object.keys(currentLegacyFeatures).length>0))return;
    if(!currentPlanSnapshot.exists||currentPlanSnapshot.data()?.active!==true||freePlanPrice(currentPlanSnapshot.data()||{})!==0)return;
    const snapshot=freePlanSnapshot(selected.id,currentPlanSnapshot.data()||{});
    assignedSnapshot=snapshot;

    transaction.set(organizationRef,{
      plan:selected.id,
      quotas:snapshot.quotas,
      featureEntitlements:snapshot.features,
      billingAccessSuspended:false,
      billingSuspendedReason:null,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.set(subscriptionRef,{
      organizationId,
      planId:selected.id,
      planName:snapshot.name,
      planInterval:snapshot.interval,
      planVersion:snapshot.version,
      planSnapshot:snapshot,
      status:'active',
      activationSource:'automatic_free_plan',
      autoProvisioned:true,
      billingProvider:'none',
      externalCustomerId:null,
      externalSubscriptionId:null,
      baseCurrency:'USD',
      baseAmountDecimal:'0.00',
      billingCurrency:'USD',
      paidAmountDecimal:'0.00',
      exchangeRate:1,
      currentPeriodStart:startedAt,
      currentPeriodEnd:null,
      renewalMode:'none',
      cancelAtPeriodEnd:false,
      previousPlanId:String(currentSubscriptionData.planId||'').trim()||null,
      startedAt:FieldValue.serverTimestamp(),
      activatedAt:FieldValue.serverTimestamp(),
      activatedBy:actorUid,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:false});
    assigned=true;
  });
  if(!assigned)return null;
  await db.collection(`organizations/${organizationId}/audit`).add({
    actorUid,
    action:'subscription.auto_free_assign',
    target:subscriptionRef.path,
    organizationId,
    tenantType:'organization',
    tenantId:organizationId,
    before:subscription.exists?subscriptionData:null,
    after:{
      planId:selected.id,
      status:'active',
      activationSource:'automatic_free_plan',
      currentPeriodEnd:null,
    },
    timestamp:FieldValue.serverTimestamp(),
  });
  return assignedSnapshot?{planId:selected.id,planSnapshot:assignedSnapshot}:null;
}

export async function organizationSubscriptionTermBlockReason(
  db:Firestore,
  organizationId:string,
){
  if(!organizationId)return 'An organization is required for subscription access checks.';
  const subscription=await db.doc(`organizations/${organizationId}/subscription/current`).get();
  if(!subscription.exists)return null;
  const data=subscription.data()||{};
  const status=String(data.status||'').trim().toLowerCase();
  if(status&&!['active','trialing'].includes(status)){
    return 'This organization subscription is inactive. Renew or activate a subscription package to make changes.';
  }
  const interval=String(data.planInterval||data.interval||data.planSnapshot?.interval||'').trim().toLowerCase();
  if(interval==='one_time')return null;
  const end=Date.parse(String(data.currentPeriodEnd||'').trim());
  if((status==='active'||status==='trialing')&&Number.isFinite(end)&&end<=Date.now()){
    return 'This organization subscription term has ended. Renew the subscription package to make changes.';
  }
  return null;
}

function quotaLimit(quotas:unknown,key:string,legacyKey=''){
  const data=quotas&&typeof quotas==='object'?quotas as Record<string,unknown>:{};
  const raw=data[key]??(legacyKey?data[legacyKey]:undefined);
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0?value:Number.POSITIVE_INFINITY;
}

async function ownedCollectionCount(db:Firestore,organizationId:string,collectionName:string){
  const [organizationScoped,ownerScoped]=await Promise.all([
    db.collection(collectionName).where('organizationId','==',organizationId).get(),
    db.collection(collectionName).where('ownerOrganizationId','==',organizationId).get(),
  ]);
  const documents=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
  for(const document of [...organizationScoped.docs,...ownerScoped.docs]){
    documents.set(document.id,document);
  }
  return [...documents.values()].filter(document=>document.data()?.archived!==true).length;
}

export async function organizationUsageSnapshot(db:Firestore,organizationId:string){
  if(!organizationId)throw new Error('An organization is required.');
  const members=await db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
  const roles=members.docs.map(doc=>String(doc.data()?.role||'').trim().toLowerCase());
  const [guides,programs,learningPaths,bibleTopics,seasons,quizzes,announcements,events,radio,radioPlaylists,materials]=await Promise.all([
    ownedCollectionCount(db,organizationId,'guides'),
    ownedCollectionCount(db,organizationId,'programs'),
    ownedCollectionCount(db,organizationId,'learningPaths'),
    ownedCollectionCount(db,organizationId,'bibleTopics'),
    ownedCollectionCount(db,organizationId,'seasons'),
    ownedCollectionCount(db,organizationId,'quizzes'),
    ownedCollectionCount(db,organizationId,'announcements'),
    ownedCollectionCount(db,organizationId,'events'),
    ownedCollectionCount(db,organizationId,'radioBroadcasts'),
    ownedCollectionCount(db,organizationId,'playlists'),
    ownedCollectionCount(db,organizationId,'books'),
  ]);
  const candidates=roles.filter(role=>CANDIDATE_MEMBERSHIP_ROLES.has(role)).length;
  const memberSeats=roles.filter(role=>!CANDIDATE_MEMBERSHIP_ROLES.has(role)).length;
  return {
    seats:memberSeats,
    memberSeats,
    candidates,
    mentors:roles.filter(role=>MENTOR_MEMBERSHIP_ROLES.has(role)).length,
    administrators:roles.filter(role=>['owner','admin'].includes(role)).length,
    staff:roles.filter(role=>!CANDIDATE_MEMBERSHIP_ROLES.has(role)&&!MENTOR_MEMBERSHIP_ROLES.has(role)&&!['owner','admin'].includes(role)).length,
    guides,programs,learningPaths,bibleTopics,seasons,quizzes,announcements,events,radio,radioPlaylists,materials,
  };
}

export async function validateOrganizationPlanCapacity(
  db:Firestore,
  organizationId:string,
  quotas:Record<string,unknown>,
){
  const [usage,audience]=await Promise.all([
    organizationUsageSnapshot(db,organizationId),
    subscriptionAudiencePolicy(db),
  ]);
  const checks:Array<[string,number,number]>=[
    ['member / staff seats',usage.seats,quotaLimit(quotas,'maxSeats','maxUsers')],
    ...(audience.learnersCandidates
      ?[['candidates / learners',usage.candidates,quotaLimit(quotas,'maxCandidates')] as [string,number,number]]
      :[]),
    ['mentors',usage.mentors,quotaLimit(quotas,'maxMentors')],
    ['guides',usage.guides,quotaLimit(quotas,'maxGuides')],
    ['programs / courses',usage.programs,quotaLimit(quotas,'maxPrograms')],
    ['learning paths',usage.learningPaths,quotaLimit(quotas,'maxLearningPaths')],
    ['Bible topics',usage.bibleTopics,quotaLimit(quotas,'maxBibleTopics')],
    ['seasons / quarters',usage.seasons,quotaLimit(quotas,'maxSeasons')],
    ['quizzes',usage.quizzes,quotaLimit(quotas,'maxQuizzes')],
    ['announcements',usage.announcements,quotaLimit(quotas,'maxAnnouncements')],
    ['events & programmes',usage.events,quotaLimit(quotas,'maxEvents')],
    ['radio items',usage.radio,quotaLimit(quotas,'maxRadioItems')],
    ['radio playlists',usage.radioPlaylists,quotaLimit(quotas,'maxRadioPlaylists')],
    ['materials',usage.materials,quotaLimit(quotas,'maxMaterials')],
  ];
  const violations=checks.filter(([,used,limit])=>Number.isFinite(limit)&&used>limit)
    .map(([label,used,limit])=>`${label}: ${used} in use / ${limit} allowed`);
  if(violations.length){
    throw new Error('This package is below the organization’s current usage. Reduce usage first or choose a larger package. '+violations.join('; ')+'.');
  }
  return usage;
}

export async function enforceOrganizationMembershipQuotas(
  ctx:TenantContext,
  organizationId:string,
  nextRole:string,
  uid='',
){
  const audience=await subscriptionAudiencePolicy(ctx.db);
  if(!audience.organizations||ctx.isSuperAdmin)return;
  await ensureOrganizationDefaultSubscription(ctx.db,organizationId,ctx.auth.uid);
  const organization=await ctx.db.doc(`organizations/${organizationId}`).get();
  if(!organization.exists||organization.data()?.status!=='active')throw new Error('The organization is not available.');
  if(organization.data()?.billingAccessSuspended===true&&!ctx.isSuperAdmin){
    throw new Error('This organization subscription is inactive. Renew or activate a subscription package before adding members.');
  }
  if(!ctx.isSuperAdmin){
    const termBlock=await organizationSubscriptionTermBlockReason(ctx.db,organizationId);
    if(termBlock)throw new Error(termBlock);
  }
  const quotas=organization.data()?.quotas;
  const normalizedRole=String(nextRole||'learner').trim().toLowerCase();
  const existing=uid?await ctx.db.doc(`organizations/${organizationId}/members/${uid}`).get():null;
  const existingActive=existing?.exists&&existing.data()?.active===true;
  const existingRole=String(existing?.data()?.role||'').trim().toLowerCase();
  const usage=await organizationUsageSnapshot(ctx.db,organizationId);

  const nextConsumesMemberSeat=!CANDIDATE_MEMBERSHIP_ROLES.has(normalizedRole);
  const existingConsumesMemberSeat=existingActive&&!CANDIDATE_MEMBERSHIP_ROLES.has(existingRole);
  const seatDelta=nextConsumesMemberSeat&&!existingConsumesMemberSeat?1:0;
  const candidateDelta=CANDIDATE_MEMBERSHIP_ROLES.has(normalizedRole)
    &&!(existingActive&&CANDIDATE_MEMBERSHIP_ROLES.has(existingRole))?1:0;
  const mentorDelta=MENTOR_MEMBERSHIP_ROLES.has(normalizedRole)
    &&!(existingActive&&MENTOR_MEMBERSHIP_ROLES.has(existingRole))?1:0;

  const maxSeats=quotaLimit(quotas,'maxSeats','maxUsers');
  const maxCandidates=quotaLimit(quotas,'maxCandidates');
  const maxMentors=quotaLimit(quotas,'maxMentors');
  if(usage.seats+seatDelta>maxSeats)throw new Error('This organization has reached its member/staff seat limit. Upgrade the subscription package or deactivate an institutional member before adding another member.');
  if(audience.learnersCandidates&&usage.candidates+candidateDelta>maxCandidates)throw new Error('This organization has reached its candidate limit. Upgrade the subscription package or deactivate a candidate before adding another learner.');
  if(usage.mentors+mentorDelta>maxMentors)throw new Error('This organization has reached its mentor limit. Upgrade the subscription package or deactivate a mentor before adding another mentor.');
}

export async function enforceOrganizationQuota(
  db:Firestore,
  organizationId:string,
  collectionName:string,
  quotaKey:string,
  increment=1,
){
  if(!organizationId)throw new Error('An organization is required for quota enforcement.');
  const audience=await subscriptionAudiencePolicy(db);
  if(!audience.organizations)return;
  await ensureOrganizationDefaultSubscription(db,organizationId);
  const organization=await db.doc(`organizations/${organizationId}`).get();
  if(!organization.exists||organization.data()?.status!=='active')throw new Error('The organization is not available.');
  if(organization.data()?.billingAccessSuspended===true){
    throw new Error('This organization subscription is inactive. Renew or activate a subscription package before creating additional resources.');
  }
  if(String(organization.data()?.plan||'').trim()==='unsubscribed'){
    throw new Error('This organization does not have an active subscription package. Choose a plan before creating additional resources.');
  }
  const termBlock=await organizationSubscriptionTermBlockReason(db,organizationId);
  if(termBlock)throw new Error(termBlock);
  const quotas=organization.data()?.quotas;
  const limit=Number(quotas&&typeof quotas==='object'?(quotas as Record<string,unknown>)[quotaKey]:NaN);
  if(!Number.isFinite(limit)||limit<0)return;
  const currentUsage=await ownedCollectionCount(db,organizationId,collectionName);
  if(currentUsage+increment>limit){
    throw new Error(`The organization has reached its configured ${quotaKey} limit. Upgrade the subscription package or reduce existing usage before creating another resource.`);
  }
}

export async function enforceQuota(ctx: TenantContext, collectionName: string, quotaKey: string, increment = 1) {
  if(ctx.isSuperAdmin||!ctx.organizationId)return;
  await enforceOrganizationQuota(ctx.db,ctx.organizationId,collectionName,quotaKey,increment);
}

export async function writeTenantAudit(ctx: TenantContext, action: string, target: string, before?: DocumentData, after?: DocumentData) {
  const tenantKey = tenantOwnerKey(ctx);
  const entry = {
    actorUid: ctx.auth.uid,
    actorEmail: ctx.auth.email || '',
    action,
    target,
    organizationId: ctx.organizationId || String(after?.organizationId || before?.organizationId || ''),
    tenantType: ctx.tenantType,
    tenantId: tenantKey,
    before: before || null,
    after: after || null,
    timestamp: FieldValue.serverTimestamp(),
  };
  if (ctx.isSuperAdmin) {
    await ctx.db.collection('platformAudit').add({ ...entry, tenantType: 'platform', tenantId: '', targetedOrganizationId: entry.organizationId || null });
    return;
  }
  if (ctx.tenantType === 'organization' && ctx.organizationId) {
    await ctx.db.collection(`organizations/${ctx.organizationId}/audit`).add(entry);
    return;
  }
  if (ctx.tenantType === 'hierarchy' && tenantKey) {
    await ctx.db.collection('tenantAudit').doc(tenantKey).collection('entries').add(entry);
  }
}
