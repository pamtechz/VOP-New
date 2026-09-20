import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const BOOTSTRAP_SECRET = process.env.VOP_BOOTSTRAP_SECRET;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function configured() {
  return Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY && BOOTSTRAP_SECRET);
}

function validSecret(provided: unknown) {
  if (typeof provided !== 'string' || !BOOTSTRAP_SECRET) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(BOOTSTRAP_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function adminApp() {
  if (!configured()) throw new Error('VOP administrator backend is not configured.');
  return getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: PRIVATE_KEY,
    }),
  });
}

async function authenticate(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Authentication required.');
  return getAuth(adminApp()).verifyIdToken(header.slice(7), true);
}

async function getRole(uid: string) {
  const db = getFirestore(adminApp());
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? (snap.data()?.role as string | undefined) : undefined;
}

export async function POST(request: Request) {
  try {
    if (!configured()) return json({ error: 'Administrator backend is not configured.' }, 503);

    let body: { action?: string; setupSecret?: string; email?: string; role?: string; adminNodeType?: string; adminNodeId?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON request.' }, 400);
    }

    const decoded = await authenticate(request);
    const action = body.action ?? 'status';

    if (action === 'status') {
      const db = getFirestore(adminApp());
      const snap = await db.doc(`users/${decoded.uid}`).get();
      return json({ configured: true, role: snap.exists ? snap.data()?.role ?? null : null });
    }

    if (action === 'bootstrap') {
      if (!validSecret(body.setupSecret)) return json({ error: 'Invalid setup secret.' }, 403);

      const db = getFirestore(adminApp());
      const authAdmin = getAuth(adminApp());
      const configRef = db.doc('system/security');

      await db.runTransaction(async transaction => {
        const config = await transaction.get(configRef);
        if (config.exists && config.data()?.bootstrapCompleted === true) {
          throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
        }

        const userRef = db.doc(`users/${decoded.uid}`);
        transaction.set(userRef, {
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

        transaction.set(configRef, {
          bootstrapCompleted: true,
          bootstrapUid: decoded.uid,
          completedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      const current = await authAdmin.getUser(decoded.uid);
      await authAdmin.setCustomUserClaims(decoded.uid, {
        ...(current.customClaims ?? {}),
        role: 'super_admin',
        adminNodeType: 'super',
        adminNodeId: 'super',
      });

      return json({ ok: true, role: 'super_admin', message: 'VOP super administrator initialized. This bootstrap can never run again.' });
    }

    if (action === 'assign-admin') {
      const callerRole = await getRole(decoded.uid);
      if (callerRole !== 'super_admin') return json({ error: 'Only the VOP super administrator can assign administrators.' }, 403);

      const targetEmail = body.email?.trim().toLowerCase();
      const role = body.role;
      const allowedRoles = ['union_admin', 'conference_admin', 'district_admin', 'church_admin'];
      if (!targetEmail || !allowedRoles.includes(role ?? '')) return json({ error: 'A valid administrator email and role are required.' }, 400);

      const nodeType = body.adminNodeType;
      const nodeId = body.adminNodeId;
      const expectedNodeType = { union_admin: 'union', conference_admin: 'conference', district_admin: 'district', church_admin: 'church' }[role!];
      if (nodeType !== expectedNodeType || !nodeId) return json({ error: 'The administrator scope is required and must match the selected role.' }, 400);

      const authAdmin = getAuth(adminApp());
      const target = await authAdmin.getUserByEmail(targetEmail);
      const db = getFirestore(adminApp());
      await db.doc(`users/${target.uid}`).set({
        uid: target.uid,
        email: target.email ?? targetEmail,
        displayName: target.displayName ?? null,
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
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

      await authAdmin.setCustomUserClaims(target.uid, {
        ...(target.customClaims ?? {}),
        role,
        adminNodeType: nodeType,
        adminNodeId: nodeId,
      });

      return json({ ok: true, role, email: target.email ?? targetEmail, adminNodeType: nodeType, adminNodeId: nodeId });
    }

    return json({ error: 'Unsupported administrator action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Administrator setup failed.';
    if (message === 'BOOTSTRAP_ALREADY_COMPLETED') return json({ error: 'Bootstrap has already been completed and is permanently locked.' }, 409);
    if (message.includes('Firebase ID token') || message.includes('Authentication')) return json({ error: 'Authentication failed.' }, 401);
    if (message.includes('auth/user-not-found')) return json({ error: 'No Firebase account exists for that email.' }, 404);
    return json({ error: message }, 500);
  }
}
