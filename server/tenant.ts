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

  // Hierarchy roles are authoritative even when the same person is also
  // attached to an organization. Organization membership must never silently
  // downgrade a Union/Conference/District/Church administrator into an
  // organization tenant. Organization targets are validated separately by
  // organizationInHierarchyScope() in the operation that needs one.
  if (hierarchyAdmin) {
    const nodeId = String(profile.adminNodeId || '').trim();
    if (!nodeId) throw new Error('This administrator account is not linked to a hierarchy tenant.');
    const role = String(profile.role || '');
    const collection = role === 'union_admin' ? 'unions'
      : role === 'conference_admin' ? 'conferences'
      : role === 'district_admin' ? 'districts'
      : 'churches';
    const node = await db.doc(collection + '/' + nodeId).get();
    if (!node.exists) throw new Error('The assigned hierarchy tenant does not exist.');
    return {
      db, auth, profile, organizationId: '',
      membership: { role, active: true, tenantType: 'hierarchy', tenantId: role + ':' + nodeId },
      isSuperAdmin, tenantType: 'hierarchy', tenantId: role + ':' + nodeId,
    };
  }

  // Tenant identity is derived from the authenticated profile. A client-supplied
  // organizationId may select a tenant only for Super Admin; ordinary and
  // hierarchy-admin accounts must never switch tenant context by request payload.
  if (!isSuperAdmin && requestedId && requestedId !== profileOrganizationId) {
    const requestedMembership = await db.doc(`organizations/${requestedId}/members/${auth.uid}`).get();
    if (!requestedMembership.exists || requestedMembership.data()?.active !== true) {
      // A hierarchy administrator may still use its hierarchy tenant context;
      // it must not impersonate an unrelated organization.
      if (!hierarchyAdmin) throw new Error('You cannot access another organization.');
    }
  }

  // Explicit organization membership takes precedence over a platform/hierarchy
  // role. This is important for accounts that serve at a hierarchy level while
  // also being assigned to an organization as owner/member.
  let organizationId = isSuperAdmin ? requestedId : profileOrganizationId;
  if (!isSuperAdmin && requestedId) {
    const requestedOrganization = await db.doc(`organizations/${requestedId}`).get();
    if (!requestedOrganization.exists || requestedOrganization.data()?.status !== 'active') {
      throw new Error('The organization is not available.');
    }
    const requestedMembership = await db.doc(`organizations/${requestedId}/members/${auth.uid}`).get();
    if (requestedMembership.exists && requestedMembership.data()?.active === true) {
      organizationId = requestedId;
    }
  }
  if (!isSuperAdmin && organizationId) {
    const profileMembership = await db.doc(`organizations/${organizationId}/members/${auth.uid}`).get();
    if (!profileMembership.exists || profileMembership.data()?.active !== true) {
      organizationId = '';
    }
  }

  if (!organizationId && !isSuperAdmin) {
    const memberships = await db.collectionGroup('members')
      .where('uid', '==', auth.uid)
      .where('active', '==', true)
      .limit(20)
      .get();
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
      return {
        db, auth, profile, organizationId: '',
        membership: { role, active: true, tenantType: 'hierarchy', tenantId: role + ':' + nodeId },
        isSuperAdmin, tenantType: 'hierarchy', tenantId: role + ':' + nodeId,
      };
    }
    if (allowUnassigned) return { db, auth, profile, organizationId: '', membership: { role: 'unassigned', active: false }, isSuperAdmin, tenantType: 'platform', tenantId: '' };
    if (isSuperAdmin) return { db, auth, profile, organizationId: '', membership: { role: 'platform', active: true }, isSuperAdmin, tenantType: 'platform', tenantId: '' };
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
  if (ctx.isSuperAdmin) {
    const snapshot = await ctx.db.collection('organizations').where('status', '==', 'active').get();
    return snapshot.docs.map(doc => doc.id);
  }
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
    const direct = String(data[directField] || '').trim() === nodeId
      || String(hierarchy[directField] || '').trim() === nodeId
      || (String(data.hierarchyType || '').trim() === directField.replace('Id','') && String(data.hierarchyId || '').trim() === nodeId)
      || (String(data.adminNodeType || '').trim() === directField.replace('Id','') && String(data.adminNodeId || '').trim() === nodeId);
    if (direct) ids.add(doc.id);
  }
  const users = await ctx.db.collection('users').where(directField, '==', nodeId).limit(500).get();
  users.docs.forEach(doc => {
    const id = String(doc.data()?.organizationId || '').trim();
    if (id) ids.add(id);
  });
  return [...ids];
}

