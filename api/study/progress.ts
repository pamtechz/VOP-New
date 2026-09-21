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

type QuestionRecord = {
  key?: unknown;
  question?: unknown;
  answer?: unknown;
  options?: unknown;
  correctOptionIndex?: unknown;
};

function gradeServerQuiz(questions: QuestionRecord[], answers: Record<string, unknown>): number | null {
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const keys = new Set<string>();
  let correct = 0;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const key = typeof question?.key === 'string' ? question.key.trim() : '';
    const text = typeof question?.question === 'string' ? question.question.trim() : '';
    if (!key || !text || keys.has(key)) return null;
    keys.add(key);

    const answer = answers[String(index)];
    if (Array.isArray(question.options)) {
      const options = question.options;
      const correctOptionIndex = question.correctOptionIndex;
      if (
        options.length < 2 ||
        !options.every(option => typeof option === 'string' && option.trim()) ||
        !Number.isInteger(correctOptionIndex) ||
        Number(correctOptionIndex) < 0 ||
        Number(correctOptionIndex) >= options.length ||
        !Number.isInteger(answer) ||
        Number(answer) < 0 ||
        Number(answer) >= options.length
      ) return null;

      if (Number(answer) === Number(correctOptionIndex)) correct += 1;
    } else {
      if (typeof question.answer !== 'boolean' || typeof answer !== 'boolean') return null;
      if (answer === question.answer) correct += 1;
    }
  }

  return correct * 100 / questions.length;
}

export default async function handler(
  req: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown },
  res: { status: (n: number) => unknown; json: (v: unknown) => void },
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const firebaseAdmin = admin();
    const authorization = header(req, 'authorization');
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first.' });

    const decoded = await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action ?? '').trim();
    const language = String(body.language ?? '').trim();
    const guideId = String(body.guideId ?? '').trim();
    const lessonId = String(body.lessonId ?? '').trim();

    if (!language || !guideId || !lessonId || !['completeLesson', 'submitQuiz'].includes(action)) {
      return res.status(400).json({ error: 'A valid study progress request is required.' });
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

    const lessonData = lessonSnapshot.data() ?? {};
    if (String(lessonData.guideId ?? '') !== guideId) {
      return res.status(409).json({ error: 'The lesson does not belong to the selected guide.' });
    }

    const userRef = db.doc(`users/${decoded.uid}`);

    if (action === 'completeLesson') {
      if (String(lessonData.type ?? 'Lesson') !== 'Lesson') {
        return res.status(409).json({ error: 'Only study lessons can be marked complete.' });
      }

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
    }

    if (String(lessonData.type ?? '') !== 'Test') {
      return res.status(409).json({ error: 'The selected item is not an assessment.' });
    }

    const answers = body.answers && typeof body.answers === 'object'
      ? body.answers as Record<string, unknown>
      : {};
    const questions = Array.isArray(lessonData.questions)
      ? lessonData.questions as QuestionRecord[]
      : Array.isArray(lessonData.quiz)
        ? lessonData.quiz as QuestionRecord[]
        : [];
    const score = gradeServerQuiz(questions, answers);

    if (score === null) {
      return res.status(400).json({ error: 'The assessment answers or question configuration are invalid.' });
    }

    const settingsSnapshot = await db.doc('system/settings').get();
    const threshold = Number(settingsSnapshot.data()?.quizPassThreshold ?? 0);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      return res.status(503).json({ error: 'The assessment pass mark is not configured.' });
    }

    const scoreKey = `${language}:${guideId}:${lessonId}`;
    const passed = score >= threshold;

    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw new Error('VOP account profile was not found.');

      const data = snapshot.data() ?? {};
      const progress = data.progress && typeof data.progress === 'object'
        ? data.progress as Record<string, unknown>
        : {};
      const existingScores = progress.guideScores && typeof progress.guideScores === 'object'
        ? progress.guideScores as Record<string, unknown>
        : {};

      transaction.set(userRef, {
        progress: {
          ...progress,
          guideScores: {
            ...existingScores,
            [scoreKey]: score,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return res.status(200).json({ ok: true, score, passed, scoreKey, threshold });
  } catch (error) {
    console.error('VOP study progress sync failed', error);
    const message = error instanceof Error ? error.message : 'Study progress could not be saved.';
    if (message.includes('not configured')) return res.status(503).json({ error: message });
    if (message.includes('profile was not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: 'Study progress could not be saved.' });
  }
}
