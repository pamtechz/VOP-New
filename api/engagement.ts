import { randomUUID } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { requirePermissionForProfile } from '../server/permissions.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

type Profile = Record<string, unknown>;

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function header(req: Request, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

async function authUid(req: Request) {
  const authorization = header(req, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  return (await getAuth(admin()).verifyIdToken(authorization.slice(7).trim())).uid;
}

async function profile(db: FirebaseFirestore.Firestore, uid: string): Promise<Profile> {
  const snapshot = await db.doc(`users/${uid}`).get();
  if (!snapshot.exists) throw new Error('Account profile was not found.');
  return { uid, ...(snapshot.data() || {}) };
}

function body(req: Request) {
  return req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
}

function cleanId(value: unknown, field = 'identifier') {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 150 || id.includes('/')) throw new Error(`A valid ${field} is required.`);
  return id;
}

function orgOf(data: Profile) { return String(data.organizationId || '').trim(); }

function sameOrg(actor: Profile, target: Profile) {
  const actorRole = String(actor.role || '');
  if (actorRole === 'super_admin') return true;
  const a = orgOf(actor);
  const b = orgOf(target);
  return Boolean(a && b && a === b);
}

function role(actor: Profile) {
  return String(actor.organizationRole || actor.role || 'student');
}

function canManagePortfolio(actor: Profile) {
  return ['super_admin','union_admin','conference_admin','district_admin','church_admin','owner','admin','mentor','teacher'].includes(role(actor));
}

function nowIso() { return new Date().toISOString(); }

function dueDate(intervalDays: number) {
  return new Date(Date.now() + Math.max(1, intervalDays) * 86_400_000).toISOString();
}

function nextMemoryState(previous: Record<string, unknown>, rating: number) {
  const q = Math.max(0, Math.min(5, Math.round(rating)));
  let repetitions = Number(previous.repetitions || 0);
  let interval = Number(previous.intervalDays || 0);
  let ease = Number(previous.easeFactor || 2.5);
  if (!Number.isFinite(ease) || ease < 1.3) ease = 2.5;
  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(Math.max(1, interval) * ease));
    ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  }
  return {
    repetitions,
    intervalDays: interval,
    easeFactor: Number(ease.toFixed(3)),
    lastRating: q,
    lastReviewedAt: nowIso(),
    dueAt: dueDate(interval),
    mastery: Math.max(0, Math.min(100, Math.round((repetitions / 6) * 100))),
  };
}

function elo(current: number, opponent: number, score: 0 | 1, k = 24) {
  const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
  return Math.round(current + k * (score - expected));
}

