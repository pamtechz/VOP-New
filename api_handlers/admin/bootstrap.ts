import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type Request = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Response = {
  status: (code: number) => Response;
  json: (body: unknown) => void;
};

type AdminRole = 'union_admin' | 'conference_admin' | 'district_admin' | 'church_admin';

const roleNodeType: Record<AdminRole, string> = {
  union_admin: 'union',
  conference_admin: 'conference',
  district_admin: 'district',
  church_admin: 'church',
};

const nodeCollection: Record<string, string> = {
  union: 'unions',
  conference: 'conferences',
  district: 'districts',
  church: 'churches',
};

function getHeader(request: Request, name: string): string {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function getFirebaseAdmin() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin server configuration is missing.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

async function authenticate(request: Request) {
  const authorization = getHeader(request, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new Error('Sign in first.');

  return getAuth(getFirebaseAdmin()).verifyIdToken(token);
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const decoded = await authenticate(request);
    const body = (request.body && typeof request.body === 'object') ? request.body as Record<string, unknown> : {};
    const action = typeof body.action === 'string' ? body.action : 'status';
    const db = getFirestore(getFirebaseAdmin());
    const actorRef = db.doc(`users/${decoded.uid}`);

    if (action === 'status') {
      const snap = await actorRef.get();
      return response.status(200).json({
        ok: true,
        role: snap.exists ? snap.data()?.role ?? null : null,
      });
    }

    if (action === 'bootstrap') {
      const provided = typeof body.setupSecret === 'string' ? body.setupSecret : '';
      const expected = process.env.VOP_BOOTSTRAP_SECRET ?? '';

      if (!expected || !provided || provided !== expected) {
        return response.status(403).json({ error: 'Invalid setup secret.' });
      }

      const securityRef = db.doc('system/security');
      await db.runTransaction(async transaction => {
        const security = await transaction.get(securityRef);
        if (security.exists && security.data()?.bootstrapCompleted === true) {
          const error = new Error('Bootstrap has already been completed.');
          (error as Error & { code?: string }).code = 'ALREADY_EXISTS';
          throw error;
        }

        transaction.set(actorRef, {
          uid: decoded.uid,
          email: decoded.email ?? null,
          displayName: decoded.name ?? null,
          role: 'super_admin',
          adminNodeType: 'super',
          adminNodeId: 'super',
          privileges: {
            admin: true,
            superAdmin: true,
            guardian: true,
            editor: true,
            manager: true,
            developer: true,
            coordinator: true,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(securityRef, {
          bootstrapCompleted: true,
          bootstrapUid: decoded.uid,
          completedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      await getAuth(getFirebaseAdmin()).setCustomUserClaims(decoded.uid, {
        ...(decoded as { role?: string }).role ? { role: (decoded as { role: string }).role } : {},
        role: 'super_admin',
        adminNodeType: 'super',
        adminNodeId: 'super',
      });

      return response.status(200).json({
        ok: true,
        role: 'super_admin',
        message: 'VOP super administrator initialized. This bootstrap is permanently locked.',
      });
    }

    if (action === 'reconcile-hierarchy-tenants') {
      const actor = await actorRef.get();
      if (!actor.exists || actor.data()?.role !== 'super_admin') {
        return response.status(403).json({ error: 'Only the VOP super administrator can reconcile hierarchy tenants.' });
      }

      const usersSnapshot = await db.collection('users').where('role', 'in', [
        'union_admin',
        'conference_admin',
        'district_admin',
        'church_admin',
      ]).get();

      const migrated: Array<{ uid: string; organizationId: string; role: string; adminNodeType: string; adminNodeId: string }> = [];
      const skipped: Array<{ uid: string; reason: string }> = [];
      const unresolved: Array<{ uid: string; role: string; reason: string }> = [];

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data() || {};
        const uid = userDoc.id;
        const role = String(user.role || '');
        const nodeType = roleNodeType[role as AdminRole];
        const nodeId = String(user.adminNodeId || '').trim();

        if (!nodeType || !nodeId) {
          unresolved.push({ uid, role, reason: 'Missing administrator organization scope (adminNodeId).' });
          continue;
        }

        const existingOrganizationId = String(user.organizationId || '').trim();
        if (existingOrganizationId) {
          skipped.push({ uid, reason: 'Already linked to an organization.' });
          continue;
        }

        const organizationId = `${nodeType}-${nodeId}`
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80);

        if (!organizationId) {
          unresolved.push({ uid, role, reason: 'Could not derive a tenant organization identifier.' });
          continue;
        }

        const hierarchyCollection = nodeCollection[nodeType];
        const nodeSnapshot = await db.doc(`${hierarchyCollection}/${nodeId}`).get();
        const nodeName = nodeSnapshot.exists ? String(nodeSnapshot.data()?.name || '').trim() : '';
        const organizationName = nodeName || `${nodeType.charAt(0).toUpperCase()}${nodeType.slice(1)} ${nodeId}`;
        const organizationRef = db.doc(`organizations/${organizationId}`);
        const organizationSnapshot = await organizationRef.get();

        if (organizationSnapshot.exists) {
          const existing = organizationSnapshot.data() || {};
          if (
            (existing.adminNodeType && String(existing.adminNodeType) !== nodeType)
            || (existing.adminNodeId && String(existing.adminNodeId) !== nodeId)
          ) {
            unresolved.push({ uid, role, reason: 'Derived tenant identifier is already assigned to a different organization scope.' });
            continue;
          }
        }

        const now = new Date().toISOString();
        await db.runTransaction(async transaction => {
          transaction.set(
            organizationRef,
            {
              id: organizationId,
              name: organizationName,
              slug: organizationId,
              status: 'active',
              ownerUid: user.ownerUid || uid,
              adminNodeType: nodeType,
              adminNodeId: nodeId,
              tenantType: nodeType,
              createdAt: organizationSnapshot.exists ? organizationSnapshot.data()?.createdAt || now : now,
              updatedAt: now,
            },
            { merge: true },
          );
          transaction.set(
            organizationRef.collection('members').doc(uid),
            {
              uid,
              organizationId,
              role: 'owner',
              active: true,
              joinedAt: now,
              updatedAt: now,
              reconciledAt: now,
              reconciledBy: decoded.uid,
            },
            { merge: true },
          );
          transaction.set(
            actorRef.parent.doc(uid),
            {
              organizationId,
              organizationRole: 'owner',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });

        const target = await getAuth(getFirebaseAdmin()).getUser(uid);
        await getAuth(getFirebaseAdmin()).setCustomUserClaims(uid, {
          ...(target.customClaims ?? {}),
          role,
          adminNodeType: nodeType,
          adminNodeId: nodeId,
          organizationId,
          organizationRole: 'owner',
        });

        migrated.push({ uid, organizationId, role, adminNodeType: nodeType, adminNodeId: nodeId });
      }

      return response.status(200).json({
        ok: true,
        migrated,
        skipped,
        unresolved,
        summary: {
          scanned: usersSnapshot.size,
          migrated: migrated.length,
          skipped: skipped.length,
          unresolved: unresolved.length,
        },
      });
    }

    if (action === 'assign-admin') {
      const actor = await actorRef.get();
      if (!actor.exists || actor.data()?.role !== 'super_admin') {
        return response.status(403).json({ error: 'Only the VOP super administrator can assign administrators.' });
      }

      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const role = body.role as AdminRole;
      const nodeType = typeof body.adminNodeType === 'string' ? body.adminNodeType : '';
      const nodeId = typeof body.adminNodeId === 'string' ? body.adminNodeId.trim() : '';

      if (!email || !Object.prototype.hasOwnProperty.call(roleNodeType, role) ||
          nodeType !== roleNodeType[role] || !nodeId) {
        return response.status(400).json({ error: 'Valid email, administrator role and matching organization scope are required.' });
      }

      // Every hierarchy administrator is also a first-class SaaS tenant.
      // Keep the tenant identity deterministic so re-assigning the same node
      // never creates a second organization for that union/conference/district/church.
      const organizationId = `${nodeType}-${nodeId}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      if (!organizationId) return response.status(400).json({ error: 'The administrator scope could not be converted into a tenant identifier.' });

      let target;
      try {
        target = await getAuth(getFirebaseAdmin()).getUserByEmail(email);
      } catch {
        return response.status(404).json({ error: 'No Firebase account exists for that email.' });
      }

      const organizationRef = db.doc(`organizations/${organizationId}`);
      const organizationSnapshot = await organizationRef.get();
      const existingTargetProfile = await db.doc(`users/${target.uid}`).get();
      const previousOrganizationId = String(existingTargetProfile.data()?.organizationId || '').trim();
      const hierarchyCollection = nodeCollection[nodeType];
      if (!hierarchyCollection) return response.status(400).json({ error: 'Unsupported administrator organization scope.' });
      const nodeSnapshot = await db.doc(`${hierarchyCollection}/${nodeId}`).get();
      const nodeName = nodeSnapshot.exists ? String(nodeSnapshot.data()?.name || '').trim() : '';
      const organizationName = nodeName || `${nodeType.charAt(0).toUpperCase()}${nodeType.slice(1)} ${nodeId}`;
      if (organizationSnapshot.exists) {
        const existing = organizationSnapshot.data() || {};
        if ((existing.adminNodeType && String(existing.adminNodeType) !== nodeType) || (existing.adminNodeId && String(existing.adminNodeId) !== nodeId)) {
          return response.status(409).json({ error: 'This tenant identifier is already assigned to a different organization scope.' });
        }
      } else {
        const now = new Date().toISOString();
        await organizationRef.set({ id: organizationId, name: organizationName, slug: organizationId, status: 'active', ownerUid: target.uid, adminNodeType: nodeType, adminNodeId: nodeId, tenantType: nodeType, createdAt: now, updatedAt: now });
      }

      const now = new Date().toISOString();
      await db.runTransaction(async transaction => {
        if (previousOrganizationId && previousOrganizationId !== organizationId) {
          transaction.set(
            db.doc(`organizations/${previousOrganizationId}/members/${target.uid}`),
            { active: false, reassignedAt: FieldValue.serverTimestamp(), reassignedToOrganizationId: organizationId, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
          transaction.set(
            db.doc(`organizations/${previousOrganizationId}`),
            { updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
        }
        transaction.set(
          organizationRef.collection('members').doc(target.uid),
          { uid: target.uid, organizationId, role: 'owner', active: true, joinedAt: now, updatedAt: now },
          { merge: true },
        );
      });

      await db.doc(`users/${target.uid}`).set({
        uid: target.uid,
        email: target.email ?? email,
        displayName: target.displayName ?? null,
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
        organizationId,
        organizationRole: 'owner',
        privileges: {
          admin: true,
          superAdmin: false,
          guardian: true,
          editor: false,
          manager: true,
          developer: false,
          coordinator: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await getAuth(getFirebaseAdmin()).setCustomUserClaims(target.uid, {
        ...(target.customClaims ?? {}),
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
        organizationId,
        organizationRole: 'owner',
      });

      return response.status(200).json({
        ok: true,
        role,
        email: target.email ?? email,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
        organizationId,
      });
    }

    return response.status(400).json({ error: 'Unsupported administrator setup action.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Bootstrap has already been completed.') {
      return response.status(409).json({ error: error.message });
    }

    const message = error instanceof Error ? error.message : 'Administrator setup failed.';
    if (message === 'Sign in first.') return response.status(401).json({ error: message });
    if (message.includes('Firebase Admin server configuration is missing')) {
      return response.status(503).json({ error: 'Server-side Firebase administration is not configured.' });
    }
    return response.status(500).json({ error: 'Administrator setup failed.' });
  }
}
