import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const authAdmin = getAuth();
const bootstrapSecret = defineSecret('VOP_BOOTSTRAP_SECRET');

type AdminRole = 'union_admin' | 'conference_admin' | 'district_admin' | 'church_admin';

const roleNodeType: Record<AdminRole, string> = {
  union_admin: 'union',
  conference_admin: 'conference',
  district_admin: 'district',
  church_admin: 'church',
};

export const vopAdminSetup = onCall(
  { secrets: [bootstrapSecret], region: 'us-central1' },
  async request => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');

    const action = typeof request.data?.action === 'string' ? request.data.action : 'status';
    const actorUid = request.auth.uid;
    const actorRef = db.doc(`users/${actorUid}`);

    if (action === 'status') {
      const snap = await actorRef.get();
      return { role: snap.exists ? snap.data()?.role ?? null : null };
    }

    if (action === 'bootstrap') {
      const provided = typeof request.data?.setupSecret === 'string' ? request.data.setupSecret : '';
      if (!provided || provided !== bootstrapSecret.value()) {
        throw new HttpsError('permission-denied', 'Invalid setup secret.');
      }

      const securityRef = db.doc('system/security');
      await db.runTransaction(async transaction => {
        const security = await transaction.get(securityRef);
        if (security.exists && security.data()?.bootstrapCompleted === true) {
          throw new HttpsError('already-exists', 'Bootstrap has already been completed.');
        }

        transaction.set(actorRef, {
          uid: actorUid,
          email: request.auth?.token.email ?? null,
          displayName: request.auth?.token.name ?? null,
          role: 'super_admin',
          adminNodeType: 'super',
          adminNodeId: 'super',
          privileges: {
            admin: true, superAdmin: true, guardian: true, editor: true,
            manager: true, developer: true, coordinator: true,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(securityRef, {
          bootstrapCompleted: true,
          bootstrapUid: actorUid,
          completedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      await authAdmin.setCustomUserClaims(actorUid, {
        ...(request.auth.token ?? {}),
        role: 'super_admin',
        adminNodeType: 'super',
        adminNodeId: 'super',
      });

      return {
        ok: true,
        role: 'super_admin',
        message: 'VOP super administrator initialized. This bootstrap is permanently locked.',
      };
    }

    if (action === 'assign-admin') {
      const actor = await actorRef.get();
      if (!actor.exists || actor.data()?.role !== 'super_admin') {
        throw new HttpsError('permission-denied', 'Only the VOP super administrator can assign administrators.');
      }

      const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
      const role = request.data?.role as AdminRole;
      const nodeType = typeof request.data?.adminNodeType === 'string' ? request.data.adminNodeType : '';
      const nodeId = typeof request.data?.adminNodeId === 'string' ? request.data.adminNodeId.trim() : '';

      if (!email || !Object.prototype.hasOwnProperty.call(roleNodeType, role) || nodeType !== roleNodeType[role] || !nodeId) {
        throw new HttpsError('invalid-argument', 'Valid email, administrator role and matching organization scope are required.');
      }

      let target;
      try {
        target = await authAdmin.getUserByEmail(email);
      } catch {
        throw new HttpsError('not-found', 'No Firebase account exists for that email.');
      }

      await db.doc(`users/${target.uid}`).set({
        uid: target.uid,
        email: target.email ?? email,
        displayName: target.displayName ?? null,
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
        privileges: {
          admin: true, superAdmin: false, guardian: true, editor: false,
          manager: true, developer: false, coordinator: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      await authAdmin.setCustomUserClaims(target.uid, {
        ...(target.customClaims ?? {}),
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
      });

      return { ok: true, role, email: target.email ?? email, adminNodeType: nodeType, adminNodeId: nodeId };
    }

    throw new HttpsError('invalid-argument', 'Unsupported administrator setup action.');
  },
);
