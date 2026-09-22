import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { authenticateTenant } from '../lib/tenant';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };
type ProfileType = 'super_admin' | 'admin' | 'teacher' | 'mentor' | 'learner' | 'guest';

const ADMIN_ROLES = new Set(['super_admin', 'union_admin', 'conference_admin', 'district_admin', 'church_admin']);

function getHeader(request: Request, name: string): string {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function getFirebaseAdmin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin server configuration is missing.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function authenticate(request: Request) {
  const authorization = getHeader(request, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new Error('Sign in first.');
  return getAuth(getFirebaseAdmin()).verifyIdToken(token);
}

function profileType(profile: Record<string, unknown> | undefined, authUser: UserRecord): ProfileType {
  const organizationRole = String(profile?.organizationRole || '');
  if (organizationRole === 'admin' || organizationRole === 'editor' || organizationRole === 'mentor' || organizationRole === 'teacher') return organizationRole === 'mentor' ? 'mentor' : organizationRole === 'teacher' ? 'teacher' : 'admin';
  const explicit = profile?.userType;
  if (explicit === 'super_admin' || explicit === 'admin' || explicit === 'teacher' || explicit === 'mentor' || explicit === 'learner' || explicit === 'guest') return explicit;
  const role = String(profile?.role || '');
  if (ADMIN_ROLES.has(role)) return 'admin';
  if (profile?.privileges && typeof profile.privileges === 'object' && (profile.privileges as Record<string, unknown>).editor === true) return 'teacher';
  if (role === 'mentor') return 'mentor';
  if (role === 'student') return authUser.providerData.length ? 'learner' : 'guest';
  return 'learner';
}

function displayRole(type: ProfileType, profile: Record<string, unknown> | undefined): string {
  if (type === 'super_admin') return 'Super Admin';
  if (type === 'admin') return 'Admin';
  if (type === 'teacher') return 'Teacher';
  if (type === 'guest') return 'Guest';
  if (type === 'mentor') return 'Mentor';
  return 'Learner';
}

function roleColor(type: ProfileType): string {
  return type === 'super_admin' || type === 'admin' ? 'admin' : type === 'teacher' ? 'teacher' : type === 'mentor' ? 'mentor' : type === 'guest' ? 'guest' : 'learner';
}

function userCode(authUser: UserRecord, profile: Record<string, unknown> | undefined): string {
  const existing = typeof profile?.userCode === 'string' ? profile.userCode.trim() : '';
  return existing || authUser.uid.slice(0, 12).toUpperCase();
}

async function requireSuperAdmin(decoded: Record<string, unknown>) {
  const db = getFirestore(getFirebaseAdmin());
  const actor = await db.doc(`users/${String(decoded.uid)}`).get();
  if (!actor.exists || actor.data()?.role !== 'super_admin') throw new Error('Only the VOP super administrator can manage users.');
  return db;
}

async function loadOrganizations(db: Firestore) {
  const [unions, conferences, districts] = await Promise.all([
    db.collection('unions').get(),
    db.collection('conferences').get(),
    db.collection('districts').get(),
  ]);
  return {
    unions: new Map(unions.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
    conferences: new Map(conferences.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
    districts: new Map(districts.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
  };
}

async function serializeUsers(db: Firestore, authUsers: UserRecord[]) {
  const refs = authUsers.map(user => db.doc(`users/${user.uid}`));
  const profiles: DocumentSnapshot[] = [];
  for (let index = 0; index < refs.length; index += 100) profiles.push(...await db.getAll(...refs.slice(index, index + 100)));
  const profileMap = new Map(profiles.map(snapshot => [snapshot.id, snapshot.exists ? snapshot.data() || {} : {}]));
  const organizations = await loadOrganizations(db);

  return authUsers.map(authUser => {
    const profile = profileMap.get(authUser.uid) || {};
    const type = profileType(profile, authUser);
    const conferenceId = typeof profile.conferenceId === 'string' ? profile.conferenceId : '';
    const districtId = typeof profile.districtId === 'string' ? profile.districtId : '';
    const unionId = typeof profile.unionId === 'string' ? profile.unionId : '';
    return {
      uid: authUser.uid,
      userCode: userCode(authUser, profile),
      displayName: authUser.displayName || String(profile.displayName || profile.name || 'Unnamed user'),
      email: authUser.email || String(profile.email || ''),
      phoneNumber: authUser.phoneNumber || String(profile.phoneNumber || ''),
      photoURL: authUser.photoURL || String(profile.photoURL || ''),
      role: String(profile.role || 'student'),
      roleLabel: displayRole(type, profile),
      roleColor: roleColor(type),
      userType: type,
      disabled: authUser.disabled === true,
      status: authUser.disabled === true ? 'Inactive' : 'Active',
      emailVerified: authUser.emailVerified === true,
      createdAt: authUser.metadata.creationTime || '',
      lastLogin: authUser.metadata.lastSignInTime || '',
      conferenceId,
      conferenceName: organizations.conferences.get(conferenceId) || conferenceId,
      districtId,
      districtName: organizations.districts.get(districtId) || districtId,
      unionId,
      unionName: organizations.unions.get(unionId) || unionId,
      adminNodeType: String(profile.adminNodeType || ''),
      adminNodeId: String(profile.adminNodeId || ''),
      privileges: profile.privileges || {},
      information: profile.information || {},
    };
  });
}

async function listAllUsers(authService: ReturnType<typeof getAuth>) {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await authService.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function profileForType(type: ProfileType, organization: Record<string, unknown>, tenantOrganizationId = '') {
  if (tenantOrganizationId && type !== 'super_admin') {
    if (type === 'admin') return { role:'student', organizationRole:'admin', organizationId:tenantOrganizationId, adminNodeType:null, adminNodeId:null, privileges:{admin:true,superAdmin:false,guardian:true,editor:false,manager:true,developer:false,coordinator:true} };
    if (type === 'mentor') return { role:'mentor', organizationRole:'mentor', organizationId:tenantOrganizationId, adminNodeType:null, adminNodeId:null, mentorProfile:{enabled:true}, privileges:{admin:false,superAdmin:false,guardian:false,editor:true,manager:false,developer:false,coordinator:true} };
    if (type === 'teacher') return { role:'student', organizationRole:'teacher', organizationId:tenantOrganizationId, adminNodeType:null, adminNodeId:null, privileges:{admin:false,superAdmin:false,guardian:false,editor:true,manager:false,developer:false,coordinator:false} };
    return { role:'student', organizationRole:'learner', organizationId:tenantOrganizationId, adminNodeType:null, adminNodeId:null, privileges:{admin:false,superAdmin:false,guardian:false,editor:false,manager:false,developer:false,coordinator:false} };
  }
  if (type === 'super_admin') {
    return { role: 'super_admin', adminNodeType: null, adminNodeId: null, privileges: { admin: true, superAdmin: true, guardian: true, editor: true, manager: true, developer: true, coordinator: true } };
  }
  if (type === 'admin') {
    const nodeType = String(organization.adminNodeType || 'union');
    const nodeId = String(organization.adminNodeId || '');
    const role = nodeType === 'union' ? 'union_admin' : nodeType === 'conference' ? 'conference_admin' : nodeType === 'district' ? 'district_admin' : nodeType === 'church' ? 'church_admin' : 'union_admin';
    return {
      role,
      adminNodeType: nodeType,
      adminNodeId: nodeId,
      privileges: { admin: true, superAdmin: false, guardian: true, editor: false, manager: true, developer: false, coordinator: true },
    };
  }
  if (type === 'mentor') {
    return {
      role: 'mentor',
      adminNodeType: null,
      adminNodeId: null,
      mentorProfile: { enabled: true },
      privileges: { admin: false, superAdmin: false, guardian: false, editor: true, manager: false, developer: false, coordinator: true },
    };
  }
  if (type === 'teacher') {
    return {
      role: 'student',
      adminNodeType: null,
      adminNodeId: null,
      privileges: { admin: false, superAdmin: false, guardian: false, editor: true, manager: false, developer: false, coordinator: false },
    };
  }
  return {
    role: 'student',
    adminNodeType: null,
    adminNodeId: null,
    privileges: { admin: false, superAdmin: false, guardian: false, editor: false, manager: false, developer: false, coordinator: false },
  };
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });

  try {
    const decoded = await authenticate(request);
    const authService = getAuth(getFirebaseAdmin());
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const action = typeof body.action === 'string' ? body.action : 'list';
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : undefined;
    const tenant = await authenticateTenant(request, requestedOrganizationId);
    const db = tenant.db;
    const canManageTenantUsers = tenant.isSuperAdmin || ['owner','admin'].includes(String(tenant.membership.role || ''));
    if (!canManageTenantUsers) throw new Error('Only an organization owner or administrator can manage organization users.');
    const tenantOrganizationId = tenant.organizationId;

    if (action === 'list') {
      const users = tenant.isSuperAdmin && !tenantOrganizationId
        ? await listAllUsers(authService)
        : await Promise.all((await db.collection('users').where('organizationId','==',tenantOrganizationId).get()).docs.map(async snapshot => authService.getUser(snapshot.id)));
      return response.status(200).json({ ok: true, items: await serializeUsers(db, users) });
    }

    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';

    if (action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const type = (body.userType === 'super_admin' || body.userType === 'admin' || body.userType === 'teacher' || body.userType === 'mentor' || body.userType === 'guest' || body.userType === 'learner') ? body.userType as ProfileType : 'learner';

      if (!email || !displayName) return response.status(400).json({ error: 'Name and email are required.' });
      if (password && password.length < 6) return response.status(400).json({ error: 'Password must contain at least 6 characters.' });
      if (type === 'admin' && !tenantOrganizationId && !String(body.adminNodeId || '').trim()) return response.status(400).json({ error: 'Select an organization scope for an administrator.' });

      const created = await authService.createUser({
        email,
        displayName,
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(password ? { password } : {}),
        disabled: false,
      });
      const profile = profileForType(type, body, tenantOrganizationId);
      if (tenantOrganizationId && type === 'super_admin') throw new Error('Organization administrators cannot create platform administrators.');
      await db.doc(`users/${created.uid}`).set({
        uid: created.uid,
        email,
        displayName,
        ...(phoneNumber ? { phoneNumber } : {}),
        userType: type,
        ...profile,
        information: { enrollmentDate: new Date().toISOString(), graduating: false, graduated: false, baptismCandidate: false, baptized: false },
        progress: { discoverProgress: 0, completedGuidesCount: 0, totalGuidesCount: 0, guideScores: {}, completedLessons: [] },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const claims = type === 'super_admin' ? { role: 'super_admin' } : type === 'admin' ? { role: profile.role, adminNodeType: profile.adminNodeType, adminNodeId: profile.adminNodeId } : type === 'mentor' ? { role: 'mentor' } : { role: 'student' };
      if (tenantOrganizationId) await db.doc(`organizations/${tenantOrganizationId}/members/${created.uid}`).set({ uid:created.uid, organizationId:tenantOrganizationId, role: type === 'admin' ? 'admin' : type === 'mentor' ? 'mentor' : type === 'teacher' ? 'teacher' : 'learner', active:true, invitedBy:decoded.uid, joinedAt:new Date().toISOString(), updatedAt:new Date().toISOString() }, {merge:true});
      await authService.setCustomUserClaims(created.uid, tenantOrganizationId ? { role:'student', organizationId:tenantOrganizationId, organizationRole:profile.organizationRole } : claims);
      const resetLink = await authService.generatePasswordResetLink(email).catch(() => null);
      return response.status(200).json({ ok: true, item: { uid: created.uid, resetLink } });
    }

    if (!uid) return response.status(400).json({ error: 'User ID is required.' });

    if (action === 'update') {
      const existing = await authService.getUser(uid);
      const profileRef = db.doc(`users/${uid}`);
      const existingProfile = await profileRef.get();
      const existingData = existingProfile.data() || {};
      const update: Parameters<typeof authService.updateUser>[1] = {};
      if (typeof body.displayName === 'string') update.displayName = body.displayName.trim();
      if (typeof body.email === 'string' && body.email.trim()) update.email = body.email.trim().toLowerCase();
      if (typeof body.phoneNumber === 'string') update.phoneNumber = body.phoneNumber.trim() || null;
      if (typeof body.photoURL === 'string') update.photoURL = body.photoURL.trim() || null;
      if (typeof body.disabled === 'boolean') update.disabled = body.disabled;
      const updated = await authService.updateUser(uid, update);
      const type = (body.userType === 'super_admin' || body.userType === 'admin' || body.userType === 'teacher' || body.userType === 'mentor' || body.userType === 'guest' || body.userType === 'learner') ? body.userType as ProfileType : profileType(existingData, existing);
      if (tenantOrganizationId && String(existingData.organizationId || '') !== tenantOrganizationId) throw new Error('This user belongs to another organization.');
      const profile = profileForType(type, body, tenantOrganizationId);
      await profileRef.set({
        uid,
        email: updated.email || existingData.email || '',
        displayName: updated.displayName || existingData.displayName || '',
        phoneNumber: updated.phoneNumber || existingData.phoneNumber || '',
        userType: type,
        ...profile,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const claims = type === 'super_admin' ? { role: 'super_admin' } : type === 'admin' ? { role: profile.role, adminNodeType: profile.adminNodeType, adminNodeId: profile.adminNodeId } : type === 'mentor' ? { role: 'mentor' } : { role: 'student' };
      if (tenantOrganizationId) await db.doc(`organizations/${tenantOrganizationId}/members/${uid}`).set({ uid, organizationId:tenantOrganizationId, role:type === 'admin' ? 'admin' : type === 'mentor' ? 'mentor' : type === 'teacher' ? 'teacher' : 'learner', active:true, updatedAt:new Date().toISOString() }, {merge:true});
      await authService.setCustomUserClaims(uid, tenantOrganizationId ? { role:'student', organizationId:tenantOrganizationId, organizationRole:profile.organizationRole } : claims);
      return response.status(200).json({ ok: true, item: { uid, email: updated.email, displayName: updated.displayName } });
    }

    if (action === 'setStatus') {
      if (typeof body.disabled !== 'boolean') return response.status(400).json({ error: 'A valid account status is required.' });
      const updated = await authService.updateUser(uid, { disabled: body.disabled });
      await db.doc(`users/${uid}`).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return response.status(200).json({ ok: true, item: { uid, disabled: updated.disabled } });
    }

    if (action === 'resetPassword') {
      const target = await authService.getUser(uid);
      if (!target.email) return response.status(400).json({ error: 'This user does not have an email address.' });
      const resetLink = await authService.generatePasswordResetLink(target.email);
      return response.status(200).json({ ok: true, email: target.email, resetLink });
    }

    if (action === 'delete') {
      if (uid === String(decoded.uid)) return response.status(400).json({ error: 'The signed-in administrator cannot delete their own account.' });
      const targetProfile = await db.doc(`users/${uid}`).get();
      if (tenantOrganizationId && String(targetProfile.data()?.organizationId || '') !== tenantOrganizationId) throw new Error('This user belongs to another organization.');
      await authService.deleteUser(uid);
      await db.doc(`users/${uid}`).delete();
      if (tenantOrganizationId) await db.doc(`organizations/${tenantOrganizationId}/members/${uid}`).delete().catch(() => undefined);
      return response.status(200).json({ ok: true, uid });
    }

    return response.status(400).json({ error: 'Unsupported user management action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'User management operation failed.';
    if (message === 'Sign in first.') return response.status(401).json({ error: message });
    if (message.includes('Only the VOP super administrator')) return response.status(403).json({ error: message });
    if (message.includes('Firebase Admin server configuration is missing')) return response.status(503).json({ error: 'Server-side Firebase administration is not configured.' });
    console.error('VOP user management failed', error);
    return response.status(500).json({ error: 'User management operation failed.' });
  }
}
