import { randomUUID } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { requirePermissionForProfile } from '../server/permissions.js';
import { createNotification } from '../server/notifications.js';

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
  const a = orgOf(actor);
  const b = orgOf(target);
  return Boolean(a && b && a === b);
}

/** Hierarchy evaluators can review only their descendant organizations. */
async function evaluatorScope(db: FirebaseFirestore.Firestore, actor: Profile, learner: Profile) {
  if (String(actor.role || '') === 'super_admin') return true;
  if (sameOrg(actor, learner)) return true;
  const fields: Record<string, string> = {
    union_admin:'unionId', conference_admin:'conferenceId',
    district_admin:'districtId', church_admin:'churchId',
  };
  const field = fields[String(actor.role || '')];
  const nodeId = String(actor.adminNodeId || '');
  const organizationId = orgOf(learner);
  if (!field || !nodeId || !organizationId) return false;
  const organization = await db.doc('organizations/' + cleanId(organizationId, 'organization')).get();
  if (!organization.exists || organization.data()?.status !== 'active') return false;
  const data = organization.data() || {};
  const hierarchy = data.hierarchy && typeof data.hierarchy === 'object' ? data.hierarchy as Record<string, unknown> : {};
  return String(data[field] || '') === nodeId || String(hierarchy[field] || '') === nodeId;
}

function contentVisibleToLearner(actor: Profile, data: Record<string, unknown>) {
  const ownerOrg = String(data.organizationId || data.ownerOrganizationId || '').trim();
  const scope = String(data.scope || '').toLowerCase();
  if (scope === 'platform' || (!ownerOrg && scope !== 'hierarchy')) return true;
  if (ownerOrg && ownerOrg === orgOf(actor)) return true;
  return data.visibility === 'public' || data.sharingScope === 'shared';
}

