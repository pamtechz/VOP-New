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

const COLLECTIONS = new Set([
  'languages',
  'translations',
  'announcements',
  'books',
  'radioBroadcasts',
  'unions',
  'conferences',
  'districts',
  'churches',
  'users',
  'curriculum',
  'certificationConfig',
  'graduationRequests',
  'settings',
]);

function header(request: Request, name: string): string {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Server-side Firebase administration is not configured.');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function authenticate(request: Request) {
  const authorization = header(request, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  return getAuth(admin()).verifyIdToken(authorization.slice(7).trim());
}

function safeDocumentId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 120 || id.includes('/')) throw new Error('A valid document ID is required.');
  return id;
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });

  try {
    const decoded = await authenticate(request);
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const action = typeof body.action === 'string' ? body.action : 'list';
    const collection = typeof body.collection === 'string' ? body.collection : '';

    if (!COLLECTIONS.has(collection)) {
      return response.status(400).json({ error: 'Unsupported content collection.' });
    }

    const db = getFirestore(admin());
    const actor = await db.doc(`users/${decoded.uid}`).get();
    const role = actor.exists ? actor.data()?.role : null;
    if (!role || role === 'student') {
      return response.status(403).json({ error: 'Administrator privileges are required.' });
    }
    if ((collection === 'settings' || collection === 'certificationConfig') && role !== 'super_admin') {
      return response.status(403).json({ error: 'Only a super administrator can manage this configuration.' });
    }

    if (action === 'list') {
      if (collection === 'settings') {
        const snapshot = await db.doc('system/settings').get();
        return response.status(200).json({ ok: true, items: snapshot.exists ? [{ id: 'settings', ...snapshot.data() }] : [] });
      }
      if (collection === 'certificationConfig') {
        const snapshot = await db.doc('system/certification').get();
        return response.status(200).json({ ok: true, items: snapshot.exists ? [{ id: 'certification', ...snapshot.data() }] : [] });
      }
      const snapshot = await db.collection(collection).get();
      const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      return response.status(200).json({ ok: true, items });
    }

    const id = safeDocumentId(body.id);
    const ref = collection === 'settings'
      ? db.doc('system/settings')
      : collection === 'certificationConfig'
        ? db.doc('system/certification')
        : db.doc(`${collection}/${id}`);

    if (action === 'delete') {
      await ref.delete();
      return response.status(200).json({ ok: true, id });
    }

    if (action === 'upsert') {
      if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
        return response.status(400).json({ error: 'Content data must be an object.' });
      }

      const data = {
        ...(body.data as Record<string, unknown>),
        id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: decoded.uid,
      };

      await ref.set(data, { merge: true });
      const saved = await ref.get();
      return response.status(200).json({ ok: true, item: { id, ...saved.data() } });
    }

    return response.status(400).json({ error: 'Unsupported content action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Content operation failed.';
    if (message === 'Sign in first.') return response.status(401).json({ error: message });
    if (message.includes('not configured')) return response.status(503).json({ error: message });
    if (message.includes('valid document ID')) return response.status(400).json({ error: message });
    console.error('VOP content administration failed', error);
    return response.status(500).json({ error: 'Content operation failed.' });
  }
}
