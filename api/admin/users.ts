import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { authenticateTenant, enforceQuota } from '../../server/tenant.js';

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

function hierarchyRole(role: string) {
  return ['union_admin','conference_admin','district_admin','church_admin'].includes(role) ? role : '';
}

function hierarchyUserInScope(adminRole: string, nodeId: string, profile: Record<string, unknown>) {
  if (!nodeId) return false;
  const userRole = String(profile.role || '');
  if (userRole === 'super_admin') return false;
  const unionId = String(profile.unionId || '').trim();
  const conferenceId = String(profile.conferenceId || '').trim();
  const districtId = String(profile.districtId || '').trim();
  const churchId = String(profile.churchId || '').trim();
  if (adminRole === 'union_admin') return unionId === nodeId;
  if (adminRole === 'conference_admin') return conferenceId === nodeId;
  if (adminRole === 'district_admin') return districtId === nodeId;
  if (adminRole === 'church_admin') return churchId === nodeId;
  return false;
}

function hierarchyScopeQuery(role: string, nodeId: string) {
  if (role === 'union_admin') return { field: 'unionId', value: nodeId };
  if (role === 'conference_admin') return { field: 'conferenceId', value: nodeId };
  if (role === 'district_admin') return { field: 'districtId', value: nodeId };
  if (role === 'church_admin') return { field: 'churchId', value: nodeId };
  return null;
}

function organizationInHierarchy(data: Record<string, unknown>, role: string, nodeId: string) {
  const directField = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : role === 'church_admin' ? 'churchId' : '';
  if (directField && String(data[directField] || '').trim() === nodeId) return true;
  const hierarchy = data.hierarchy && typeof data.hierarchy === 'object' ? data.hierarchy as Record<string, unknown> : {};
  if (directField && String(hierarchy[directField] || '').trim() === nodeId) return true;
  if (String(data.hierarchyType || '').trim() === directField.replace('Id','') && String(data.hierarchyId || '').trim() === nodeId) return true;
  if (String(data.adminNodeType || '').trim() === directField.replace('Id','') && String(data.adminNodeId || '').trim() === nodeId) return true;
  return false;
}

async function organizationAllowedForHierarchy(db: Firestore, organizationId: string, role: string, nodeId: string) {
  const organization = await db.doc('organizations/' + organizationId).get();
  if (!organization.exists || organization.data()?.status !== 'active') return false;
  if (organizationInHierarchy(organization.data() || {}, role, nodeId)) return true;
  const scope = hierarchyScopeQuery(role, nodeId);
  if (!scope) return false;
  const users = await db.collection('users').where(scope.field, '==', scope.value).where('organizationId', '==', organizationId).limit(1).get();
  return !users.empty;
}

