import { randomUUID } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { requirePermissionForProfile } from '../server/permissions.js';
import { createNotification } from '../server/notifications.js';
import { engagementCatalog } from '../server/engagementCatalog.js';
import {
  awardEngagementPoints,effectiveEngagementPoints,engagementPointsConfigPath,normalizeEngagementPoints,
} from '../server/engagementPoints.js';

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
async function actorMayManageOrganization(db:FirebaseFirestore.Firestore,actor:Profile,organizationId:string){
  if(String(actor.role||'')==='super_admin')return true;
  if(orgOf(actor)===organizationId)return true;
  const role=String(actor.role||'');
  const field=role==='union_admin'?'unionId':role==='conference_admin'?'conferenceId'
    :role==='district_admin'?'districtId':role==='church_admin'?'churchId':'';
  const nodeId=String(actor.adminNodeId||'').trim();
  if(!field||!nodeId)return false;
  const snapshot=await db.doc('organizations/'+cleanId(organizationId,'organization')).get();
  if(!snapshot.exists)return false;
  const data=snapshot.data()||{};
  const hierarchy=data.hierarchy&&typeof data.hierarchy==='object'?data.hierarchy as Record<string,unknown>:{};
  return String(data[field]||hierarchy[field]||'')===nodeId;
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

async function actorOrganization(db:FirebaseFirestore.Firestore, actor:Profile) {
  const organizationId=orgOf(actor);
  if (!organizationId) return {};
  const snapshot=await db.doc('organizations/'+cleanId(organizationId,'organization')).get();
  return snapshot.data() || {};
}

function contentVisibleToLearner(
  actor: Profile, data: Record<string, unknown>, organization: Record<string,unknown> = {},
) {
  const ownerOrg = String(data.organizationId || data.ownerOrganizationId || '').trim();
  if (data.sharingScope === 'private') {
    return String(data.ownerUid || '') === String(actor.uid || '') || actor.role === 'super_admin';
  }
  const scope = String(data.scope || '').toLowerCase();
  if (scope === 'hierarchy') {
    if (data.sharingScope === 'shared') return true;
    const match=String(data.ownerTenantId || '').match(/^(union_admin|conference_admin|district_admin|church_admin):([A-Za-z0-9_-]{1,120})$/);
    if (!match || !orgOf(actor)) return false;
    const field=({union_admin:'unionId',conference_admin:'conferenceId',
      district_admin:'districtId',church_admin:'churchId'} as Record<string,string>)[match[1]];
    const hierarchy=organization.hierarchy && typeof organization.hierarchy==='object'
      ? organization.hierarchy as Record<string,unknown> : {};
    return String(organization[field] || '')===match[2] || String(hierarchy[field] || '')===match[2]
      || (String(organization.hierarchyType || '')===field.replace('Id','')
        && String(organization.hierarchyId || '')===match[2]);
  }
  if (scope === 'platform' || (!ownerOrg && !scope)) return true;
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
function revisionOf(value: Record<string,unknown>) {
  const revision=Number(value.revision);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}
function signatureCount(value: unknown) {
  const count=Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 20 ? count : 1;
}

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
  const org = data.scope === 'hierarchy' ? await actorOrganization(db,learner) : {};
  if (!requirement.exists || data.status !== 'published'
      || !contentVisibleToLearner(learner, data,org)
      || (ownerOrganizationId && ownerOrganizationId !== orgOf(learner) && data.sharingScope !== 'shared')) {
    throw new Error('The selected Master Guide requirement is unavailable for this learner.');
  }
  return { id:requirementId, requiredSignatures:signatureCount(data.requiredSignatures) };
}

async function portfolioAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  if (action === 'portfolioReviewQueue') {
    if (!canManagePortfolio(actor)) throw new Error('Authorized evaluator access is required.');
    const privileged = ['super_admin','union_admin','conference_admin','district_admin','church_admin','owner','admin','teacher'].includes(role(actor));
    let snapshots: FirebaseFirestore.DocumentSnapshot[];
    if (privileged) {
      const query = db.collection('masterGuidePortfolios');
      const records = String(actor.role || '') === 'super_admin' || ['union_admin','conference_admin','district_admin','church_admin'].includes(String(actor.role || ''))
        ? await query.limit(150).get()
        : await query.where('organizationId','==',orgOf(actor)).limit(150).get();
      snapshots = records.docs;
    } else {
      const assigned = await db.collection('mentorAssignments').where('mentorId','==',String(actor.uid)).limit(100).get();
      snapshots = await Promise.all(assigned.docs.map(doc => db.doc('masterGuidePortfolios/' + cleanId(doc.id, 'learner')).get()));
    }
    const queue = await Promise.all(snapshots.filter(snapshot => snapshot.exists).map(async snapshot => {
      const learner = await profile(db, snapshot.id);
      if (!(await evaluatorScope(db, actor, learner))) return null;
      const data = snapshot.data() || {};
      const activities = Array.isArray(data.activities) ? data.activities as Array<Record<string, unknown>> : [];
      const signoffs = Array.isArray(data.signoffs) ? data.signoffs as Array<Record<string, unknown>> : [];
      const requirementIds=[...new Set(activities.filter(item=>item.status==='submitted').map(item=>String(item.requirementId||'')).filter(Boolean))];
      const pending=requirementIds.filter(requirementId=>{
        const related=activities.filter(item=>String(item.requirementId||'')===requirementId && item.status==='submitted');
        const revision=Math.max(0,...related.map(revisionOf));
        if (!revision) return false;
        const current=related.filter(item=>revisionOf(item)===revision);
        const required=Math.max(1,...current.map(item=>signatureCount(item.requiredSignatures)));
        const decisions=signoffs.filter(item=>String(item.requirementId||'')===requirementId && revisionOf(item)===revision);
        if (decisions.some(item=>item.decision==='changes_requested'||item.decision==='rejected')) return false;
        const approvals=new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||'')));
        return approvals.size < required;
      });
      return { uid:snapshot.id, displayName:String(learner.displayName || learner.email || 'Learner'),
        organizationId:orgOf(learner), pendingCount:pending.length };
    }));
    return { learners:queue.filter((item):item is NonNullable<typeof item> => Boolean(item) && item.pendingCount > 0)
      .sort((a,b)=>b.pendingCount-a.pendingCount || a.displayName.localeCompare(b.displayName)) };
  }
  const learnerId = cleanId(b.learnerId || actor.uid, 'learner');
  const learner = await profile(db, learnerId);
  if (!(await evaluatorScope(db, actor, learner))) throw new Error('The learner is outside your organization scope.');
  if (learnerId !== String(actor.uid) && !canManagePortfolio(actor)) throw new Error('You cannot manage this learner portfolio.');
  if (learnerId !== String(actor.uid) && role(actor) === 'mentor') {
    const assignment = await db.doc(`mentorAssignments/${learnerId}`).get();
    if (!assignment.exists || String(assignment.data()?.mentorId || '') !== String(actor.uid)) {
      throw new Error('Only the allocated mentor may inspect this learner portfolio.');
    }
  }

  if (action === 'portfolioGet') {
    const [portfolioSnap, requirementsSnap, organization] = await Promise.all([
      db.doc(`masterGuidePortfolios/${learnerId}`).get(),
      db.collection('masterGuideRequirements').where('organizationId', 'in', [orgOf(learner), '']).limit(200).get(),
      actorOrganization(db,learner),
    ]);
    return {
      portfolio: portfolioSnap.exists ? { id: portfolioSnap.id, ...portfolioSnap.data() } : { id: learnerId, learnerId, organizationId: orgOf(learner), status: 'active', activities: [], evidence: [], signoffs: [] },
      requirements: requirementsSnap.docs
        .filter(doc => doc.data().status === 'published' && contentVisibleToLearner(learner, doc.data(), organization))
        .map(doc => ({ id:doc.id, ...doc.data() })),
    };
  }

  if (action === 'portfolioSaveActivity') {
    if (!canManagePortfolio(actor) && learnerId !== String(actor.uid)) throw new Error('You cannot update this portfolio.');
    const requirement = await publishedRequirement(db, learner, b.requirementId);
    const requirementId=requirement.id;
    const activityId = cleanId(b.activityId || randomUUID(), 'activity');
    const status = String(b.status || 'started');
    if (!['started','submitted'].includes(status)) throw new Error('Only authorized evaluators may verify activities through the sign-off workflow.');
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    const activity=await db.runTransaction(async transaction=>{
      const snap=await transaction.get(ref);
      const data=snap.exists?snap.data()||{}:{};
      const activities=Array.isArray(data.activities)?[...data.activities as unknown[]]:[];
      const signoffs=Array.isArray(data.signoffs)?data.signoffs as Array<Record<string,unknown>>:[];
      const related=activities.filter(item=>item&&typeof item==='object'&&String((item as Record<string,unknown>).requirementId||'')===requirementId) as Array<Record<string,unknown>>;
      const currentRevision=related.length?Math.max(...related.map(revisionOf)):0;
      const decisions=signoffs.filter(item=>String(item.requirementId||'')===requirementId && revisionOf(item)===Math.max(1,currentRevision));
      const changesRequested=decisions.some(item=>item.decision==='changes_requested'||item.decision==='rejected');
      const approvals=new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||''))).size;
      if (approvals >= requirement.requiredSignatures && !changesRequested) throw new Error('This requirement is already fully approved.');
      if (status==='submitted' && currentRevision>0 && !changesRequested
        && related.some(item=>revisionOf(item)===currentRevision&&item.status==='submitted')) {
        throw new Error('This requirement is already submitted and awaiting evaluator decisions.');
      }
      const existing=activities.findIndex(item=>item&&typeof item==='object'&&String((item as Record<string,unknown>).id||'')===activityId);
      const revision=existing>=0
        ? revisionOf(activities[existing] as Record<string,unknown>)
        : currentRevision===0?1:changesRequested?currentRevision+1:currentRevision;
      const next={id:activityId,requirementId,title:String(b.title||''),status,notes:String(b.notes||''),
        revision,requiredSignatures:requirement.requiredSignatures,updatedAt:nowIso(),updatedBy:String(actor.uid)};
      if(existing>=0){
        const previous=activities[existing] as Record<string,unknown>;
        if(String(previous.updatedBy||'')!==String(actor.uid))throw new Error('Only the activity contributor may revise the submission.');
        activities[existing]=next;
      } else activities.push(next);
      transaction.set(ref,{learnerId,organizationId:orgOf(learner),updatedAt:FieldValue.serverTimestamp(),
        updatedBy:String(actor.uid),activities},{merge:true});
      return next;
    });
    return { activity };
  }

  if (action === 'portfolioEvidence') {
    const requirement = await publishedRequirement(db, learner, b.requirementId);
    const requirementId=requirement.id;
    const title=String(b.title||'').trim(),url=String(b.url||'').trim(),note=String(b.note||'').trim();
    if (!title || !url) throw new Error('Evidence title and URL are required.');
    try {
      const link = new URL(url);
      if (link.protocol !== 'https:' || link.username || link.password || link.hostname === 'localhost') throw new Error();
    } catch { throw new Error('Evidence must be a public HTTPS URL without credentials.'); }
    const ref=db.doc(`masterGuidePortfolios/${learnerId}`);
    const evidence=await db.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      const data=snapshot.data()||{};
      const activities=Array.isArray(data.activities)?data.activities as Array<Record<string,unknown>>:[];
      const signoffs=Array.isArray(data.signoffs)?data.signoffs as Array<Record<string,unknown>>:[];
      const related=activities.filter(item=>String(item.requirementId||'')===requirementId);
      const currentRevision=related.length?Math.max(...related.map(revisionOf)):0;
      const decisions=signoffs.filter(item=>String(item.requirementId||'')===requirementId&&revisionOf(item)===Math.max(1,currentRevision));
      const changesRequested=decisions.some(item=>item.decision==='changes_requested'||item.decision==='rejected');
      const approvals=new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||''))).size;
      if(approvals>=requirement.requiredSignatures&&!changesRequested)throw new Error('This requirement is already fully approved.');
      const revision=currentRevision===0?1:changesRequested?currentRevision+1:currentRevision;
      const next={id:randomUUID(),requirementId,title,url,note,revision,submittedBy:String(actor.uid),submittedAt:nowIso()};
      transaction.set(ref,{learnerId,organizationId:orgOf(learner),updatedAt:FieldValue.serverTimestamp(),
        evidence:FieldValue.arrayUnion(next)},{merge:true});
      return next;
    });
    return { evidence };
  }

  if (action === 'portfolioSignoff') {
    if (!canManagePortfolio(actor)) throw new Error('Authorized mentor/evaluator access is required.');
    const assignment = await db.doc(`mentorAssignments/${learnerId}`).get();
    const assignedMentor = assignment.exists ? String(assignment.data()?.mentorId || '') : '';
    const actorIsMentor = String(actor.uid) === assignedMentor || ['super_admin','union_admin','conference_admin','district_admin','church_admin','owner','admin','teacher'].includes(role(actor));
    if (!actorIsMentor) throw new Error('You are not an authorized evaluator for this learner.');
    const requirement = await publishedRequirement(db, learner, b.requirementId);
    const requirementId=requirement.id;
    if (learnerId === String(actor.uid)) throw new Error('A learner cannot sign off their own requirement.');
    const decision=String(b.decision||'approved');
    if(!['approved','changes_requested'].includes(decision))throw new Error('Choose approve or request changes.');
    const notes=String(b.notes||'').trim();
    if(decision==='changes_requested'&&!notes)throw new Error('Explain the changes the learner must make before resubmitting.');
    const ref = db.doc(`masterGuidePortfolios/${learnerId}`);
    const result=await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data() || {};
      const activities = Array.isArray(data.activities) ? data.activities as Array<Record<string, unknown>> : [];
      const related=activities.filter(item=>String(item.requirementId||'')===requirementId&&item.status==='submitted');
      if(!related.length)throw new Error('An activity must be submitted against this requirement before evaluation.');
      const revision=Math.max(...related.map(revisionOf));
      const decisions = (Array.isArray(data.signoffs) ? data.signoffs as Array<Record<string, unknown>> : [])
        .filter(item=>String(item.requirementId||'')===requirementId&&revisionOf(item)===revision);
      if(decisions.some(item=>item.decision==='changes_requested'||item.decision==='rejected')){
        throw new Error('Changes were already requested for this submission. Wait for the learner to resubmit.');
      }
      if(decisions.some(item=>String(item.evaluatorId||'')===String(actor.uid))){
        throw new Error('You have already evaluated this submission revision.');
      }
      const approvals=new Set(decisions.filter(item=>item.decision==='approved').map(item=>String(item.evaluatorId||item.id||'')));
      if(approvals.size>=requirement.requiredSignatures)throw new Error('This requirement is already fully approved.');
      const signoff={id:randomUUID(),requirementId,revision,decision,notes,evaluatorId:String(actor.uid),
        evaluatorRole:role(actor),requiredSignatures:requirement.requiredSignatures,decidedAt:nowIso()};
      transaction.set(ref,{learnerId,organizationId:orgOf(learner),updatedAt:FieldValue.serverTimestamp(),
        signoffs:FieldValue.arrayUnion(signoff)},{merge:true});
      const approvalsAfter=decision==='approved'?approvals.size+1:approvals.size;
      return {signoff,approvals:approvalsAfter,requiredSignatures:requirement.requiredSignatures,
        complete:decision==='approved'&&approvalsAfter>=requirement.requiredSignatures};
    });
    return result;
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
  const organization=await actorOrganization(db,actor);
  if (action === 'memoryDecks') {
    const snapshot = await db.collection('scriptureMemoryDecks').where('status', '==', 'published').limit(100).get();
    return { decks: snapshot.docs.filter(doc => contentVisibleToLearner(actor, doc.data() || {},organization)).map(doc => ({ id: doc.id, ...doc.data() })) };
  }
  const deckId = cleanId(b.deckId, 'deck');
  if (action === 'memoryDue') {
    const stateSnapshot = await db.collection(`users/${actor.uid}/scriptureMemoryState`).where('deckId', '==', deckId).limit(500).get();
    const stateByVerse = new Map(stateSnapshot.docs.map(doc => [String(doc.data().verseId || doc.id), doc.data()]));
    const deck = await db.doc(`scriptureMemoryDecks/${deckId}`).get();
    if (!deck.exists || deck.data()?.status !== 'published' || !contentVisibleToLearner(actor, deck.data() || {},organization)) throw new Error('This Scripture memory deck is not available.');
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
    if (!deck.exists || deck.data()?.status !== 'published' || !contentVisibleToLearner(actor, deck.data() || {},organization)) throw new Error('This Scripture memory deck is not available.');
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
    const organizationId=orgOf(actor);
    const day=new Date().toISOString().slice(0,10);
    const pointAward=organizationId
      ?await awardEngagementPoints(db,String(actor.uid),organizationId,'memoryDeck','memory-deck-session',deckId+':'+day,{deckId})
      :{awarded:false,points:0,total:null};
    return { state: next, pointAward };
  }
  throw new Error('Unsupported Scripture memory action.');
}

