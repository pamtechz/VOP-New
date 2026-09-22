import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore, type DocumentData } from 'firebase-admin/firestore';

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
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server configuration is missing.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(request: Request, name: string) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function getAdminDb() { return getFirestore(adminApp()); }

export async function authenticateTenant(request: Request, requestedOrganizationId?: string): Promise<TenantContext> {
  const authorization = header(request, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  const auth = await getAuth(adminApp()).verifyIdToken(authorization.slice(7).trim());
  const db = getAdminDb();
  const profileSnap = await db.doc(`users/${auth.uid}`).get();
  if (!profileSnap.exists) throw new Error('Account profile was not found.');
  const profile = profileSnap.data() || {};
  const isSuperAdmin = String(profile.role || '') === 'super_admin';
  const organizationId = String(requestedOrganizationId || profile.organizationId || '').trim();
  if (!organizationId) throw new Error('An organization membership is required.');
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