async function hierarchyOrganizations(db: Firestore, role: string, nodeId: string) {
  if (!nodeId) return [];
  const scope = hierarchyScopeQuery(role, nodeId);
  const scopedUsers = scope ? await db.collection('users').where(scope.field, '==', scope.value).get() : { docs: [] };
  const inferredOrganizationIds = new Set(scopedUsers.docs.map(doc => String(doc.data()?.organizationId || '').trim()).filter(Boolean));
  const snapshot = await db.collection('organizations').get();
  return snapshot.docs.filter(doc => {
    const data = doc.data() || {};
    return data.status === 'active' && (organizationInHierarchy(data, role, nodeId) || inferredOrganizationIds.has(doc.id));
  }).map(doc => ({ id: doc.id, name: String(doc.data().name || doc.id), status: String(doc.data().status || 'active') }));
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

async function loadOrganizations(db: Firestore) {
  const [unions, conferences, districts, organizations] = await Promise.all([
    db.collection('unions').get(),
    db.collection('conferences').get(),
    db.collection('districts').get(),
    db.collection('organizations').get(),
  ]);
  return {
    unions: new Map(unions.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
    conferences: new Map(conferences.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
    districts: new Map(districts.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
    organizations: new Map(organizations.docs.map(doc => [doc.id, String(doc.data().name || doc.id)])),
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
      organizationId: String(profile.organizationId || ''),
      organizationName: organizations.organizations.get(String(profile.organizationId || '')) || String(profile.organizationId || ''),
      adminNodeId: String(profile.adminNodeId || ''),
      privileges: profile.privileges || {},
      information: profile.information || {},
    };
  });
}


async function syncOwnProfile(decoded: { uid: string; email?: string; name?: string; picture?: string }, db: Firestore) {
  const ref = db.doc(`users/${decoded.uid}`);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() || {} : {};
  const profile = {
    uid: decoded.uid,
    email: decoded.email ?? existing.email ?? '',
    displayName: decoded.name ?? existing.displayName ?? decoded.email?.split('@')[0] ?? 'VOP Student',
    photoURL: decoded.picture ?? existing.photoURL ?? null,
    role: existing.role ?? 'student',
    adminNodeType: existing.adminNodeType ?? null,
    adminNodeId: existing.adminNodeId ?? null,
    privileges: existing.privileges ?? { admin:false, guardian:false, editor:false, manager:false, developer:false, coordinator:false },
    information: existing.information ?? { enrollmentDate:new Date().toISOString(), graduating:false, graduated:false, baptismCandidate:false, baptized:false },
    progress: existing.progress ?? { discoverProgress:0, completedGuidesCount:0, totalGuidesCount:0, guideScores:{}, completedLessons:[] },
  };
  await ref.set({...profile,updatedAt:FieldValue.serverTimestamp(),createdAt:existing.createdAt ?? FieldValue.serverTimestamp()},{merge:true});
  const latest=await ref.get();
  if(!latest.exists || latest.data()?.uid !== decoded.uid) throw new Error('Firestore profile verification failed.');
  return latest.data();
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
    if (action === 'profile') {
      const profile = await syncOwnProfile(decoded, getFirestore(getFirebaseAdmin()));
      return response.status(200).json({ ok:true, profile });
    }
    if (action === 'updateOwnProfile') {
      const db = getFirestore(getFirebaseAdmin());
      const incoming = body.profile && typeof body.profile === 'object'
        ? body.profile as Record<string, unknown>
        : {};
      const phoneNumber = typeof incoming.phoneNumber === 'string' ? incoming.phoneNumber.trim() : '';
      const address = typeof incoming.address === 'string' ? incoming.address.trim() : '';
      const displayName = typeof incoming.displayName === 'string' ? incoming.displayName.trim() : '';
      if (displayName.length > 120 || phoneNumber.length > 40 || address.length > 500) {
        return response.status(400).json({ error:'Profile details exceed the allowed length.' });
      }
      const ref = db.doc('users/' + decoded.uid);
      const existing = await ref.get();
      if (!existing.exists) return response.status(404).json({ error:'VOP account profile was not found.' });
      await ref.set({
        ...(displayName ? { displayName } : {}),
        phoneNumber,
        address,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge:true });
      const latest = await ref.get();
      return response.status(200).json({ ok:true, profile:latest.data() || {} });
    }
    if (action === 'personalSettings') {
      const db = getFirestore(getFirebaseAdmin());
      const ref = db.doc('users/' + decoded.uid + '/settings/personal');
      if (request.body && typeof request.body === 'object' && (request.body as Record<string, unknown>).operation === 'get') {
        const snapshot = await ref.get();
        return response.status(200).json({ ok:true, settings: snapshot.exists ? snapshot.data() : {} });
      }
      const incoming = body.settings && typeof body.settings === 'object'
        ? body.settings as Record<string, unknown>
        : {};
      const allowed = ['theme','language','uiLocale','studyLanguage','notifications','accessibility','privacy','studyPreferences'];
      const invalid = Object.keys(incoming).filter(key => !allowed.includes(key));
      if (invalid.length) return response.status(400).json({ error:'Unsupported personal setting.' });
      await ref.set({ ...incoming, uid:decoded.uid, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      const snapshot = await ref.get();
      return response.status(200).json({ ok:true, settings:snapshot.data() || {} });
    }

    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : undefined;
    const tenant = await authenticateTenant(request, requestedOrganizationId);
    const db = tenant.db;
    const tenantRole = String(tenant.profile.role || '').trim();
    const hierarchyTenant = hierarchyRole(tenantRole);
    const canManageTenantUsers = tenant.isSuperAdmin || ['owner','admin'].includes(String(tenant.membership.role || '')) || Boolean(hierarchyTenant);
    if (!canManageTenantUsers) throw new Error('Only an authorized tenant administrator can manage users.');
    const tenantOrganizationId = tenant.organizationId;
    const requestedManagedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    const hierarchyNodeId = String(tenant.profile.adminNodeId || '').trim();
    const managedOrganizationId = tenantOrganizationId || (hierarchyTenant && requestedManagedOrganizationId ? requestedManagedOrganizationId : '');
    if (hierarchyTenant && managedOrganizationId) {
      const organizationSnap = await db.doc('organizations/' + managedOrganizationId).get();
      if (!(await organizationAllowedForHierarchy(db, managedOrganizationId, hierarchyTenant, hierarchyNodeId))) {
        throw new Error('The selected organization is outside your assigned hierarchy scope.');
      }
    }

    if (action === 'listOrganizations') {
      if (tenant.isSuperAdmin) {
        const snapshot = await db.collection('organizations').orderBy('name').get();
        return response.status(200).json({ ok:true, items:snapshot.docs.map(doc => ({ id:doc.id, name:String(doc.data().name || doc.id), status:String(doc.data().status || 'active') })) });
      }
      if (hierarchyTenant && !tenantOrganizationId) {
        const items = await hierarchyOrganizations(db, hierarchyTenant, String(tenant.profile.adminNodeId || '').trim());
        return response.status(200).json({ ok:true, items });
      }
      const organization = await db.doc('organizations/' + tenantOrganizationId).get();
      return response.status(200).json({ ok:true, items: organization.exists ? [{ id:organization.id, name:String(organization.data()?.name || organization.id), status:String(organization.data()?.status || 'active') }] : [] });
    }

    if (action === 'list') {
      let users: UserRecord[] = [];
      if (tenant.isSuperAdmin && !tenantOrganizationId) {
        users = await listAllUsers(authService);
      } else if (hierarchyTenant && managedOrganizationId) {
        users = await Promise.all((await db.collection('users').where('organizationId','==',managedOrganizationId).get()).docs.map(async snapshot => authService.getUser(snapshot.id)));
      } else if (hierarchyTenant) {
        const scope = hierarchyScopeQuery(hierarchyTenant, String(tenant.profile.adminNodeId || '').trim());
        if (!scope) throw new Error('The hierarchy tenant scope is not configured.');
        const snapshots = await db.collection('users').where(scope.field, '==', scope.value).get();
        users = await Promise.all(snapshots.docs.map(async snapshot => authService.getUser(snapshot.id)));
      } else {
        users = await Promise.all((await db.collection('users').where('organizationId','==',tenantOrganizationId).get()).docs.map(async snapshot => authService.getUser(snapshot.id)));
      }
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
      if (type === 'admin' && !managedOrganizationId) return response.status(400).json({ error: 'Select an organization tenant before creating an administrator.' });
      if (type === 'super_admin' && !tenant.isSuperAdmin) throw new Error('Only the VOP Super Admin can create platform administrators.');
      if (type === 'admin' && tenantOrganizationId && !['owner','admin'].includes(String(tenant.membership.role || ''))) {
        throw new Error('Only an organization owner or administrator can create organization administrators.');
      }

      if (managedOrganizationId && tenantOrganizationId) await enforceQuota(tenant, 'users', 'maxUsers');
      const created = await authService.createUser({
        email,
        displayName,
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(password ? { password } : {}),
        disabled: false,
      });
      const baseProfile = profileForType(type, body, managedOrganizationId);
      const profile = hierarchyTenant ? { ...baseProfile, role: hierarchyTenant, adminNodeType: tenant.profile.adminNodeType || hierarchyTenant.replace('_admin',''), adminNodeId: hierarchyNodeId } : baseProfile;
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
      const claims = type === 'super_admin'
        ? { role: 'super_admin' }
        : hierarchyRole(String(profile.role || ''))
          ? { role: profile.role, adminNodeType: profile.adminNodeType, adminNodeId: profile.adminNodeId }
          : type === 'admin'
            ? { role: profile.role, adminNodeType: profile.adminNodeType, adminNodeId: profile.adminNodeId }
            : type === 'mentor'
              ? { role: 'mentor' }
              : { role: 'student' };
      if (managedOrganizationId) await db.doc(`organizations/${managedOrganizationId}/members/${created.uid}`).set({ uid:created.uid, organizationId:tenantOrganizationId, role: type === 'admin' ? 'admin' : type === 'mentor' ? 'mentor' : type === 'teacher' ? 'teacher' : 'learner', active:true, invitedBy:decoded.uid, joinedAt:new Date().toISOString(), updatedAt:new Date().toISOString() }, {merge:true});
      await authService.setCustomUserClaims(created.uid, managedOrganizationId ? { role: hierarchyTenant || 'student', adminNodeType: profile.adminNodeType, adminNodeId: profile.adminNodeId, organizationId:managedOrganizationId, organizationRole:profile.organizationRole } : claims);
      const resetLink = await authService.generatePasswordResetLink(email).catch(() => null);
      return response.status(200).json({ ok: true, item: { uid: created.uid, resetLink } });
    }

    if (action === 'assignOrganization') {
      if (!tenant.isSuperAdmin && !hierarchyTenant) throw new Error('Only an authorized tenant administrator can assign organization membership.');
      const targetOrganizationId = String(body.organizationId || '').trim();
      const memberRole = String(body.organizationRole || 'learner').trim();
      if (!targetOrganizationId) throw new Error('Select an organization.');
      if (!['owner','admin','editor','mentor','teacher','learner','viewer'].includes(memberRole)) throw new Error('Select a valid organization role.');
      const organization = await db.doc('organizations/' + targetOrganizationId).get();
      if (hierarchyTenant && !(await organizationAllowedForHierarchy(db, targetOrganizationId, hierarchyTenant, hierarchyNodeId))) throw new Error('The selected organization is outside your assigned hierarchy scope.');
      if (!organization.exists || organization.data()?.status !== 'active') throw new Error('The selected organization is not available.');
      const targetProfile = await db.doc('users/' + uid).get();
      if (!targetProfile.exists) throw new Error('The selected user account does not exist.');
      const existingData = targetProfile.data() || {};
      const previousOrganizationId = String(existingData.organizationId || '').trim();
      const now = new Date().toISOString();
      await db.runTransaction(async transaction => {
        if (previousOrganizationId && previousOrganizationId !== targetOrganizationId) {
          transaction.set(db.doc('organizations/' + previousOrganizationId + '/members/' + uid), { active:false, updatedAt:now }, { merge:true });
        }
        transaction.set(db.doc('organizations/' + targetOrganizationId + '/members/' + uid), { uid, organizationId:targetOrganizationId, role:memberRole, active:true, joinedAt:previousOrganizationId === targetOrganizationId ? String(existingData.joinedAt || now) : now, updatedAt:now, assignedBy:decoded.uid }, { merge:true });
        transaction.set(db.doc('users/' + uid), { organizationId:targetOrganizationId, organizationRole:memberRole, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      });
      const preservedPlatformRole = hierarchyRole(String(existingData.role || '')) || 'student';
      await authService.setCustomUserClaims(uid, { role:preservedPlatformRole, ...(hierarchyRole(preservedPlatformRole) ? { adminNodeType: existingData.adminNodeType, adminNodeId: existingData.adminNodeId } : {}), organizationId:targetOrganizationId, organizationRole:memberRole });
      return response.status(200).json({ ok:true, item:{uid, organizationId:targetOrganizationId, organizationRole:memberRole} });
    }

    if (!uid) return response.status(400).json({ error: 'User ID is required.' });

    // Resolve and authorize the target profile before any Auth mutation.
    // A tenant administrator must never be able to mutate an account from
    // another tenant, even for operations that do not write Firestore data.
    const targetProfileRef = db.doc(`users/${uid}`);
    const targetProfileSnapshot = await targetProfileRef.get();
    const targetProfileData = targetProfileSnapshot.data() || {};
    if (!tenant.isSuperAdmin) {
      if (hierarchyTenant) {
        const targetOrg = String(targetProfileData.organizationId || '').trim();
        if (targetOrg) {
          const targetOrganizationSnap = await db.doc('organizations/' + targetOrg).get();
          if (!(await organizationAllowedForHierarchy(db, targetOrg, hierarchyTenant, hierarchyNodeId))) throw new Error('This user is outside your assigned hierarchy scope.');
        } else if (!hierarchyUserInScope(hierarchyTenant, hierarchyNodeId, targetProfileData)) {
          throw new Error('This user is outside your assigned hierarchy scope.');
        }
      } else if (String(targetProfileData.organizationId || '') !== tenantOrganizationId) {
        throw new Error('This user belongs to another organization.');
      }
    }

    if (action === 'update') {
      const existing = await authService.getUser(uid);
      const profileRef = targetProfileRef;
      const existingProfile = targetProfileSnapshot;
      const existingData = targetProfileData;
      const update: Parameters<typeof authService.updateUser>[1] = {};
      if (typeof body.displayName === 'string') update.displayName = body.displayName.trim();
      if (typeof body.email === 'string' && body.email.trim()) update.email = body.email.trim().toLowerCase();
      if (typeof body.phoneNumber === 'string') update.phoneNumber = body.phoneNumber.trim() || null;
      if (typeof body.photoURL === 'string') update.photoURL = body.photoURL.trim() || null;
      if (typeof body.disabled === 'boolean') update.disabled = body.disabled;
      const updated = await authService.updateUser(uid, update);
      const type = (body.userType === 'super_admin' || body.userType === 'admin' || body.userType === 'teacher' || body.userType === 'mentor' || body.userType === 'guest' || body.userType === 'learner') ? body.userType as ProfileType : profileType(existingData, existing);
      if (tenantOrganizationId && String(existingData.organizationId || '') !== tenantOrganizationId) throw new Error('This user belongs to another organization.');
      if (type === 'super_admin' && !tenant.isSuperAdmin) {
        throw new Error('Only the VOP Super Admin can assign the platform super administrator role.');
      }
      if (type === 'super_admin' && tenantOrganizationId) {
        throw new Error('A platform administrator cannot be assigned to an organization tenant.');
      }
      // Super Admin may manage users platform-wide, but changing a user's
      // display role must not silently detach that user from an existing tenant.
      // Tenant reassignment is a separate, explicit organization operation.
      const effectiveOrganizationId = tenantOrganizationId || String(existingData.organizationId || '').trim();
      const baseProfile = profileForType(type, body, effectiveOrganizationId);
      const existingPlatformRole = hierarchyRole(String(existingData.role || ''));
      const profile = existingPlatformRole
        ? { ...baseProfile, role: existingPlatformRole, adminNodeType: existingData.adminNodeType, adminNodeId: existingData.adminNodeId }
        : baseProfile;
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
      const membershipOrganizationId = effectiveOrganizationId;
      if (membershipOrganizationId && profile.organizationRole) {
        await db.doc(`organizations/${membershipOrganizationId}/members/${uid}`).set({
          uid, organizationId:membershipOrganizationId,
          role:type === 'admin' ? 'admin' : type === 'mentor' ? 'mentor' : type === 'teacher' ? 'teacher' : 'learner',
          active:true, updatedAt:new Date().toISOString(),
        }, {merge:true});
      }
      await authService.setCustomUserClaims(
        uid,
        membershipOrganizationId && profile.organizationRole
          ? { role:'student', organizationId:membershipOrganizationId, organizationRole:profile.organizationRole }
          : claims,
      );
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
      if (!targetProfile.exists) return response.status(404).json({ error: 'The selected user account does not exist.' });
      const targetData = targetProfile.data() || {};
      const targetOrganizationId = String(targetData.organizationId || '').trim();

      // Super Admin may delete any user who belongs to an organization. Tenant
      // administrators are restricted to their own tenant.
      if (!tenant.isSuperAdmin && !hierarchyTenant && targetOrganizationId !== tenantOrganizationId) {
        throw new Error('This user belongs to another organization.');
      }
      if (tenant.isSuperAdmin && tenantOrganizationId && targetOrganizationId !== tenantOrganizationId) {
        throw new Error('This user does not belong to the selected organization.');
      }
      if (!targetOrganizationId) {
        if (!tenant.isSuperAdmin && !hierarchyTenant) throw new Error('This user is not a member of your organization.');
        const platformRole = String(targetData.role || '').trim();
        if (platformRole === 'super_admin' || hierarchyRole(platformRole)) throw new Error('Platform and hierarchy administrator accounts cannot be removed through organization membership management.');
      }

      if (targetOrganizationId) {
        const organizationRef = db.doc(`organizations/${targetOrganizationId}`);
        const organizationSnap = await organizationRef.get();
        if (!organizationSnap.exists) throw new Error('The target organization does not exist.');
        const targetMemberRef = organizationRef.collection('members').doc(uid);
        const targetMemberSnap = await targetMemberRef.get();
        const targetMember = targetMemberSnap.data() || {};
        const targetRole = String(targetMember.role || targetData.organizationRole || '').trim();
        const activeMembersSnap = await organizationRef.collection('members').where('active','==',true).get();
        const activeMembers = activeMembersSnap.docs.filter(doc => doc.id !== uid);
        const remainingAdministrators = activeMembers.filter(doc => {
          const role = String(doc.data()?.role || '').trim();
          return role === 'owner' || role === 'admin';
        });

        // Never leave an organization with members but without an administrator.
        // The sole member may be deleted. An owner with other members must
        // transfer ownership in the same operation; the replacement must already
        // belong to the organization.
        if (['owner','admin'].includes(targetRole) && activeMembers.length > 0 && !tenant.isSuperAdmin) {
          const replacementUid = String(body.replacementUid || '').trim();
          if (targetRole === 'owner') {
            if (!replacementUid || replacementUid === uid) {
              throw new Error('Transfer organization ownership to another member before deleting the owner.');
            }
            const replacementProfileRef = db.doc(`users/${replacementUid}`);
            const replacementProfileSnap = await replacementProfileRef.get();
            const replacementMemberRef = organizationRef.collection('members').doc(replacementUid);
            const replacementMemberSnap = await replacementMemberRef.get();
            if (!replacementProfileSnap.exists || String(replacementProfileSnap.data()?.organizationId || '').trim() !== targetOrganizationId
              || !replacementMemberSnap.exists || replacementMemberSnap.data()?.active !== true) {
              throw new Error('The replacement owner must be an active member of this organization.');
            }
            const now = new Date().toISOString();
            await db.runTransaction(async transaction => {
              transaction.set(targetMemberRef, { role:'admin', updatedAt:now }, { merge:true });
              transaction.set(replacementMemberRef, { role:'owner', active:true, updatedAt:now }, { merge:true });
              transaction.set(targetProfile.ref, { organizationRole:'admin', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
              transaction.set(replacementProfileRef, { organizationRole:'owner', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
              transaction.set(organizationRef, { ownerUid:replacementUid, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
            });
            await authService.setCustomUserClaims(uid, { role:'student', organizationId:targetOrganizationId, organizationRole:'admin' });
            await authService.setCustomUserClaims(replacementUid, { role:'student', organizationId:targetOrganizationId, organizationRole:'owner' });
          } else {
            const hasOtherAdministrator = remainingAdministrators.length > 0;
            if (!hasOtherAdministrator) {
              if (!replacementUid || replacementUid === uid) {
                throw new Error('Assign another administrator before deleting the last administrator in an organization with other members.');
              }
              const replacementProfileRef = db.doc(`users/${replacementUid}`);
              const replacementProfileSnap = await replacementProfileRef.get();
              const replacementMemberRef = organizationRef.collection('members').doc(replacementUid);
              const replacementMemberSnap = await replacementMemberRef.get();
              if (!replacementProfileSnap.exists || String(replacementProfileSnap.data()?.organizationId || '').trim() !== targetOrganizationId
                || !replacementMemberSnap.exists || replacementMemberSnap.data()?.active !== true) {
                throw new Error('The replacement administrator must already be an active member of this organization.');
              }
              const replacementRole = String(replacementMemberSnap.data()?.role || '').trim();
              if (!['learner','viewer','editor','mentor','teacher'].includes(replacementRole)) {
                throw new Error('Select an eligible organization member as the replacement administrator.');
              }
              const now = new Date().toISOString();
              await db.runTransaction(async transaction => {
                transaction.set(replacementMemberRef, { role:'admin', active:true, updatedAt:now }, { merge:true });
                transaction.set(replacementProfileRef, { organizationRole:'admin', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
              });
              await authService.setCustomUserClaims(replacementUid, { role:'student', organizationId:targetOrganizationId, organizationRole:'admin' });
            }
          }
        }      }

      await authService.deleteUser(uid);
      await targetProfile.ref.delete();
      if (targetOrganizationId) {
        await db.doc(`organizations/${targetOrganizationId}/members/${uid}`).delete().catch(() => undefined);
        if (tenant.isSuperAdmin && ['owner','admin'].includes(String(targetData.organizationRole || '').trim())) {
          const organizationRef = db.doc(`organizations/${targetOrganizationId}`);
          const organizationSnap = await organizationRef.get();
          if (String(organizationSnap.data()?.ownerUid || '') === uid) {
            await organizationRef.set({ ownerUid:'', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
          }
        }
      }
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
