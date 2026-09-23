import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore, type DocumentData } from 'firebase-admin/firestore';

type Request = { headers?: Record<string, string | string[] | undefined> };

export type LegacyTenantNodeType = 'union' | 'conference' | 'district' | 'church';

const LEGACY_ADMIN_NODE_TYPES: Record<string, LegacyTenantNodeType> = {
  union_admin: 'union',
  conference_admin: 'conference',
  district_admin: 'district',
  church_admin: 'church',
};

export interface TenantContext {
  db: Firestore;
  auth: DecodedIdToken;
  profile: DocumentData;
  organizationId: string;
  membership: DocumentData;
  isSuperAdmin: boolean;
  tenantKind?: 'organization' | 'legacy-hierarchy';
  tenantNodeType?: LegacyTenantNodeType;
  tenantNodeId?: string;
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

/**
 * Legacy SDA hierarchy administrators are first-class tenants.
 * Their stable tenant key is deliberately namespaced so a union, conference,
 * district and church with the same source ID can never collide.
 */
export function legacyTenantId(nodeType: LegacyTenantNodeType, nodeId: string) {
  const safeNodeId = String(nodeId || '').trim();
  if (!safeNodeId || safeNodeId.includes('/')) throw new Error('A valid hierarchy tenant identifier is required.');
  return `legacy-${nodeType}-${safeNodeId}`;
}

export function legacyTenantFromProfile(profile: DocumentData | undefined) {
  const role = String(profile?.role || '').trim();
  const nodeType = LEGACY_ADMIN_NODE_TYPES[role];
  const nodeId = String(profile?.adminNodeId || '').trim();
  if (!nodeType || !nodeId) return null;
  return { organizationId: legacyTenantId(nodeType, nodeId), nodeType, nodeId };
}

/**
 * Resolves a user's active tenant without requiring every legacy administrator
 * to be manually migrated before the SaaS tenant boundary becomes effective.
 */
export function tenantIdForProfile(profile: DocumentData | undefined) {
  const explicit = String(profile?.organizationId || '').trim();
  if (explicit) return explicit;
  return legacyTenantFromProfile(profile)?.organizationId || '';
}

async function ensureLegacyTenant(
  db: Firestore,
  auth: DecodedIdToken,
  profile: DocumentData,
  nodeType: LegacyTenantNodeType,
  nodeId: string,
) {
  const organizationId = legacyTenantId(nodeType, nodeId);
  const organizationRef = db.doc(`organizations/${organizationId}`);
  const memberRef = organizationRef.collection('members').doc(auth.uid);
  const existing = await organizationRef.get();

  if (!existing.exists) {
    const now = new Date().toISOString();
    await organizationRef.set({
      id: organizationId,
      name: `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} ${nodeId}`,
      slug: organizationId,
      status: 'active',
      tenantKind: 'legacy-hierarchy',
      legacyNodeType: nodeType,
      legacyNodeId: nodeId,
      ownerUid: auth.uid,
      plan: '',
      quotas: {},
      features: {},
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  const membership = await memberRef.get();
  if (!membership.exists || membership.data()?.active !== true) {
    await memberRef.set({
      uid: auth.uid,
      organizationId,
      role: 'owner',
      active: true,
      legacyRole: String(profile.role || ''),
      legacyNodeType: nodeType,
      legacyNodeId: nodeId,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  return { organizationId, organizationRef, membership: await memberRef.get() };
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
  const legacyTenant = legacyTenantFromProfile(profile);
  const explicitOrganizationId = String(requestedOrganizationId || '').trim();
  const profileOrganizationId = String(profile.organizationId || '').trim();

  if (legacyTenant && !profileOrganizationId && explicitOrganizationId && explicitOrganizationId !== legacyTenant.organizationId && !isSuperAdmin) {
    throw new Error('You cannot access another organization.');
  }

  const organizationId = explicitOrganizationId || profileOrganizationId || legacyTenant?.organizationId || '';

  if (!organizationId) {
    if (allowUnassigned) return { db, auth, profile, organizationId: '', membership: { role: 'unassigned', active: false }, isSuperAdmin };
    if (isSuperAdmin) return { db, auth, profile, organizationId: '', membership: { role: 'platform', active: true }, isSuperAdmin };
    throw new Error('An organization membership is required.');
  }

  if (legacyTenant && !profileOrganizationId && organizationId === legacyTenant.organizationId && !isSuperAdmin) {
    const ensured = await ensureLegacyTenant(db, auth, profile, legacyTenant.nodeType, legacyTenant.nodeId);
    return {
      db,
      auth,
      profile: { ...profile, organizationId },
      organizationId,
      membership: ensured.membership.data() || { role: 'owner', active: true },
      isSuperAdmin,
      tenantKind: 'legacy-hierarchy',
      tenantNodeType: legacyTenant.nodeType,
      tenantNodeId: legacyTenant.nodeId,
    };
  }

  const organizationSnap = await db.doc(`organizations/${organizationId}`).get();
  if (!organizationSnap.exists || organizationSnap.data()?.status !== 'active') throw new Error('The organization is not available.');
  const membershipSnap = await db.doc(`organizations/${organizationId}/members/${auth.uid}`).get();
  if (!isSuperAdmin && (!membershipSnap.exists || membershipSnap.data()?.active !== true)) throw new Error('You are not a member of this organization.');
  return {
    db,
    auth,
    profile,
    organizationId,
    membership: membershipSnap.data() || { role: 'platform' },
    isSuperAdmin,
    tenantKind: organizationSnap.data()?.tenantKind === 'legacy-hierarchy' ? 'legacy-hierarchy' : 'organization',
    tenantNodeType: organizationSnap.data()?.legacyNodeType as LegacyTenantNodeType | undefined,
    tenantNodeId: String(organizationSnap.data()?.legacyNodeId || '') || undefined,
  };
}

export function requireOrgRole(ctx: TenantContext, roles: string[]) {
  if (ctx.isSuperAdmin) return;
  const role = String(ctx.membership.role || '');
  if (!roles.includes(role)) throw new Error('You do not have permission to perform this action.');
}

/** Returns true only when a record belongs to the authenticated tenant. Legacy hierarchy tenants
 * can temporarily authorize records written before organizationId migration by matching the
 * tenant's stable hierarchy node field. */
export function recordBelongsToTenant(ctx: TenantContext, data: DocumentData | undefined) {
  if (ctx.isSuperAdmin) return true;
  const recordOrganizationId = String(data?.organizationId || data?.ownerOrganizationId || '').trim();
  if (recordOrganizationId) return recordOrganizationId === ctx.organizationId;
  if (ctx.tenantKind !== 'legacy-hierarchy' || !ctx.tenantNodeType || !ctx.tenantNodeId) return false;
  const field = ctx.tenantNodeType === 'union' ? 'unionId'
    : ctx.tenantNodeType === 'conference' ? 'conferenceId'
    : ctx.tenantNodeType === 'district' ? 'districtId' : 'churchId';
  return String(data?.[field] || '').trim() === ctx.tenantNodeId;
}

export function contentOwnedByOrg(data: DocumentData | undefined, organizationId: string) {
  return String(data?.ownerOrganizationId || data?.organizationId || '') === organizationId;
}

export function canEditCanonicalContent(ctx: TenantContext, data: DocumentData | undefined) {
  return ctx.isSuperAdmin || (contentOwnedByOrg(data, ctx.organizationId) && ['owner','admin','editor'].includes(String(ctx.membership.role || '')));
}

export async function getOrganizationPlan(ctx: TenantContext) {
  if (!ctx.organizationId) return null;
  const organization = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
  const planId = String(organization.data()?.plan || '').trim();
  if (!planId) return null;
  const plan = await ctx.db.doc(`plans/${planId}`).get();
  return plan.exists ? { id: plan.id, ...(plan.data() || {}) } : null;
}

export async function enforceFeature(ctx: TenantContext, featureKey: string) {
  if (ctx.isSuperAdmin || !ctx.organizationId) return;
  const organization = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
  const organizationData = organization.data() || {};
  const plan = await getOrganizationPlan(ctx);
  if (plan && plan.active === false) throw new Error('The organization plan is inactive.');
  const planFeatures = plan?.features && typeof plan.features === 'object' ? plan.features as Record<string, unknown> : {};
  const legacyFeatures = organizationData.features && typeof organizationData.features === 'object' ? organizationData.features as Record<string, unknown> : {};
  const features = Object.keys(planFeatures).length ? planFeatures : legacyFeatures;
  if (features[featureKey] === false) throw new Error(`The ${featureKey} feature is not enabled for the organization plan.`);
}

export async function enforceQuota(ctx: TenantContext, collectionName: string, quotaKey: string, increment = 1) {
  if (ctx.isSuperAdmin || !ctx.organizationId) return;
  const organization = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
  const organizationQuotas = organization.data()?.quotas;
  const plan = await getOrganizationPlan(ctx);
  const planQuotas = plan?.quotas;
  const quotas = (organizationQuotas && typeof organizationQuotas === 'object' && Object.keys(organizationQuotas as object).length)
    ? organizationQuotas as Record<string, unknown>
    : (planQuotas && typeof planQuotas === 'object' ? planQuotas as Record<string, unknown> : {});
  const limit = Number(quotas[quotaKey]);
  if (!Number.isFinite(limit) || limit < 0) return;
  const current = await ctx.db.collection(collectionName).where('organizationId','==',ctx.organizationId).get();
  if (current.size + increment > limit) throw new Error(`The organization has reached its configured ${quotaKey} limit.`);
}

export async function enforceMemberQuota(ctx: TenantContext, organizationId = ctx.organizationId) {
  if (ctx.isSuperAdmin || !organizationId) return;
  const organization = await ctx.db.doc(`organizations/${organizationId}`).get();
  const organizationQuotas = organization.data()?.quotas;
  const plan = await ctx.db.doc(`plans/${String(organization.data()?.plan || '').trim()}`).get();
  const planQuotas = plan.exists ? plan.data()?.quotas : undefined;
  const quotas = organizationQuotas && typeof organizationQuotas === 'object' && Object.keys(organizationQuotas as object).length
    ? organizationQuotas as Record<string, unknown>
    : planQuotas && typeof planQuotas === 'object' ? planQuotas as Record<string, unknown> : {};
  const limit = Number(quotas.maxUsers);
  if (!Number.isFinite(limit) || limit < 0) return;
  const current = await ctx.db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
  if (current.size + 1 > limit) throw new Error('The organization has reached its configured maxUsers limit.');
}

export async function writeTenantAudit(
  ctx: TenantContext,
  action: string,
  target: string,
  before?: DocumentData,
  after?: DocumentData,
) {
  if (!ctx.organizationId) return;
  await ctx.db.collection(`organizations/${ctx.organizationId}/audit`).add({
    actorUid: ctx.auth.uid,
    actorEmail: ctx.auth.email || '',
    action,
    target,
    organizationId: ctx.organizationId,
    before: before || null,
    after: after || null,
    timestamp: FieldValue.serverTimestamp(),
  });
}
