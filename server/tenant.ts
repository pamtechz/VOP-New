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
  const hierarchyAdmin = ['union_admin', 'conference_admin', 'district_admin', 'church_admin'].includes(String(profile.role || ''));
  const profileOrganizationId = String(profile.organizationId || '').trim();
  const requestedId = String(requestedOrganizationId || '').trim();

  // Tenant identity is derived from the authenticated profile. A client-supplied
  // organizationId may select a tenant only for Super Admin; ordinary and
  // hierarchy-admin accounts must never switch tenant context by request payload.
  if (!isSuperAdmin && requestedId && requestedId !== profileOrganizationId) {
    throw new Error('You cannot access another organization.');
  }

  const organizationId = isSuperAdmin
    ? requestedId
    : profileOrganizationId;

  if (!organizationId) {
    if (allowUnassigned) return { db, auth, profile, organizationId: '', membership: { role: 'unassigned', active: false }, isSuperAdmin };
    if (isSuperAdmin) return { db, auth, profile, organizationId: '', membership: { role: 'platform', active: true }, isSuperAdmin };
    if (hierarchyAdmin) throw new Error('This administrator account is not linked to a tenant. Reassign the administrator scope before continuing.');
    throw new Error('An organization membership is required.');
  }
  const organizationSnap = await db.doc(`organizations/${organizationId}`).get();
  if (!organizationSnap.exists || organizationSnap.data()?.status !== 'active') throw new Error('The organization is not available.');
  const membershipSnap = await db.doc(`organizations/${organizationId}/members/${auth.uid}`).get();
  if (!isSuperAdmin && (!membershipSnap.exists || membershipSnap.data()?.active !== true)) throw new Error('You are not a member of this organization.');

  // Organization authorization has historically been represented in both the
  // user profile and the tenant membership document. Older assignment flows
  // could leave those two records temporarily inconsistent (for example,
  // profile.organizationRole === 'admin' while membership.role is stale).
  // Never grant access from a client-supplied role: only reconcile a role that
  // is already present in the server-side authenticated profile and only when
  // the tenant membership itself is active.
  let membership = membershipSnap.data() || { role: 'platform' };
  if (!isSuperAdmin && membershipSnap.exists) {
    const profileRole = String(profile.organizationRole || '').trim();
    const membershipRole = String(membership.role || '').trim();
    if (['owner', 'admin'].includes(profileRole) && membershipRole !== profileRole) {
      membership = { ...membership, role: profileRole };
      await db.doc(`organizations/${organizationId}/members/${auth.uid}`).set({
        uid: auth.uid,
        organizationId,
        role: profileRole,
        active: true,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
  }

  return { db, auth, profile, organizationId, membership, isSuperAdmin };
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
  // Organization membership grants access to the organization, not ownership of
  // another contributor's canonical content. Only the recorded creator/owner or
  // the platform Super Admin may mutate canonical content.
  return ctx.isSuperAdmin
    || (
      contentOwnedByOrg(data, ctx.organizationId)
      && String(data?.ownerUid || '') === ctx.auth.uid
      && ['owner','admin','editor'].includes(String(ctx.membership.role || ''))
    );
}


export async function enforceQuota(ctx: TenantContext, collectionName: string, quotaKey: string, increment = 1) {
  if (ctx.isSuperAdmin || !ctx.organizationId) return;
  const organization = await ctx.db.doc(`organizations/${ctx.organizationId}`).get();
  const quotas = organization.data()?.quotas;
  const limit = Number(quotas && typeof quotas === 'object' ? (quotas as Record<string, unknown>)[quotaKey] : NaN);
  if (!Number.isFinite(limit) || limit < 0) return;
  const [organizationScoped, ownerScoped] = await Promise.all([
    ctx.db.collection(collectionName).where('organizationId','==',ctx.organizationId).get(),
    ctx.db.collection(collectionName).where('ownerOrganizationId','==',ctx.organizationId).get(),
  ]);
  const ids = new Set<string>();
  organizationScoped.docs.forEach(doc => ids.add(doc.id));
  ownerScoped.docs.forEach(doc => ids.add(doc.id));
  if (ids.size + increment > limit) throw new Error(`The organization has reached its configured ${quotaKey} limit.`);
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