async function portfolioAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  const learnerId = cleanId(b.learnerId || actor.uid, 'learner');
  const learner = await profile(db, learnerId);
  if (!sameOrg(actor, learner)) throw new Error('The learner is outside your organization scope.');
  if (learnerId !== String(actor.uid) && !canManagePortfolio(actor)) throw new Error('You cannot manage this learner portfolio.');

  if (action === 'portfolioGet') {
    const [portfolioSnap, requirementsSnap] = await Promise.all([
      db.doc(`masterGuidePortfolios/${learnerId}`).get(),
      db.collection('masterGuideRequirements').where('organizationId', 'in', [orgOf(learner), '']).limit(200).get().catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] })),
    ]);
    return {
      portfolio: portfolioSnap.exists ? { id: portfolioSnap.id, ...portfolioSnap.data() } : { id: learnerId, learnerId, organizationId: orgOf(learner), status: 'active', activities: [], evidence: [], signoffs: [] },
      requirements: requirementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    };
  }

  if (action === 'portfolioSaveActivity') {
    if (!canManagePortfolio(actor) && learnerId !== String(actor.uid)) throw new Error('You cannot update this portfolio.');
    const requirementId = cleanId(b.requirementId, 'requirement');
    const activityId = cleanId(b.activityId || randomUUID(), 'activity');
    const status = String(b.status || 'started');
    if (!['started','submitted','verified','rejected'].includes(status)) throw new Error('Invalid activity status.');
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() || {} : {};
    const activities = Array.isArray(data.activities) ? [...data.activities as unknown[]] : [];
    const existing = activities.findIndex(item => item && typeof item === 'object' && String((item as Record<string, unknown>).id || '') === activityId);
    const activity = { id: activityId, requirementId, title: String(b.title || ''), status, notes: String(b.notes || ''), updatedAt: nowIso(), updatedBy: String(actor.uid) };
    if (existing >= 0) activities[existing] = activity; else activities.push(activity);
    await ref.set({ learnerId, organizationId: orgOf(learner), updatedAt: FieldValue.serverTimestamp(), updatedBy: String(actor.uid), activities }, { merge: true });
    return { activity };
  }

  if (action === 'portfolioEvidence') {
    const evidence = { id: randomUUID(), requirementId: cleanId(b.requirementId, 'requirement'), title: String(b.title || '').trim(), url: String(b.url || '').trim(), note: String(b.note || '').trim(), submittedBy: String(actor.uid), submittedAt: nowIso() };
    if (!evidence.title || !evidence.url) throw new Error('Evidence title and URL are required.');
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    await ref.set({ learnerId, organizationId: orgOf(learner), updatedAt: FieldValue.serverTimestamp(), evidence: FieldValue.arrayUnion(evidence) }, { merge: true });
    return { evidence };
  }

  if (action === 'portfolioSignoff') {
    if (!canManagePortfolio(actor)) throw new Error('Authorized mentor/evaluator access is required.');
    const assignment = await db.doc(`mentorAssignments/${learnerId}`).get();
    const assignedMentor = assignment.exists ? String(assignment.data()?.mentorId || '') : '';
    const actorIsMentor = String(actor.uid) === assignedMentor || ['super_admin','union_admin','conference_admin','district_admin','church_admin','owner','admin','teacher'].includes(role(actor));
    if (!actorIsMentor) throw new Error('You are not an authorized evaluator for this learner.');
    const signoff = { id: randomUUID(), requirementId: cleanId(b.requirementId, 'requirement'), decision: String(b.decision || 'approved') === 'approved' ? 'approved' : 'rejected', notes: String(b.notes || ''), evaluatorId: String(actor.uid), evaluatorRole: role(actor), decidedAt: nowIso() };
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    await ref.set({ learnerId, organizationId: orgOf(learner), updatedAt: FieldValue.serverTimestamp(), signoffs: FieldValue.arrayUnion(signoff) }, { merge: true });
    return { signoff };
  }

  if (action === 'portfolioShare') {
    if (learnerId !== String(actor.uid) && !canManagePortfolio(actor)) throw new Error('You cannot share this portfolio.');
    const token = randomUUID().replaceAll('-', '');
    await db.doc(`masterGuidePortfolioShares/${token}`).set({ token, learnerId, organizationId: orgOf(learner), createdBy: String(actor.uid), createdAt: FieldValue.serverTimestamp(), active: true });
    return { token, url: `/?portfolio=${encodeURIComponent(token)}` };
  }

  throw new Error('Unsupported portfolio action.');
}