export function tenantOwnerKey(ctx: TenantContext) {
  return ctx.tenantType === 'organization'
    ? ctx.organizationId
    : ctx.tenantType === 'hierarchy'
      ? ctx.tenantId
      : '';
}

export function contentOwnedByOrg(data: DocumentData | undefined, organizationId: string) {
  return String(data?.ownerOrganizationId || data?.organizationId || '') === organizationId;
}

export async function canManageOrganizationContent(ctx: TenantContext, data: DocumentData | undefined) {
  if (ctx.isSuperAdmin) return true;
  const organizationId = String(data?.organizationId || data?.ownerOrganizationId || '').trim();
  if (!organizationId) return false;

  // Hierarchy administrators manage canonical content belonging to organizations
  // inside their assigned hierarchy. Organization membership administrators do
  // not inherit ownership of another contributor's content: even an organization
  // owner/admin may only mutate content they personally created, unless they are
  // the platform Super Admin.
  if (ctx.tenantType === 'hierarchy') {
    return organizationInHierarchyScope(ctx, organizationId);
  }

  return organizationId === ctx.organizationId
    && ['owner', 'admin'].includes(String(ctx.membership.role || ''))
    && String(data?.ownerUid || '') === ctx.auth.uid;
}

export function canEditCanonicalContent(ctx: TenantContext, data: DocumentData | undefined) {
  // Organization membership grants access to the organization, not ownership of
  // another contributor's canonical content. Only the recorded creator/owner or
  // the platform Super Admin may mutate canonical content.
  const ownerKey = String(data?.ownerTenantId || data?.ownerOrganizationId || data?.organizationId || '');
  const currentTenant = tenantOwnerKey(ctx);
  const role = String(ctx.profile.role || '');
  const membershipRole = String(ctx.membership.role || '');
  const canContribute = ['owner','admin','editor','union_admin','conference_admin','district_admin','church_admin'].includes(role)
    || ['owner','admin','editor'].includes(membershipRole);
  return ctx.isSuperAdmin
    || (
      !!currentTenant
      && ownerKey === currentTenant
      && String(data?.ownerUid || '') === ctx.auth.uid
      && canContribute
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
  const tenantKey = tenantOwnerKey(ctx);
  if (!tenantKey) return;
  if (ctx.tenantType === 'organization') {
    await ctx.db.collection(`organizations/${ctx.organizationId}/audit`).add({
      actorUid: ctx.auth.uid,
      actorEmail: ctx.auth.email || '',
      action,
      target,
      organizationId: ctx.organizationId,
      tenantType: ctx.tenantType,
      tenantId: tenantKey,
      before: before || null,
      after: after || null,
      timestamp: FieldValue.serverTimestamp(),
    });
    return;
  }
  if (ctx.tenantType === 'hierarchy') {
    await ctx.db.collection('tenantAudit').doc(tenantKey).collection('entries').add({
      actorUid: ctx.auth.uid,
      actorEmail: ctx.auth.email || '',
      action,
      target,
      tenantType: ctx.tenantType,
      tenantId: tenantKey,
      before: before || null,
      after: after || null,
      timestamp: FieldValue.serverTimestamp(),
    });
  }
}