function role(actor: Profile) {
  const platformRole = String(actor.role || '');
  // A hierarchy or platform administrator may also hold a learner membership.
  // That membership must not erase their platform role.
  if (['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(platformRole)) return platformRole;
  return String(actor.organizationRole || platformRole || 'student');
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

function elo(current: number, opponent: number, score: 0 | 0.5 | 1, k = 24) {
  const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
  return Math.round(current + k * (score - expected));
}

async function publishedRequirement(db: FirebaseFirestore.Firestore, learner: Profile, value: unknown) {
  const requirementId = cleanId(value, 'requirement');
  const requirement = await db.doc('masterGuideRequirements/' + requirementId).get();
  const data = requirement.data() || {};
  const ownerOrganizationId = String(data.organizationId || '');
  if (!requirement.exists || data.status !== 'published' ||
      (ownerOrganizationId && ownerOrganizationId !== orgOf(learner) && data.sharingScope !== 'shared')) {
    throw new Error('The selected Master Guide requirement is unavailable for this learner.');
  }
  return requirementId;
}

async function portfolioAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  const learnerId = cleanId(b.learnerId || actor.uid, 'learner');
  const learner = await profile(db, learnerId);
  if (!(await evaluatorScope(db, actor, learner))) throw new Error('The learner is outside your organization scope.');
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
    const requirementId = await publishedRequirement(db, learner, b.requirementId);
    const activityId = cleanId(b.activityId || randomUUID(), 'activity');
    const status = String(b.status || 'started');
    if (!['started','submitted'].includes(status)) throw new Error('Only authorized evaluators may verify activities through the sign-off workflow.');
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() || {} : {};
    const activities = Array.isArray(data.activities) ? [...data.activities as unknown[]] : [];
    const existing = activities.findIndex(item => item && typeof item === 'object' && String((item as Record<string, unknown>).id || '') === activityId);
    const activity = { id: activityId, requirementId, title: String(b.title || ''), status, notes: String(b.notes || ''), updatedAt: nowIso(), updatedBy: String(actor.uid) };
    if (existing >= 0) {
      const previous = activities[existing] as Record<string, unknown>;
      if (String(previous.updatedBy || '') !== String(actor.uid)) {
        throw new Error('Only the activity contributor may revise the submission.');
      }
      activities[existing] = activity;
    } else activities.push(activity);
    await ref.set({ learnerId, organizationId: orgOf(learner), updatedAt: FieldValue.serverTimestamp(), updatedBy: String(actor.uid), activities }, { merge: true });
    return { activity };
  }

  if (action === 'portfolioEvidence') {
    const requirementId = await publishedRequirement(db, learner, b.requirementId);
    const evidence = { id: randomUUID(), requirementId, title: String(b.title || '').trim(), url: String(b.url || '').trim(), note: String(b.note || '').trim(), submittedBy: String(actor.uid), submittedAt: nowIso() };
    if (!evidence.title || !evidence.url) throw new Error('Evidence title and URL are required.');
    try {
      const link = new URL(evidence.url);
      if (link.protocol !== 'https:' || link.username || link.password || link.hostname === 'localhost') throw new Error();
    } catch { throw new Error('Evidence must be a public HTTPS URL without credentials.'); }
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
    const requirementId = await publishedRequirement(db, learner, b.requirementId);
    if (learnerId === String(actor.uid)) throw new Error('A learner cannot sign off their own requirement.');
    const portfolioSnap = await db.doc(`masterGuidePortfolios/${learnerId}`).get();
    const activities = Array.isArray(portfolioSnap.data()?.activities) ? portfolioSnap.data()?.activities as Array<Record<string, unknown>> : [];
    if (!activities.some(item => String(item.requirementId || '') === requirementId && item.status === 'submitted')) {
      throw new Error('An activity must be submitted against this requirement before approval.');
    }
    const signoff = { id: randomUUID(), requirementId, decision: String(b.decision || 'approved') === 'approved' ? 'approved' : 'rejected', notes: String(b.notes || ''), evaluatorId: String(actor.uid), evaluatorRole: role(actor), decidedAt: nowIso() };
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    await ref.set({ learnerId, organizationId: orgOf(learner), updatedAt: FieldValue.serverTimestamp(), signoffs: FieldValue.arrayUnion(signoff) }, { merge: true });
    return { signoff };
  }

  if (action === 'portfolioShare') {
    if (learnerId !== String(actor.uid) && !canManagePortfolio(actor)) throw new Error('You cannot share this portfolio.');
    const token = randomUUID().replaceAll('-', '');
    await db.doc(`masterGuidePortfolioShares/${token}`).set({
      token, learnerId, organizationId:orgOf(learner), createdBy:String(actor.uid),
      createdAt:FieldValue.serverTimestamp(),
      expiresAt:new Date(Date.now() + 30 * 86_400_000).toISOString(), active:true,
    });
    return { token, url: `/?portfolio=${encodeURIComponent(token)}` };
  }

  throw new Error('Unsupported portfolio action.');
}

async function memoryAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  if (action === 'memoryDecks') {
    const snapshot = await db.collection('scriptureMemoryDecks').where('status', '==', 'published').limit(100).get();
    return { decks: snapshot.docs.filter(doc => contentVisibleToLearner(actor, doc.data() || {})).map(doc => ({ id: doc.id, ...doc.data() })) };
  }
  const deckId = cleanId(b.deckId, 'deck');
  if (action === 'memoryDue') {
    const stateSnapshot = await db.collection(`users/${actor.uid}/scriptureMemoryState`).where('deckId', '==', deckId).limit(500).get();
    const stateByVerse = new Map(stateSnapshot.docs.map(doc => [String(doc.data().verseId || doc.id), doc.data()]));
    const deck = await db.doc(`scriptureMemoryDecks/${deckId}`).get();
    if (!deck.exists || deck.data()?.status !== 'published' || !contentVisibleToLearner(actor, deck.data() || {})) throw new Error('This Scripture memory deck is not available.');
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
    if (!deck.exists || deck.data()?.status !== 'published' || !contentVisibleToLearner(actor, deck.data() || {})) throw new Error('This Scripture memory deck is not available.');
    const verses = Array.isArray(deck.data()?.verses) ? deck.data()?.verses as Array<Record<string, unknown>> : [];
    if (!verses.some(item => String(item.id || '') === verseId)) throw new Error('Verse is not part of this deck.');
    // A verse may occur in multiple decks: state is keyed by BOTH deck and verse.
    const ref = db.doc(`users/${actor.uid}/scriptureMemoryState/${deckId}:${verseId}`);
    const legacyRef = db.doc(`users/${actor.uid}/scriptureMemoryState/${verseId}`);
    const reviewRef = db.collection(`users/${actor.uid}/scriptureMemoryReviews`).doc();
    const next = await db.runTransaction(async transaction => {
      const current = await transaction.get(ref);
      const legacy = current.exists ? null : await transaction.get(legacyRef);
      const oldState = current.data() ||
        (legacy?.data()?.deckId === deckId ? legacy.data() : {}) || {};
      const updated = nextMemoryState(oldState, rating);
      transaction.set(ref, { deckId, verseId, ...updated, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(reviewRef, { deckId, verseId, rating: Math.round(rating), reviewedAt: FieldValue.serverTimestamp() });
      return updated;
    });
    return { state: next };
  }
  throw new Error('Unsupported Scripture memory action.');
}

async function duelAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  if (action === 'duelAvailability') {
    const optIn = b.enabled === true;
    await db.doc('users/' + cleanId(actor.uid, 'user')).set({ scriptureDuelOptIn: optIn }, { merge: true });
    return { optIn };
  }
  if (action === 'duelOverview') {
    const organizationId = orgOf(actor);
    if (!organizationId) return { opponents: [], matches: [], optIn: false };
    const [people, active] = await Promise.all([
      db.collection('users').where('organizationId', '==', organizationId).limit(200).get(),
      db.collection('scriptureDuels').where('organizationId', '==', organizationId).limit(200).get(),
    ]);
    const names = new Map(people.docs.map(doc => [doc.id, String(doc.data().displayName || 'Learner')]));
    const opponents = people.docs.filter(doc => doc.id !== String(actor.uid) && doc.data().disabled !== true && doc.data().scriptureDuelOptIn === true && ['student', 'learner'].includes(String(doc.data().role || 'student')))
      .map(doc => ({ uid: doc.id, displayName: String(doc.data().displayName || 'Learner') }));
    const matches = active.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.status === 'active' && (item.playerA === String(actor.uid) || item.playerB === String(actor.uid)))
      .map(item => ({ id: item.id, opponentName: names.get(item.playerA === String(actor.uid) ? String(item.playerB) : String(item.playerA)) || 'Learner', expiresAt: item.expiresAt }));
    return { opponents, matches, optIn: actor.scriptureDuelOptIn === true };
  }
  if (action === 'duelJoin') {
    const matchId = cleanId(b.matchId, 'match');
    const match = await db.doc(`scriptureDuels/${matchId}`).get();
    const data = match.data() || {};
    if (!match.exists || data.status !== 'active' || ![String(data.playerA || ''), String(data.playerB || '')].includes(String(actor.uid)) ||
      (!String(data.organizationId || '') && orgOf(actor)) || String(data.organizationId || '') !== orgOf(actor))
      throw new Error('This duel is unavailable to you.');
    const ids = Array.isArray(data.questionIds) ? data.questionIds.map(String).slice(0, 20) : [];
    const questionDocs = await Promise.all(ids.map(id => db.doc(`scriptureDuelQuestions/${cleanId(id, 'question')}`).get()));
    const questions = questionDocs.filter(doc => doc.exists && doc.data()?.status === 'published')
      .map(doc => ({ id: doc.id, question: doc.data()?.question, options: doc.data()?.options, scriptureRef: doc.data()?.scriptureRef }));
    const answers = data.answers && typeof data.answers === 'object' ? data.answers as Record<string, unknown> : {};
    return { matchId, questions, answeredQuestionIds: ids.filter(id => Object.prototype.hasOwnProperty.call(answers, `${String(actor.uid)}:${id}`)), expiresAt: data.expiresAt };
  }
  if (action === 'duelQuestions') {
    const snapshot = await db.collection('scriptureDuelQuestions').where('status', '==', 'published').limit(100).get();
    return { questions: snapshot.docs.filter(doc => contentVisibleToLearner(actor, doc.data() || {}))
      .map(doc => ({ id: doc.id, question: doc.data().question, options: doc.data().options, scriptureRef: doc.data().scriptureRef })) };
  }
  if (action === 'duelCreate') {
    const opponentId = cleanId(b.opponentId, 'opponent');
    if (opponentId === String(actor.uid)) throw new Error('You cannot challenge yourself.');
    const opponent = await profile(db, opponentId);
    if (!sameOrg(actor, opponent)) throw new Error('You can only challenge a learner in your organization.');
    if (opponent.scriptureDuelOptIn !== true || opponent.disabled === true || !['student', 'learner'].includes(String(opponent.role || 'student'))) throw new Error('This learner is not accepting challenges.');
    const questionSnapshot = await db.collection('scriptureDuelQuestions').where('status', '==', 'published').limit(20).get();
    const questions = questionSnapshot.docs.filter(doc => contentVisibleToLearner(actor, doc.data() || {})).map(doc => ({ id: doc.id, ...doc.data() }));
    if (questions.length < 3) throw new Error('At least three published Scripture Duel questions are required.');
    const selected = questions.sort(() => Math.random() - 0.5).slice(0, Math.min(10, questions.length));
    const matchId = randomUUID();
    await db.doc(`scriptureDuels/${matchId}`).set({ matchId, organizationId: orgOf(actor), playerA: String(actor.uid), playerB: opponentId, status: 'active', questionIds: selected.map(q => q.id), answers: {}, scores: { [String(actor.uid)]: 0, [opponentId]: 0 }, createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    await createNotification(db, { organizationId: orgOf(actor), recipientId: opponentId, type: 'assignment',
      title: 'Scripture Duel invitation', body: `${String(actor.displayName || 'A learner').slice(0, 80)} invited you to a Scripture challenge. Open Library → Iron Duels to participate.`,
      metadata: { matchId, source: 'scripture-duel' } });
    return { matchId, questions: selected.map(q => ({ id: q.id, question: q.question, options: q.options, scriptureRef: q.scriptureRef })) };
  }
  if (action === 'duelHistory') {
    const snapshot = await db.collection('scriptureDuelResults').where('organizationId', '==', orgOf(actor)).limit(100).get();
    return { results: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.playerA === String(actor.uid) || item.playerB === String(actor.uid)) };
  }
  const matchId = cleanId(b.matchId, 'match');
  const matchRef = db.doc(`scriptureDuels/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new Error('Duel not found.');
  const match = matchSnap.data() || {};
  if (![String(match.playerA || ''), String(match.playerB || '')].includes(String(actor.uid))) throw new Error('You are not a participant in this duel.');
  if (String(match.status || '') !== 'active') throw new Error('This duel is no longer active.');
  if (action !== 'duelFinish' && new Date(String(match.expiresAt || 0)).getTime() < Date.now()) throw new Error('This duel has expired.');

  if (action === 'duelAnswer') {
    const questionId = cleanId(b.questionId, 'question');
    const answer = String(b.answer ?? '').trim();
    if (!answer) throw new Error('An answer is required.');
    const question = await db.doc(`scriptureDuelQuestions/${questionId}`).get();
    if (!question.exists || question.data()?.status !== 'published' || !Array.isArray(match.questionIds) || !match.questionIds.includes(questionId)) throw new Error('This question is not valid for the duel.');
    const expected = String(question.data()?.answer || '').trim().toLowerCase();
    const correct = expected === answer.toLowerCase();
    return db.runTransaction(async transaction => {
      const latest = await transaction.get(matchRef);
      const data = latest.data() || {};
      if (!latest.exists || data.status !== 'active') throw new Error('This duel is no longer active.');
      if (new Date(String(data.expiresAt || 0)).getTime() < Date.now()) throw new Error('This duel has expired.');
      if (![String(data.playerA || ''), String(data.playerB || '')].includes(String(actor.uid)) ||
          !Array.isArray(data.questionIds) || !data.questionIds.includes(questionId)) throw new Error('You are not authorized to answer this question.');
      const previous = data.answers && typeof data.answers === 'object' ? data.answers as Record<string, unknown> : {};
      const key = `${String(actor.uid)}:${questionId}`;
      if (Object.prototype.hasOwnProperty.call(previous, key)) return { accepted: true, duplicate: true };
      const previousScores = data.scores && typeof data.scores === 'object' ? data.scores as Record<string, number> : {};
      transaction.update(matchRef, {
        answers: { ...previous, [key]: { questionId, answer: answer.slice(0, 300), correct, answeredAt: new Date().toISOString() } },
        scores: { ...previousScores, [String(actor.uid)]: Number(previousScores[String(actor.uid)] || 0) + Number(correct) },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { accepted: true };
    });
  }

  if (action === 'duelFinish') {
    return db.runTransaction(async transaction => {
      const latest = await transaction.get(matchRef);
      const current = latest.data() || {};
      if (!latest.exists || current.status !== 'active') throw new Error('This duel has already finished or is unavailable.');
      const a = String(current.playerA || '');
      const c = String(current.playerB || '');
      if (String(actor.uid) !== a && String(actor.uid) !== c) throw new Error('You are not a participant in this duel.');
      const questionIds = Array.isArray(current.questionIds) ? current.questionIds : [];
      const answers = current.answers && typeof current.answers === 'object' ? current.answers as Record<string, unknown> : {};
      const expired = new Date(String(current.expiresAt || 0)).getTime() < Date.now();
      const answered = questionIds.every(id => Object.prototype.hasOwnProperty.call(answers, `${a}:${id}`) &&
        Object.prototype.hasOwnProperty.call(answers, `${c}:${id}`));
      if (!expired && !answered) throw new Error('Both players must answer every question before finishing the duel.');
      const refA = db.doc(`users/${a}`);
      const refB = db.doc(`users/${c}`);
      const [snapA, snapB] = await Promise.all([transaction.get(refA), transaction.get(refB)]);
      if (!snapA.exists || !snapB.exists) throw new Error('A duel participant was not found.');
      const scores = current.scores && typeof current.scores === 'object' ? current.scores as Record<string, unknown> : {};
      const aScore = Number(scores[a] || 0);
      const bScore = Number(scores[c] || 0);
      const winner = aScore === bScore ? 'draw' : aScore > bScore ? a : c;
      const ratingA = Number(snapA.data()?.scriptureDuelRating || 1200);
      const ratingB = Number(snapB.data()?.scriptureDuelRating || 1200);
      const nextA = elo(ratingA, ratingB, winner === 'draw' ? 0.5 : winner === a ? 1 : 0);
      const nextB = elo(ratingB, ratingA, winner === 'draw' ? 0.5 : winner === c ? 1 : 0);
      transaction.update(matchRef, { status: 'completed', winner, finishedAt: FieldValue.serverTimestamp(), finalScores: { [a]: aScore, [c]: bScore } });
      transaction.set(refA, { scriptureDuelRating: nextA }, { merge: true });
      transaction.set(refB, { scriptureDuelRating: nextB }, { merge: true });
      transaction.set(db.doc(`scriptureDuelResults/${matchId}`), { matchId, organizationId: String(current.organizationId || ''), playerA: a, playerB: c,
        scores: { [a]: aScore, [c]: bScore }, winner, ratings: { [a]: nextA, [c]: nextB }, answerCount: Object.keys(answers).length,
        completedAt: FieldValue.serverTimestamp() });
      return { winner, scores: { [a]: aScore, [c]: bScore }, ratings: { [a]: nextA, [c]: nextB } };
    });
  }
  throw new Error('Unsupported Scripture Duel action.');
}

async function publicPortfolioVerify(db: FirebaseFirestore.Firestore, b: Record<string, unknown>) {
  const token = cleanId(b.token, 'verification token');
  const share = await db.doc(`masterGuidePortfolioShares/${token}`).get();
  if (!share.exists || share.data()?.active !== true
    || new Date(String(share.data()?.expiresAt || 0)).getTime() <= Date.now()) {
    throw new Error('Portfolio verification link is invalid or expired.');
  }
  const learnerId = String(share.data()?.learnerId || '');
  const learner = await profile(db, learnerId);
  const portfolio = await db.doc(`masterGuidePortfolios/${learnerId}`).get();
  // A public verification token does not authorize reading private activity notes, evidence or evaluator metadata.
  const raw = portfolio.data() || {};
  const signoffs = Array.isArray(raw.signoffs) ? raw.signoffs as Array<Record<string, unknown>> : [];
  return {
    learner: { displayName: String(learner.displayName || 'Learner') },
    organizationId: String(share.data()?.organizationId || ''),
    portfolio: {
      status: String(raw.status || 'active'),
      approvedCount: signoffs.filter(item => item.decision === 'approved').length,
      activityCount: Array.isArray(raw.activities) ? raw.activities.length : 0,
    },
  };
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
    const status = /permission|scope|outside|cannot|authorized|organization|unavailable to you|not accepting challenges|only challenge|not a participant/i.test(message) ? 403 : /sign in|authentication/i.test(message) ? 401 : 400;
    return res.status(status).json({ error: message });
  }
}