async function duelAction(db: FirebaseFirestore.Firestore, actor: Profile, b: Record<string, unknown>) {
  const action = String(b.action || '');
  const organization=await actorOrganization(db,actor);
  if (action === 'duelAvailability') {
    const optIn = b.enabled === true;
    await db.doc('users/' + cleanId(actor.uid, 'user')).set({ scriptureDuelOptIn: optIn }, { merge: true });
    return { optIn };
  }
  if (action === 'duelLeaderboard') {
    const organizationId = orgOf(actor);
    if (!organizationId) return { leaderboard:[] };
    const people = await db.collection('users').where('organizationId','==',organizationId).limit(500).get();
    const eligible = people.docs.filter(doc => doc.data().scriptureDuelOptIn === true
      && doc.data().disabled !== true && ['student','learner'].includes(String(doc.data().role || 'student')))
      .map(doc => ({
        displayName:String(doc.data().displayName || 'Learner').slice(0,100),
        rating:Number.isFinite(Number(doc.data().scriptureDuelRating))
          ? Number(doc.data().scriptureDuelRating) : 1200,
      }))
      .sort((a,b)=>b.rating-a.rating || a.displayName.localeCompare(b.displayName))
      .slice(0,50);
    return { leaderboard:eligible.map((item,index)=>({rank:index+1,...item})) };
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
      .map(item => ({
        id:item.id,
        mode:String(item.mode||'head_to_head'),
        opponentName:String(item.mode||'head_to_head')==='solo'
          ?'Solo challenge'
          :names.get(item.playerA===String(actor.uid)?String(item.playerB):String(item.playerA))||'Learner',
        expiresAt:item.expiresAt,
      }));
    return { opponents, matches, optIn: actor.scriptureDuelOptIn === true, points:Number(actor.engagementPoints||0) };
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
    return { questions: snapshot.docs.filter(doc => contentVisibleToLearner(actor, doc.data() || {},organization))
      .map(doc => ({ id: doc.id, question: doc.data().question, options: doc.data().options, scriptureRef: doc.data().scriptureRef })) };
  }
  if (action === 'duelCreate') {
    const mode=String(b.mode||'head_to_head')==='solo'?'solo':'head_to_head';
    const organizationId=orgOf(actor);
    if(!organizationId)throw new Error('Your learner account is not linked to an organization.');
    let opponentId='';
    let opponent:Profile|null=null;
    if(mode==='head_to_head'){
      opponentId=cleanId(b.opponentId,'opponent');
      if(opponentId===String(actor.uid))throw new Error('Choose solo mode instead of challenging yourself.');
      opponent=await profile(db,opponentId);
      if(!sameOrg(actor,opponent))throw new Error('You can only challenge a learner in your organization.');
      if(opponent.scriptureDuelOptIn!==true||opponent.disabled===true||!['student','learner'].includes(String(opponent.role||'student'))){
        throw new Error('This learner is not accepting challenges.');
      }
    }
    const outstanding=await db.collection('scriptureDuels')
      .where('playerA','==',String(actor.uid)).where('status','==','active').limit(20).get();
    if(outstanding.docs.filter(doc=>new Date(String(doc.data()?.expiresAt||0)).getTime()>Date.now()).length>=3){
      throw new Error('Complete or expire an existing Scripture challenge before starting more.');
    }
    const questionSnapshot=await db.collection('scriptureDuelQuestions').where('status','==','published').limit(20).get();
    const questions=questionSnapshot.docs.filter(doc=>contentVisibleToLearner(actor,doc.data()||{},organization))
      .map(doc=>({id:doc.id,...doc.data()}));
    if(questions.length<3)throw new Error('At least three published Scripture challenge questions are required.');
    const selected=questions.sort(()=>Math.random()-0.5).slice(0,Math.min(10,questions.length));
    const matchId=randomUUID();
    await db.doc(`scriptureDuels/${matchId}`).set({
      matchId,mode,organizationId,playerA:String(actor.uid),playerB:opponentId,status:'active',
      questionIds:selected.map(q=>q.id),answers:{},
      scores:{[String(actor.uid)]:0,...(opponentId?{[opponentId]:0}:{})},
      createdAt:FieldValue.serverTimestamp(),expiresAt:new Date(Date.now()+30*60_000).toISOString(),
    });
    if(mode==='head_to_head'&&opponentId){
      await createNotification(db,{organizationId,recipientId:opponentId,type:'assignment',
        title:'Scripture Duel invitation',body:`${String(actor.displayName||'A learner').slice(0,80)} invited you to a Scripture challenge. Open Library → Iron Duels to participate.`,
        metadata:{matchId,source:'scripture-duel'}});
    }
    return {
      matchId,mode,
      questions:selected.map(q=>({id:q.id,question:q.question,options:q.options,scriptureRef:q.scriptureRef})),
    };
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
    const options = Array.isArray(question.data()?.options) ? question.data()?.options as unknown[] : [];
    if (!options.some(option => typeof option === 'string' && option.trim().toLowerCase() === answer.toLowerCase())) {
      throw new Error('Choose one of the available answer options.');
    }
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
    const result=await db.runTransaction(async transaction=>{
      const latest=await transaction.get(matchRef);
      const current=latest.data()||{};
      if(!latest.exists||current.status!=='active')throw new Error('This challenge has already finished or is unavailable.');
      const a=String(current.playerA||'');
      const c=String(current.playerB||'');
      const mode=String(current.mode||'head_to_head')==='solo'?'solo':'head_to_head';
      if(String(actor.uid)!==a&&String(actor.uid)!==c)throw new Error('You are not a participant in this challenge.');
      const questionIds=Array.isArray(current.questionIds)?current.questionIds.map(String):[];
      const answers=current.answers&&typeof current.answers==='object'?current.answers as Record<string,unknown>:{};
      const expired=new Date(String(current.expiresAt||0)).getTime()<Date.now();
      const actorAnswered=questionIds.every(id=>Object.prototype.hasOwnProperty.call(answers,`${String(actor.uid)}:${id}`));
      if(mode==='solo'){
        if(!expired&&!actorAnswered)throw new Error('Answer every question before finishing the solo challenge.');
        const priorScores=current.scores&&typeof current.scores==='object'?current.scores as Record<string,unknown>:{};
        const score=Number(priorScores[String(actor.uid)]||0);
        const status=actorAnswered?'completed':'expired';
        transaction.update(matchRef,{status,winner:actorAnswered?String(actor.uid):'unranked',finishedAt:FieldValue.serverTimestamp(),
          finalScores:{[String(actor.uid)]:score}});
        transaction.set(db.doc(`scriptureDuelResults/${matchId}`),{
          matchId,mode:'solo',organizationId:String(current.organizationId||''),playerA:a,playerB:'',
          scores:{[a]:score},winner:actorAnswered?a:'unranked',ranked:false,
          answerCount:Object.keys(answers).length,completedAt:FieldValue.serverTimestamp(),
        });
        return {mode:'solo',completed:actorAnswered,winner:actorAnswered?a:'unranked',scores:{[a]:score},ranked:false,participants:[a]};
      }
      const answered=questionIds.every(id=>Object.prototype.hasOwnProperty.call(answers,`${a}:${id}`)
        &&Object.prototype.hasOwnProperty.call(answers,`${c}:${id}`));
      if(!expired&&!answered)throw new Error('Both players must answer every question before finishing the duel.');
      if(expired&&!answered){
        const priorScores=current.scores&&typeof current.scores==='object'?current.scores as Record<string,unknown>:{};
        const unrankedScores={[a]:Number(priorScores[a]||0),[c]:Number(priorScores[c]||0)};
        transaction.update(matchRef,{status:'expired',winner:'unranked',finishedAt:FieldValue.serverTimestamp(),finalScores:unrankedScores});
        transaction.set(db.doc(`scriptureDuelResults/${matchId}`),{
          matchId,mode:'head_to_head',organizationId:String(current.organizationId||''),playerA:a,playerB:c,
          scores:unrankedScores,winner:'unranked',ranked:false,
          answerCount:Object.keys(answers).length,completedAt:FieldValue.serverTimestamp(),
        });
        return {mode:'head_to_head',completed:false,winner:'unranked',scores:unrankedScores,ranked:false,participants:[a,c]};
      }
      const refA=db.doc(`users/${a}`),refB=db.doc(`users/${c}`);
      const [snapA,snapB]=await Promise.all([transaction.get(refA),transaction.get(refB)]);
      if(!snapA.exists||!snapB.exists)throw new Error('A duel participant was not found.');
      const scores=current.scores&&typeof current.scores==='object'?current.scores as Record<string,unknown>:{};
      const aScore=Number(scores[a]||0),bScore=Number(scores[c]||0);
      const winner=aScore===bScore?'draw':aScore>bScore?a:c;
      const ratingA=Number(snapA.data()?.scriptureDuelRating||1200),ratingB=Number(snapB.data()?.scriptureDuelRating||1200);
      const nextA=elo(ratingA,ratingB,winner==='draw'?0.5:winner===a?1:0);
      const nextB=elo(ratingB,ratingA,winner==='draw'?0.5:winner===c?1:0);
      transaction.update(matchRef,{status:'completed',winner,finishedAt:FieldValue.serverTimestamp(),finalScores:{[a]:aScore,[c]:bScore}});
      transaction.set(refA,{scriptureDuelRating:nextA},{merge:true});
      transaction.set(refB,{scriptureDuelRating:nextB},{merge:true});
      transaction.set(db.doc(`scriptureDuelResults/${matchId}`),{
        matchId,mode:'head_to_head',organizationId:String(current.organizationId||''),playerA:a,playerB:c,
        scores:{[a]:aScore,[c]:bScore},winner,ratings:{[a]:nextA,[c]:nextB},
        answerCount:Object.keys(answers).length,completedAt:FieldValue.serverTimestamp(),
      });
      return {mode:'head_to_head',completed:true,winner,scores:{[a]:aScore,[c]:bScore},ratings:{[a]:nextA,[c]:nextB},participants:[a,c]};
    });
    const organizationId=orgOf(actor);
    const pointAwards:Array<{uid:string;awarded:boolean;points:number;total:null}>=[];
    if(result.completed&&organizationId){
      const key=result.mode==='solo'?'soloChallenge':'duelChallenge';
      for(const participant of result.participants){
        if(participant){
          pointAwards.push({uid:participant,...await awardEngagementPoints(
            db,participant,organizationId,key,'scripture-challenge',matchId,{mode:result.mode},
          )});
        }
      }
    }
    return {...result,pointAwards};
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
    if (['catalogList','catalogUpsert','catalogArchive'].includes(action)) {
      return res.status(200).json({ ok:true, ...(await engagementCatalog(req, b)) });
    }
    if (action === 'portfolioVerify') {
      const result = await publicPortfolioVerify(db, b);
      return res.status(200).json({ ok: true, ...result });
    }
    const uid = await authUid(req);
    const actor = await profile(db, uid);
    if(action==='pointsSummary'){
      return res.status(200).json({ok:true,points:Math.max(0,Number(actor.engagementPoints||0))});
    }
    if(action==='pointsConfigGet'||action==='pointsConfigSave'){
      await requirePermissionForProfile(db,actor,'settings',action==='pointsConfigSave'?'update':'read');
      const organizationId=String(b.organizationId||orgOf(actor)).trim();
      if(!organizationId)throw new Error('Select an organization to configure engagement points.');
      if(!(await actorMayManageOrganization(db,actor,organizationId)))throw new Error('This organization is outside your authorized scope.');
      if(action==='pointsConfigGet'){
        return res.status(200).json({ok:true,organizationId,points:await effectiveEngagementPoints(db,organizationId)});
      }
      const points=normalizeEngagementPoints(b.points);
      await db.doc(engagementPointsConfigPath(organizationId)).set({
        organizationId,points,updatedBy:String(actor.uid),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      await db.collection(`organizations/${organizationId}/audit`).add({
        action:'engagement.points.update',target:engagementPointsConfigPath(organizationId),
        actorUid:String(actor.uid),actorEmail:String(actor.email||''),after:{points},
        timestamp:FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ok:true,organizationId,points});
    }
    if (action.startsWith('portfolio')) {
      await requirePermissionForProfile(db, actor, 'portfolio', action === 'portfolioGet' ? 'read' : 'manage');
      return res.status(200).json({ ok: true, ...(await portfolioAction(db, actor, b)) });
    }
    if (action.startsWith('memory')) {
      await requirePermissionForProfile(db, actor, 'scripture', action === 'memoryReview' ? 'update' : 'read');
      return res.status(200).json({ ok: true, ...(await memoryAction(db, actor, b)) });
    }
    if (action.startsWith('duel')) {
      await requirePermissionForProfile(db, actor, 'duels', action === 'duelCreate' || action === 'duelAnswer' ? 'create' : action==='duelFinish'?'update':'read');
      return res.status(200).json({ ok: true, ...(await duelAction(db, actor, b)) });
    }
    throw new Error('Unsupported engagement action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Engagement request failed.';
    const status = /permission|scope|outside|cannot|authorized|organization|unavailable to you|not accepting challenges|only challenge|not a participant|allocated mentor/i.test(message) ? 403 : /sign in|authentication/i.test(message) ? 401 : 400;
    return res.status(status).json({ error: message });
  }
}
