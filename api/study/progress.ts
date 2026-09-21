import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side Firebase administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(req: { headers?: Record<string, string | string[] | undefined> }, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function handler(
  req: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown },
  res: { status: (n: number) => any; json: (v: unknown) => void },
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const firebaseAdmin = admin();
    const authorization = header(req, 'authorization');
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first.' });

    const decoded = await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action ?? '');
    const language = String(body.language ?? '').trim();
    const guideId = String(body.guideId ?? '').trim();
    const lessonId = String(body.lessonId ?? '').trim();

    if (action !== 'completeLesson' || !language || !guideId || !lessonId) {
      return res.status(400).json({ error: 'A valid lesson completion request is required.' });
    }

    const db = getFirestore(firebaseAdmin);
    const guideRef = db.doc(`curricula/discover/languages/${language}`);
    const lessonRef = guideRef.collection('lessons').doc(lessonId);
    const [guideSnapshot, lessonSnapshot] = await Promise.all([guideRef.get(), lessonRef.get()]);

    if (!guideSnapshot.exists || guideSnapshot.data()?.published !== true || guideSnapshot.data()?.archived === true) {
      return res.status(404).json({ error: 'The selected guide is not published.' });
    }
    if (!lessonSnapshot.exists || lessonSnapshot.data()?.published !== true) {
      return res.status(404).json({ error: 'The selected lesson is not published.' });
    }
    if (String(lessonSnapshot.data()?.guideId ?? '') !== guideId) {
      return res.status(409).json({ error: 'The lesson does not belong to the selected guide.' });
    }

    const userRef = db.doc(`users/${decoded.uid}`);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw new Error('VOP account profile was not found.');

      const data = snapshot.data() ?? {};
      const progress = data.progress && typeof data.progress === 'object'
        ? data.progress as Record<string, unknown>
        : {};
      const existing = Array.isArray(progress.completedLessons)
        ? progress.completedLessons.map(value => String(value))
        : [];

      const completionKey = `${language}:${guideId}:${lessonId}`;
      const completedLessons = existing.includes(completionKey) ? existing : [...existing, completionKey];

      transaction.set(userRef, {
        progress: {
          ...progress,
          completedLessons,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return res.status(200).json({ ok: true, completionKey: `${language}:${guideId}:${lessonId}` });
  } catch (error) {
    console.error('VOP lesson progress sync failed', error);
    const message = error instanceof Error ? error.message : 'Lesson progress could not be saved.';
    if (message.includes('not configured')) return res.status(503).json({ error: message });
    if (message.includes('profile was not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: 'Lesson progress could not be saved.' });
  }
}