async function memoryAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  if (action === 'memoryDecks') {
    const snapshot = await db.collection('scriptureMemoryDecks').where('status', '==', 'published').limit(100).get();
    return { decks: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
  }
  const deckId = cleanId(b.deckId, 'deck');
  if (action === 'memoryDue') {
    const stateSnapshot = await db.collection(`users/${actor.uid}/scriptureMemoryState`).where('deckId', '==', deckId).limit(500).get();
    const stateByVerse = new Map(stateSnapshot.docs.map(doc => [doc.id, doc.data()]));
    const deck = await db.doc(`scriptureMemoryDecks/${deckId}`).get();
    if (!deck.exists || deck.data()?.status !== 'published') throw new Error('This Scripture memory deck is not available.');
    const verses = Array.isArray(deck.data()?.verses) ? deck.data()?.verses as Array<Record<string, unknown>> : [];
    const due = verses.filter(verse => {
      const state = stateByVerse.get(String(verse.id || ''));
      return !state || new Date(String(state.dueAt || 0)).getTime() <= Date.now();
    }).slice(0, 20).map(verse => ({ ...verse, state: stateByVerse.get(String(verse.id || '')) || null }));
    return { deck: { id: deck.id, ...deck.data() }, due };
  }
  if (action === 'memoryReview') {
    const verseId = cleanId(b.verseId, 'verse');
    const rating = Number(b.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) throw new Error('Memory rating must be between 0 and 5.');
    const deck = await db.doc(`scriptureMemoryDecks/${deckId}`).get();
    if (!deck.exists || deck.data()?.status !== 'published') throw new Error('This Scripture memory deck is not available.');
    const verses = Array.isArray(deck.data()?.verses) ? deck.data()?.verses as Array<Record<string, unknown>> : [];
    if (!verses.some(item => String(item.id || '') === verseId)) throw new Error('Verse is not part of this deck.');
    const ref = db.doc(`users/${actor.uid}/scriptureMemoryState/${verseId}`);
    const previous = (await ref.get()).data() || {};
    const next = nextMemoryState(previous, rating);
    await ref.set({ deckId, verseId, ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection(`users/${actor.uid}/scriptureMemoryReviews`).add({ deckId, verseId, rating: Math.round(rating), reviewedAt: FieldValue.serverTimestamp() });
    return { state: next };
  }
  throw new Error('Unsupported Scripture memory action.');
}

async function duelAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  if (action === 'duelQuestions') {
    const snapshot = await db.collection('scriptureDuelQuestions').where('status', '==', 'published').limit(100).get();
    return { questions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), answer: undefined })) };
  }
  if (action === 'duelCreate') {
    const opponentId = cleanId(b.opponentId, 'opponent');
    if (opponentId === String(actor.uid)) throw new Error('You cannot challenge yourself.');
    const opponent = await profile(db, opponentId);
    if (!sameOrg(actor, opponent)) throw new Error('You can only challenge a learner in your organization.');
    const questionSnapshot = await db.collection('scriptureDuelQuestions').where('status', '==', 'published').limit(20).get();
    const questions = questionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (questions.length < 3) throw new Error('At least three published Scripture Duel questions are required.');
    const selected = questions.sort(() => Math.random() - 0.5).slice(0, Math.min(10, questions.length));
    const matchId = randomUUID();
    await db.doc(`scriptureDuels/${matchId}`).set({ matchId, organizationId: orgOf(actor), playerA: String(actor.uid), playerB: opponentId, status: 'active', questionIds: selected.map(q => q.id), answers: {}, scores: { [String(actor.uid)]: 0, [opponentId]: 0 }, createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    return { matchId, questions: selected.map(q => ({ id: q.id, question: q.question, options: q.options, scriptureRef: q.scriptureRef })) };
  }
  const matchId = cleanId(b.matchId, 'match');
  const matchRef = db.doc(`scriptureDuels/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new Error('Duel not found.');
  const match = matchSnap.data() || {};
  if (![String(match.playerA || ''), String(match.playerB || '')].includes(String(actor.uid))) throw new Error('You are not a participant in this duel.');
  if (String(match.status || '') !== 'active') throw new Error('This duel is no longer active.');
  if (new Date(String(match.expiresAt || 0)).getTime() < Date.now()) { await matchRef.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }); throw new Error('This duel has expired.'); }

  if (action === 'duelAnswer') {
    const questionId = cleanId(b.questionId, 'question');
    const answer = String(b.answer ?? '').trim();
    if (!answer) throw new Error('An answer is required.');
    const question = await db.doc(`scriptureDuelQuestions/${questionId}`).get();
    if (!question.exists || question.data()?.status !== 'published' || !Array.isArray(match.questionIds) || !match.questionIds.includes(questionId)) throw new Error('This question is not valid for the duel.');
    const currentAnswers = match.answers && typeof match.answers === 'object' ? match.answers as Record<string, unknown> : {};
    const key = `${String(actor.uid)}:${questionId}`;
    if (currentAnswers[key]) return { accepted: true, duplicate: true, correct: Boolean((currentAnswers[key] as Record<string, unknown>).correct) };
    const expected = String(question.data()?.answer || '').trim().toLowerCase();
    const correct = expected === answer.toLowerCase();
    await matchRef.update({ [`answers.${key}`]: { questionId, answer: answer.slice(0, 300), correct, answeredAt: new Date().toISOString() }, [`scores.${String(actor.uid)}`]: FieldValue.increment(correct ? 1 : 0), updatedAt: FieldValue.serverTimestamp() });
    return { accepted: true, correct };
  }

  if (action === 'duelFinish') {
    const answers = match.answers && typeof match.answers === 'object' ? match.answers as Record<string, unknown> : {};
    const scores = match.scores && typeof match.scores === 'object' ? match.scores as Record<string, unknown> : {};
    const a = String(match.playerA || ''), c = String(match.playerB || '');
    const aScore = Number(scores[a] || 0), bScore = Number(scores[c] || 0);
    const winner = aScore === bScore ? 'draw' : aScore > bScore ? a : c;
    const playerA = await profile(db, a);
    const playerB = await profile(db, c);
    const ratingA = Number(playerA.scriptureDuelRating || 1200);
    const ratingB = Number(playerB.scriptureDuelRating || 1200);
    const nextA = winner === 'draw' ? Math.round((ratingA + ratingB) / 2) : elo(ratingA, ratingB, winner === a ? 1 : 0);
    const nextB = winner === 'draw' ? Math.round((ratingA + ratingB) / 2) : elo(ratingB, ratingA, winner === c ? 1 : 0);
    await db.runTransaction(async transaction => {
      transaction.update(matchRef, { status: 'completed', winner, finishedAt: FieldValue.serverTimestamp(), finalScores: { [a]: aScore, [c]: bScore } });
      transaction.set(db.doc(`users/${a}`), { scriptureDuelRating: nextA }, { merge: true });
      transaction.set(db.doc(`users/${c}`), { scriptureDuelRating: nextB }, { merge: true });
      transaction.set(db.doc(`scriptureDuelResults/${matchId}`), { matchId, organizationId: String(match.organizationId || ''), playerA: a, playerB: c, scores: { [a]: aScore, [c]: bScore }, winner, ratings: { [a]: nextA, [c]: nextB }, answerCount: Object.keys(answers).length, completedAt: FieldValue.serverTimestamp() });
    });
    return { winner, scores: { [a]: aScore, [c]: bScore }, ratings: { [a]: nextA, [c]: nextB } };
  }
  if (action === 'duelHistory') {
    const snapshot = await db.collection('scriptureDuelResults').where('organizationId', '==', orgOf(actor)).limit(100).get();
    return { results: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.playerA === String(actor.uid) || item.playerB === String(actor.uid)) };
  }
  throw new Error('Unsupported Scripture Duel action.');
}

async function publicPortfolioVerify(db: FirebaseFirestore.Firestore, b: Record<string, unknown>) {
  const token = cleanId(b.token, 'verification token');
  const share = await db.doc(`masterGuidePortfolioShares/${token}`).get();
  if (!share.exists || share.data()?.active !== true) throw new Error('Portfolio verification link is invalid or expired.');
  const learnerId = String(share.data()?.learnerId || '');
  const learner = await profile(db, learnerId);
  const portfolio = await db.doc(`masterGuidePortfolios/${learnerId}`).get();
  return { learner: { displayName: String(learner.displayName || 'Learner') }, portfolio: portfolio.exists ? { status: portfolio.data()?.status || 'active', signoffs: portfolio.data()?.signoffs || [], activities: portfolio.data()?.activities || [] } : { status: 'active', signoffs: [], activities: [] }, organizationId: String(share.data()?.organizationId || '') };
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const b = body(req);
    const action = String(b.action || '');
    const db = getFirestore(admin());
    if (action === 'portfolioVerify') {
      const result = await publicPortfolioVerify(db, b);
      return res.status(200).json({ ok: true, ...result });
    }
    const uid = await authUid(req);
    const actor = await profile(db, uid);
    if (action.startsWith('portfolio')) {
      await requirePermissionForProfile(db, actor, 'portfolio', action === 'portfolioGet' ? 'read' : 'manage');
      return res.status(200).json({ ok: true, ...(await portfolioAction(db, actor, b)) });
    }
    if (action.startsWith('memory')) {
      await requirePermissionForProfile(db, actor, 'scripture', action === 'memoryReview' ? 'update' : 'read');
      return res.status(200).json({ ok: true, ...(await memoryAction(db, actor, b)) });
    }
    if (action.startsWith('duel')) {
      await requirePermissionForProfile(db, actor, 'duels', action === 'duelCreate' || action === 'duelAnswer' ? 'create' : 'read');
      return res.status(200).json({ ok: true, ...(await duelAction(db, actor, b)) });
    }
    throw new Error('Unsupported engagement action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Engagement request failed.';
    const status = /permission|scope|outside|cannot|authorized/i.test(message) ? 403 : /sign in|authentication/i.test(message) ? 401 : 400;
    return res.status(status).json({ error: message });
  }
}
