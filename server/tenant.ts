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
  const organizationId = String(requestedOrganizationId || profile.organizationId || '').trim();
  if (!organizationId) {
    if (allowUnassigned) return { db, auth, profile, organizationId: '', membership: { role: 'unassigned', active: false }, isSuperAdmin };
    if (isSuperAdmin) return { db, auth, profile, organizationId: '', membership: { role: 'platform', active: true }, isSuperAdmin };
    throw new Error('An organization membership is required.');
  }
  const organizationSnap = await db.doc(`organizations/${organizationId}`).get();
  if (!organizationSnap.exists || organizationSnap.data()?.status !== 'active') throw new Error('The organization is not available.');
  const membershipSnap = await db.doc(`organizations/${organizationId}/members/${auth.uid}`).get();
  if (!isSuperAdmin && (!membershipSnap.exists || membershipSnap.data()?.active !== true)) throw new Error('You are not a member of this organization.');
  return { db, auth, profile, organizationId, membership: membershipSnap.data() || { role: 'platform' }, isSuperAdmin };
}

export function requireOrgRole(ctx: TenantContext, roles: string[]) {
  if (ctx.isSuperAdmin) return;
  const role = String(ctx.membership.role || '');
  if (!roles.includes(role)) throw new Error('You do not have permission to perform this action.');
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
