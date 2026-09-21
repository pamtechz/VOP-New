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

function normalizeScore(value: unknown): number | null {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function completionKey(language: string, guideId: string, lessonId: string) {
  return `${language}:${guideId}:${lessonId}`;
}

function scoreKey(language: string, guideId: string, testId: string) {
  return `${language}:${guideId}:${testId}`;
}

export default async function handler(request: Request, response: Response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });

  try {
    const firebaseAdmin = admin();
    const authorization = header(request, 'authorization');
    if (!authorization.startsWith('Bearer ')) return response.status(401).json({ error: 'Sign in first.' });

    const decoded = await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());
    const db = getFirestore(firebaseAdmin);
    const actorSnapshot = await db.doc(`users/${decoded.uid}`).get();

    if (!actorSnapshot.exists || actorSnapshot.data()?.role !== 'super_admin') {
      return response.status(403).json({ error: 'Only a super administrator can issue official certificates.' });
    }

    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId.trim() : '';

    if (!candidateId || !/^[A-Za-z0-9_-]{1,128}$/.test(candidateId)) {
      return response.status(400).json({ error: 'A valid candidate ID is required.' });
    }

    const [candidateSnapshot, configSnapshot, requestsSnapshot, guideSnapshot, settingsSnapshot] = await Promise.all([
      db.doc(`users/${candidateId}`).get(),
      db.doc('system/certification').get(),
      db.collection('graduationRequests').where('candidateId', '==', candidateId).limit(50).get(),
      db.collection('curricula/discover/languages').get(),
      db.doc('system/settings').get(),
    ]);

    if (!candidateSnapshot.exists) return response.status(404).json({ error: 'Candidate account was not found.' });

    const candidate = candidateSnapshot.data() ?? {};
    const config = configSnapshot.data() ?? {};
    if (config.enabled !== true) {
      return response.status(409).json({ error: 'Official certification is disabled in certification settings.' });
    }

    const approvedRequest = requestsSnapshot.docs
      .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
      .filter(item => item.status === 'approved' && typeof item.approvedAt === 'string' && Date.parse(item.approvedAt) <= Date.now())
      .sort((a, b) => Date.parse(String(b.approvedAt)) - Date.parse(String(a.approvedAt)))[0];

    if (!approvedRequest) {
      return response.status(409).json({ error: 'The candidate does not have an approved graduation record.' });
    }

    if (candidate.information?.graduated !== true) {
      return response.status(409).json({ error: 'The candidate is not marked as graduated.' });
    }

    const matchingGuide = guideSnapshot.docs.find(snapshot => {
      const data = snapshot.data();
      return String(data.id ?? snapshot.id) === String(approvedRequest.guideId ?? '');
    });

    if (!matchingGuide) {
      return response.status(409).json({ error: 'The approved graduation guide could not be found in the published curriculum.' });
    }

    const approvedLanguage = String(matchingGuide.data().language ?? matchingGuide.id);
    const requiredGuides = guideSnapshot.docs.filter(snapshot => {
      const data = snapshot.data();
      return data.published === true
        && data.archived !== true
        && data.certificateEligible === true
        && String(data.language ?? snapshot.id) === approvedLanguage;
    });

    if (requiredGuides.length === 0) {
      return response.status(409).json({ error: 'No published certificate-eligible curriculum is configured for the candidate.' });
    }

    const progress = candidate.progress && typeof candidate.progress === 'object'
      ? candidate.progress as Record<string, unknown>
      : {};
    const completed = new Set(Array.isArray(progress.completedLessons)
      ? progress.completedLessons.map(value => String(value))
      : []);
    const scores = progress.guideScores && typeof progress.guideScores === 'object'
      ? progress.guideScores as Record<string, unknown>
      : {};

    const configuredMinimum = Number(config.minimumScore);
    const configuredThreshold = Number(settingsSnapshot.data()?.quizPassThreshold ?? 0);
    const threshold = Number.isFinite(configuredMinimum) && configuredMinimum >= 0 && configuredMinimum <= 100
      ? configuredMinimum
      : configuredThreshold;

    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      return response.status(503).json({ error: 'The certification pass mark is not configured.' });
    }

    const configuredGuides: Array<{ id: string; title: string; language: string }> = [];

    for (const guideSnapshotItem of requiredGuides) {
      const data = guideSnapshotItem.data();
      const lessonsSnapshot = await guideSnapshotItem.ref.collection('lessons').get();
      const lessons = lessonsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));

      if (!lessons.length) {
        return response.status(409).json({ error: `Guide "${String(data.title ?? guideSnapshotItem.id)}" has no published curriculum items.` });
      }

      const publishedLessons = lessons.filter(lesson => lesson.published === true);
      if (publishedLessons.length !== lessons.length) {
        return response.status(409).json({ error: `Guide "${String(data.title ?? guideSnapshotItem.id)}" contains unpublished items and cannot be certified.` });
      }

      const studyLessons = publishedLessons.filter(lesson => String(lesson.type ?? 'Lesson') === 'Lesson');
      const tests = publishedLessons.filter(lesson => String(lesson.type ?? '') === 'Test');

      if (studyLessons.length === 0 || tests.length === 0) {
        return response.status(409).json({ error: `Guide "${String(data.title ?? guideSnapshotItem.id)}" must contain lessons and an assessment before certification.` });
      }

      for (const lesson of studyLessons) {
        if (!completed.has(completionKey(approvedLanguage, guideSnapshotItem.id, lesson.id))) {
          return response.status(409).json({ error: `The candidate has not completed all required lessons in "${String(data.title ?? guideSnapshotItem.id)}".` });
        }
      }

      for (const test of tests) {
        if (!Array.isArray(test.questions) || test.questions.length === 0) {
          return response.status(409).json({ error: `Guide "${String(data.title ?? guideSnapshotItem.id)}" has an invalid assessment configuration.` });
        }
        const score = normalizeScore(scores[scoreKey(approvedLanguage, guideSnapshotItem.id, test.id)]);
        if (score === null || score < threshold) {
          return response.status(409).json({ error: `The candidate has not passed all required assessments in "${String(data.title ?? guideSnapshotItem.id)}".` });
        }
      }

      configuredGuides.push({
        id: guideSnapshotItem.id,
        title: String(data.title ?? ''),
        language: approvedLanguage,
      });
    }

    const existingSnapshot = await db.collection('certificates')
      .where('candidateId', '==', candidateId)
      .limit(50)
      .get();
    const existing = existingSnapshot.docs
      .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
      .find(item => item.status === 'Certified' && item.language === approvedLanguage);

    if (existing) {
      return response.status(200).json({ ok: true, created: false, certificate: existing });
    }

    const [churchSnapshot, districtSnapshot, conferenceSnapshot, unionSnapshot] = await Promise.all([
      candidate.churchId ? db.doc(`churches/${candidate.churchId}`).get() : Promise.resolve(null),
      candidate.districtId ? db.doc(`districts/${candidate.districtId}`).get() : Promise.resolve(null),
      candidate.conferenceId ? db.doc(`conferences/${candidate.conferenceId}`).get() : Promise.resolve(null),
      candidate.unionId ? db.doc(`unions/${candidate.unionId}`).get() : Promise.resolve(null),
    ]);

    const certificateRef = db.collection('certificates').doc();
    const issuedAt = FieldValue.serverTimestamp();
    const certificateNumber = `VOP-${new Date().getUTCFullYear()}-${certificateRef.id.toUpperCase()}`;
    const primaryGuide = configuredGuides[0];

    const certificate = {
      candidateId,
      candidateName: String(candidate.displayName ?? ''),
      candidateEmail: String(candidate.email ?? ''),
      candidatePhotoURL: String(candidate.photoURL ?? ''),
      language: approvedLanguage,
      courseName: String(config.courseName ?? primaryGuide.title ?? ''),
      courseCode: String(config.courseCode ?? ''),
      certificateNumber,
      completionDate: String(candidate.information?.completionDate ?? candidate.information?.graduationDate ?? ''),
      issuedAt,
      churchName: churchSnapshot?.exists ? String(churchSnapshot.data()?.name ?? '') : '',
      districtName: districtSnapshot?.exists ? String(districtSnapshot.data()?.name ?? '') : '',
      conferenceName: conferenceSnapshot?.exists ? String(conferenceSnapshot.data()?.name ?? '') : '',
      unionName: unionSnapshot?.exists ? String(unionSnapshot.data()?.name ?? '') : '',
      guideId: primaryGuide.id,
      guideTitle: primaryGuide.title,
      status: 'Certified',
      downloadCount: 0,
      issuedBy: decoded.uid,
      verificationEnabled: config.verificationEnabled === true,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    };

    await certificateRef.set(certificate);
    const saved = await certificateRef.get();

    return response.status(201).json({
      ok: true,
      created: true,
      certificate: { id: saved.id, ...saved.data() },
    });
  } catch (error) {
    console.error('VOP certificate issuance failed', error);
    const message = error instanceof Error ? error.message : 'Certificate issuance failed.';
    if (message.includes('not configured')) return response.status(503).json({ error: message });
    return response.status(500).json({ error: 'Certificate issuance failed.' });
  }
}
