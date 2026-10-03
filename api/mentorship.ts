import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { organizationInHierarchyScope } from '../server/tenant.js';
import { requirePermissionForProfile, requireOrganizationSubscriptionFeature } from '../server/permissions.js';
import { createNotification } from '../server/notifications.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

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

async function authenticate(req: Request) {
  const authorization = header(req, 'authorization');
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in first.');
  return getAuth(admin()).verifyIdToken(authorization.slice(7).trim());
}

function id(value: unknown) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 150 || result.includes('/')) throw new Error('A valid identifier is required.');
  return result;
}

async function profile(db: FirebaseFirestore.Firestore, uid: string) {
  const snapshot = await db.doc(`users/${uid}`).get();
  if (!snapshot.exists) throw new Error('Account profile was not found.');
  return snapshot.data() || {};
}

function isAdmin(data: Record<string, unknown>) {
  return ['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(data.role || '')) || ['owner','admin'].includes(String(data.organizationRole || ''));
}

function isMentor(data: Record<string, unknown>) {
  return String(data.role || '') === 'mentor' || (data.mentorProfile && typeof data.mentorProfile === 'object' && (data.mentorProfile as Record<string, unknown>).enabled === true);
}

function sameTenant(actor: Record<string, unknown>, target: Record<string, unknown>, requestedOrganizationId = '') {
  const actorOrg = String(actor.organizationId || '').trim();
  const targetOrg = String(target.organizationId || '').trim();
  const role = String(actor.role || '');
  if (role === 'super_admin') return !requestedOrganizationId || targetOrg === requestedOrganizationId;
  if (['union_admin','conference_admin','district_admin','church_admin'].includes(role)) {
    return Boolean(requestedOrganizationId && targetOrg && targetOrg === requestedOrganizationId);
  }
  return Boolean(actorOrg && targetOrg && actorOrg === targetOrg);
}

function sameScope(actor: Record<string, unknown>, student: Record<string, unknown>) {
  const role = String(actor.role || '');
  if (role === 'super_admin') return true;
  if (['union_admin','conference_admin','district_admin','church_admin'].includes(role)) {
    return Boolean(String(student.organizationId || '').trim());
  }
  const node = String(actor.adminNodeId || '');
  if (!node) return true;
  const field = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  return Boolean(node && String(student[field] || '') === node);
}

async function assertOrganizationScope(db: FirebaseFirestore.Firestore, actor: Record<string, unknown>, requestedOrganizationId: string) {
  const actorRole = String(actor.role || '');
  const actorOrganizationId = String(actor.organizationId || '').trim();
  if (actorRole === 'super_admin') return requestedOrganizationId;
  if (['union_admin','conference_admin','district_admin','church_admin'].includes(actorRole)) {
    if (!requestedOrganizationId) throw new Error('Select an organization within your hierarchy scope.');
    const node = await db.doc('users/' + String((actor.uid as string) || '')).get();
    const context = {
      db,
      auth: { uid: String(node.id) } as never,
      profile: actor,
      organizationId: '',
      membership: { role: actorRole, active: true },
      isSuperAdmin: false,
      tenantType: 'hierarchy' as const,
      tenantId: actorRole + ':' + String(actor.adminNodeId || ''),
    };
    if (!(await organizationInHierarchyScope(context, requestedOrganizationId))) throw new Error('The requested organization is outside your hierarchy scope.');
    return requestedOrganizationId;
  }
  if (!actorOrganizationId) throw new Error('Your administrator account is not linked to a tenant organization.');
  if (requestedOrganizationId && requestedOrganizationId !== actorOrganizationId) throw new Error('The requested organization is outside your tenant.');
  return actorOrganizationId;
}

async function assertAdmin(db: FirebaseFirestore.Firestore, uid: string) {
  const actor = await profile(db, uid);
  if (!isAdmin(actor)) throw new Error('Administrator privileges are required.');
  return actor;
}

async function hierarchyOrganizationContext(
  db: FirebaseFirestore.Firestore,
  uid: string,
  actor: Record<string, unknown>,
) {
  const actorRole = String(actor.role || '');
  return {
    db,
    auth: { uid } as never,
    profile: actor,
    organizationId: '',
    membership: { role: actorRole, active: true },
    isSuperAdmin: false,
    tenantType: 'hierarchy' as const,
    tenantId: actorRole + ':' + String(actor.adminNodeId || ''),
  };
}

async function assertParticipant(db: FirebaseFirestore.Firestore, uid: string, conversation: Record<string, unknown>) {
  const actor = await profile(db, uid);
  const actorRole = String(actor.role || '');
  if (actorRole === 'super_admin') return;

  const conversationOrganizationId = String(conversation.organizationId || '').trim();
  if (!conversationOrganizationId) throw new Error('This conversation is missing its organization scope.');

  if (['owner','admin'].includes(String(actor.organizationRole || ''))) {
    const actorOrganizationId = String(actor.organizationId || '').trim();
    if (!actorOrganizationId || actorOrganizationId !== conversationOrganizationId) {
      throw new Error('You cannot access this conversation.');
    }
    return;
  }

  if (['union_admin','conference_admin','district_admin','church_admin'].includes(actorRole)) {
    const context = await hierarchyOrganizationContext(db, uid, actor);
    if (!(await organizationInHierarchyScope(context, conversationOrganizationId))) {
      throw new Error('You cannot access this conversation.');
    }

    const studentId = String(conversation.studentId || '').trim();
    const mentorId = String(conversation.mentorId || '').trim();
    if (!studentId || !mentorId) throw new Error('This conversation is missing a participant.');

    const [student, mentor, assignment] = await Promise.all([
      profile(db, studentId),
      profile(db, mentorId),
      db.doc(`mentorAssignments/${studentId}`).get(),
    ]);
    if (
      String(student.organizationId || '').trim() !== conversationOrganizationId
      || String(mentor.organizationId || '').trim() !== conversationOrganizationId
      || !assignment.exists
      || String(assignment.data()?.mentorId || '') !== mentorId
      || String(assignment.data()?.organizationId || '') !== conversationOrganizationId
      || assignment.data()?.status === 'inactive'
    ) {
      throw new Error('You cannot access this conversation.');
    }
    return;
  }

  if (String(conversation.studentId || '') !== uid && String(conversation.mentorId || '') !== uid) {
    throw new Error('You are not a participant in this conversation.');
  }

  const participant = await profile(db, uid);
  if (String(participant.organizationId || '').trim() !== conversationOrganizationId) {
    throw new Error('You cannot access this conversation.');
  }
}

function iso(value: unknown) {
  const candidate = value as { toDate?: () => Date } | undefined;
  if (candidate?.toDate) return candidate.toDate().toISOString();
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function conversationId(studentId: string, mentorId: string) {
  return `${studentId}__${mentorId}`;
}

function safeReference(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const type = String(item.type || '');
  if (!['guide','lesson','section','topic','doctrine','question','quiz','scripture','block'].includes(type)) return null;
  const referenceId = String(item.id || '').trim();
  const label = String(item.label || '').trim();
  if (!referenceId || !label || referenceId.length > 220 || label.length > 300) return null;
  return { type, id: referenceId, label };
}

function messageReferences(value:unknown){
  return Array.isArray(value)?value.slice(0,8).map(safeReference).filter(Boolean):[];
}

function messagePayload(doc:FirebaseFirestore.QueryDocumentSnapshot){
  const data=doc.data()||{};
  return {
    id:doc.id,
    ...data,
    body:data.deleted===true?'':String(data.body||''),
    references:data.deleted===true?[]:Array.isArray(data.references)?data.references:[],
    createdAt:iso(data.createdAt),
    editedAt:iso(data.editedAt),
    deletedAt:iso(data.deletedAt),
  };
}

function unreadFor(value:unknown){
  return Array.isArray(value)?value.map(item=>String(item||'').trim()).filter(Boolean):[];
}

async function markContainerRead(
  ref:FirebaseFirestore.DocumentReference,
  data:Record<string,unknown>,
  uid:string,
){
  const current=unreadFor(data.unreadFor);
  if(!current.includes(uid))return false;
  await ref.set({
    unreadFor:current.filter(item=>item!==uid),
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  return true;
}

async function supportInitialMessageId(
  requestRef:FirebaseFirestore.DocumentReference,
  requestData:Record<string,unknown>,
){
  const configured=String(requestData.initialMessageId||'').trim();
  if(configured)return configured;
  const first=await requestRef.collection('messages').orderBy('createdAt','asc').limit(1).get();
  return first.docs[0]?.id||'';
}

const SUPPORT_TEAM_ROLES=new Set(['owner','admin']);
const SUPPORT_CATEGORIES=new Set([
  'lesson_clarification','doctrine','bible_question','assessment',
  'prayer','evangelism','baptism','one_voice_27','other',
]);
const SUPPORT_INTERESTS=new Set([
  'none','bible_study','prayer','baptism','church_visit','home_visit','one_voice_27','evangelism',
]);
const SUPPORT_FOLLOW_UP_STATUSES=new Set(['not_required','new','contacted','scheduled','completed']);

function isCandidate(data:Record<string,unknown>){
  const role=String(data.role||'').toLowerCase();
  const organizationRole=String(data.organizationRole||'').toLowerCase();
  return ['student','learner','candidate'].includes(role)||['student','learner','candidate'].includes(organizationRole);
}
function supportTarget(value:unknown){
  const target=String(value||'mentor').trim().toLowerCase();
  return target==='support_team'||target==='both'?target:'mentor';
}
function supportChannel(value:unknown){
  const channel=String(value||'in_app').trim().toLowerCase();
  return channel==='whatsapp'||channel==='both'?channel:'in_app';
}
function supportCategory(value:unknown){
  const category=String(value||'lesson_clarification').trim().toLowerCase();
  return SUPPORT_CATEGORIES.has(category)?category:'other';
}
function supportInterest(value:unknown){
  const interest=String(value||'none').trim().toLowerCase();
  return SUPPORT_INTERESTS.has(interest)?interest:'none';
}
function supportPriority(value:unknown){
  return String(value||'normal').trim().toLowerCase()==='high'?'high':'normal';
}
function supportStatus(value:unknown){
  const status=String(value||'open').trim().toLowerCase();
  return ['open','in_progress','resolved','closed'].includes(status)?status:'open';
}
function supportFollowUpStatus(value:unknown,fallback='not_required'){
  const status=String(value||fallback).trim().toLowerCase();
  return SUPPORT_FOLLOW_UP_STATUSES.has(status)?status:fallback;
}
function supportFollowUpDate(value:unknown){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const date=new Date(raw);
  if(Number.isNaN(date.getTime()))throw new Error('Choose a valid evangelism follow-up date and time.');
  return date.toISOString();
}
function supportCreatedMillis(value:unknown){
  const candidate=value as {toDate?:()=>Date}|undefined;
  if(candidate?.toDate)return candidate.toDate().getTime();
  const parsed=new Date(String(value||'')).getTime();
  return Number.isFinite(parsed)?parsed:0;
}
async function organizationWhatsApp(db:FirebaseFirestore.Firestore,organizationId:string){
  if(!organizationId)return '';
  const settings=await db.doc(`organizations/${organizationId}/settings/settings`).get();
  const data=settings.data()||{};
  const detail=data.detailPages&&typeof data.detailPages==='object'
    ?data.detailPages as Record<string,unknown>:{};
  const numbers=Array.isArray(detail.contactWhatsAppNumbers)
    ?detail.contactWhatsAppNumbers.map(value=>String(value||'').trim()).filter(Boolean):[];
  return String(data.whatsappNumber||numbers[0]||data.contactPhone||'').trim();
}
async function mentorWhatsApp(db:FirebaseFirestore.Firestore,mentorId:string){
  if(!mentorId)return '';
  const snapshot=await db.doc(`users/${mentorId}`).get();
  if(!snapshot.exists)return '';
  const data=snapshot.data()||{};
  return String(data.whatsappNumber||data.phoneNumber||'').trim();
}
async function supportWhatsAppTargets(
  db:FirebaseFirestore.Firestore,
  organizationId:string,
  mentorId:string,
  target:unknown,
){
  const normalized=supportTarget(target);
  const [mentorNumber,organizationNumber]=await Promise.all([
    normalized==='mentor'||normalized==='both'?mentorWhatsApp(db,mentorId):Promise.resolve(''),
    normalized==='support_team'||normalized==='both'?organizationWhatsApp(db,organizationId):Promise.resolve(''),
  ]);
  const items:Array<{kind:'mentor'|'organization';label:string;number:string}>=[];
  if(mentorNumber)items.push({kind:'mentor',label:'Mentor',number:mentorNumber});
  if(organizationNumber&&!items.some(item=>item.number.replace(/\D/g,'')===organizationNumber.replace(/\D/g,'')))
    items.push({kind:'organization',label:'Organization support',number:organizationNumber});
  return items;
}
async function supportTeamRecipients(db:FirebaseFirestore.Firestore,organizationId:string){
  if(!organizationId)return [] as string[];
  const members=await db.collection(`organizations/${organizationId}/members`).where('active','==',true).get();
  return members.docs
    .filter(doc=>SUPPORT_TEAM_ROLES.has(String(doc.data()?.role||'').toLowerCase()))
    .map(doc=>String(doc.data()?.uid||doc.id).trim())
    .filter(Boolean);
}
async function activeMentorFor(db:FirebaseFirestore.Firestore,studentId:string,organizationId:string){
  const assignment=await db.doc(`mentorAssignments/${studentId}`).get();
  if(!assignment.exists||assignment.data()?.status==='inactive')return '';
  if(String(assignment.data()?.organizationId||'')!==organizationId)return '';
  const mentorId=String(assignment.data()?.mentorId||'').trim();
  if(!mentorId)return '';
  const mentor=await db.doc(`users/${mentorId}`).get();
  if(!mentor.exists||String(mentor.data()?.organizationId||'')!==organizationId)return '';
  return mentorId;
}
async function assertSupportRequestAccess(
  db:FirebaseFirestore.Firestore,
  uid:string,
  actor:Record<string,unknown>,
  request:Record<string,unknown>,
){
  const organizationId=String(request.organizationId||'').trim();
  if(!organizationId)throw new Error('This support request is missing its organization scope.');
  if(String(request.candidateId||'')===uid)return;
  if(isAdmin(actor)){
    await assertOrganizationScope(db,{...actor,uid},organizationId);
    return;
  }
  if(isMentor(actor)&&String(request.assignedMentorId||'')===uid
    &&String(actor.organizationId||'')===organizationId)return;
  throw new Error('You are not allowed to access this support request.');
}
function supportRequestPayload(doc:FirebaseFirestore.QueryDocumentSnapshot|FirebaseFirestore.DocumentSnapshot){
  const data=doc.data()||{};
  return {
    id:doc.id,...data,
    createdAt:iso(data.createdAt),
    updatedAt:iso(data.updatedAt),
    lastMessageAt:iso(data.lastMessageAt),
    firstResponseAt:iso(data.firstResponseAt),
    resolvedAt:iso(data.resolvedAt),
  };
}

async function performanceFor(db: FirebaseFirestore.Firestore, studentId: string) {
  const student = await profile(db, studentId);
  const progress = student.progress && typeof student.progress === 'object' ? student.progress as Record<string, unknown> : {};
  const attemptsSnapshot = await db.doc(`users/${studentId}`).collection('assessmentAttempts').orderBy('createdAt', 'desc').limit(100).get();
  const attempts = attemptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const scores = attempts.map(item => Number(item.score)).filter(Number.isFinite);
  const passed = attempts.filter(item => item.passed === true).length;
  const completedLessons = Array.isArray(progress.completedLessons) ? progress.completedLessons.length : 0;
  const progressPercent = Math.max(0, Math.min(100, Number(progress.discoverProgress || 0)));
  const weakMap = new Map<string, { key:string; question:string; failedCount:number; answeredCount:number; lessonId?:string; guideId?:string }>();
  for (const attempt of attempts) {
    const results = Array.isArray(attempt.questionResults) ? attempt.questionResults as Array<Record<string, unknown>> : [];
    for (const result of results) {
      const key = String(result.key || '');
      if (!key) continue;
      const current = weakMap.get(key) || {
        key,
        question: String(result.question || ''),
        failedCount: 0,
        answeredCount: 0,
        lessonId: String(result.lessonId || ''),
        guideId: String(result.guideId || ''),
      };
      current.answeredCount += 1;
      if (result.correct !== true) current.failedCount += 1;
      weakMap.set(key, current);
    }
  }
  const weakQuestions = [...weakMap.values()]
    .sort((a,b) => (b.failedCount / Math.max(1,b.answeredCount)) - (a.failedCount / Math.max(1,a.answeredCount)))
    .slice(0, 10);
  return {
    studentId,
    assessments: attempts.length,
    averageScore: scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : 0,
    passedAssessments: passed,
    failedAssessments: attempts.length - passed,
    completedLessons,
    progressPercent,
    weakQuestions,
    updatedAt: new Date().toISOString(),
  };
}

function draftFor(student: Record<string, unknown>, performance: Awaited<ReturnType<typeof performanceFor>>) {
  const name = String(student.displayName || 'there').split(' ')[0];
  const weakest = performance.weakQuestions[0];
  let subject = 'A quick VOP learning check-in';
  let body = `Hello ${name},\n\nWe noticed your learning progress could use a little support. Your current progress is ${Math.round(performance.progressPercent)}% and your assessment average is ${Math.round(performance.averageScore)}%.\n\nIf you have questions, your mentor is available to help you work through the lessons at your pace.\n\nKeep going — every lesson is a step forward.\n\nVOP Learning Support`;
  if (performance.failedAssessments > 0 && weakest) {
    subject = 'Support with your recent VOP assessment';
    body = `Hello ${name},\n\nYour recent assessment results show that the topic around “${weakest.question}” may need another review. Your mentor can help you revisit the related lesson and discuss any questions.\n\nYou do not need to work through it alone.\n\nVOP Learning Support`;
  } else if (performance.progressPercent < 25) {
    subject = 'Let’s continue your VOP learning journey';
    body = `Hello ${name},\n\nYou have started your VOP learning journey and currently have ${Math.round(performance.progressPercent)}% progress recorded. If you have been away, your mentor can help you make a simple plan for the next lesson.\n\nVOP Learning Support`;
  }
  return { subject, body };
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const decoded = await authenticate(req);
    const db = getFirestore(admin());
    const actor = await profile(db, decoded.uid);
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action || '').trim();
    const permissionAction =
      ['listStudents','listMentors','listAssignments','getAutomationSettings','listSupportRequests'].includes(action) ? 'view' :
      ['assign','saveAutomationSettings','createDraft','sendDraft'].includes(action) ? 'manage' :
      action === 'updateSupportRequest' ? 'update' :
      ['sendMessage','createSupportRequest','replySupportRequest','editMessage','deleteMessage','editSupportMessage','deleteSupportMessage'].includes(action) ? 'create' :
      ['performance','questionFailures','listConversations','listMyConversations','listMyAssignments','messages','listMySupportRequests','supportRequestMessages','markConversationRead','markSupportRequestRead'].includes(action) ? 'read' : '';
    if (permissionAction) await requirePermissionForProfile(db, actor as Record<string, unknown>, 'mentoring', permissionAction);
    let organizationId = String(body.organizationId || actor.organizationId || '').trim();
    if (isAdmin(actor)) organizationId = await assertOrganizationScope(db, { ...actor, uid: decoded.uid }, organizationId);
    if(permissionAction&&!['view','read'].includes(permissionAction)&&organizationId&&String(actor.role||'')!=='super_admin'){
      await requireOrganizationSubscriptionFeature(db,'mentorship',organizationId);
    }

    if (['listStudents','listMentors','listAssignments','questionFailures','createDraft','sendDraft','getAutomationSettings','saveAutomationSettings'].includes(action)) {
      await assertAdmin(db, decoded.uid);
    }

    if (action === 'listStudents') {
      const snapshot = organizationId ? await db.collection('users').where('organizationId','==',organizationId).get() : await db.collection('users').get();
      const students = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })).filter(item => String(item.role || 'student') === 'student' && sameTenant(actor, item, organizationId) && sameScope(actor, item));
      return res.status(200).json({ ok: true, items: students });
    }

    if (action === 'listMentors') {
      const snapshot = organizationId ? await db.collection('users').where('organizationId','==',organizationId).get() : await db.collection('users').get();
      const mentors = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })).filter(item => isMentor(item) && sameTenant(actor, item, organizationId));
      return res.status(200).json({ ok: true, items: mentors });
    }

    if (action === 'listMyAssignments') {
      if (!isMentor(actor)) throw new Error('This workspace is available to configured mentors.');
      organizationId = String(actor.organizationId || '').trim();
      if (!organizationId) throw new Error('Your mentor account is not linked to an organization.');
      const snapshot = await db.collection('mentorAssignments').where('mentorId','==',decoded.uid).get();
      const active = snapshot.docs.filter(doc =>
        String(doc.data()?.organizationId || '') === organizationId
        && doc.data()?.status !== 'inactive'
      );
      const studentSnapshots = await Promise.all(active.map(doc =>
        db.doc('users/' + String(doc.data()?.studentId || doc.id)).get()));
      const students = new Map(studentSnapshots.filter(item=>item.exists
        && String(item.data()?.organizationId || '') === organizationId)
        .map(item=>[item.id,item.data()||{}]));
      const items = active.filter(doc=>students.has(String(doc.data()?.studentId || doc.id))).map(doc=>{
        const data=doc.data()||{};
        const studentId=String(data.studentId||doc.id);
        const student=students.get(studentId)||{};
        return {
          id:doc.id,studentId,mentorId:decoded.uid,
          status:String(data.status||'active'),
          assignedAt:iso(data.assignedAt),
          notes:String(data.notes||''),
          student:{
            uid:studentId,
            displayName:String(student.displayName||student.email||'Learner'),
            email:String(student.email||''),
            photoURL:String(student.photoURL||''),
          },
        };
      });
      return res.status(200).json({ok:true,items});
    }

    if (action === 'listAssignments') {
      const snapshot = await db.collection('mentorAssignments').get();
      const studentSnapshots = await Promise.all(snapshot.docs.map(doc => db.doc(`users/${String(doc.data()?.studentId || '')}`).get()));
      const allowedStudents = new Map(studentSnapshots.filter(item => item.exists && sameTenant(actor, item.data() || {}, organizationId) && sameScope(actor, item.data() || {})).map(item => [item.id, item.data() || {}]));
      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => {
          const student = allowedStudents.get(String(item.studentId || ''));
          return Boolean(student)
            && String(item.organizationId || '') === String(student?.organizationId || '')
            && String(item.organizationId || '') === organizationId;
        });
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'assign') {
      await assertAdmin(db, decoded.uid);
      const studentId = id(body.studentId);
      const mentorId = id(body.mentorId);
      const student = await profile(db, studentId);
      const mentor = await profile(db, mentorId);
      if (!sameTenant(actor, student, organizationId) || !sameTenant(actor, mentor, organizationId)) throw new Error('The selected accounts are outside your organization.');
      if (String(student.role || 'student') !== 'student') throw new Error('The selected account is not a learner.');
      if (!isMentor(mentor)) throw new Error('The selected account is not configured as a mentor.');
      if (!sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const ref = db.doc(`mentorAssignments/${studentId}`);
      await ref.set({
        organizationId: String(student.organizationId || organizationId),
        studentId,
        mentorId,
        status: 'active',
        assignedAt: FieldValue.serverTimestamp(),
        assignedBy: decoded.uid,
        notes: typeof body.notes === 'string' ? body.notes.trim() : '',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await db.doc(`users/${studentId}`).set({ mentorId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const assignmentOrganization=String(student.organizationId||organizationId);
      await Promise.all([
        createNotification(db,{
          organizationId:assignmentOrganization,recipientId:studentId,type:'assignment',
          title:'Mentor assigned',body:`${String(mentor.displayName||mentor.email||'Your mentor')} has been assigned to support your VOP learning.`,
          actionUrl:'/support',metadata:{source:'mentor-assignment',mentorId},createdBy:decoded.uid,
        }),
        createNotification(db,{
          organizationId:assignmentOrganization,recipientId:mentorId,type:'assignment',
          title:'Learner assigned',body:`${String(student.displayName||student.email||'A learner')} has been assigned to your mentoring workspace.`,
          actionUrl:'/mentor',metadata:{source:'mentor-assignment',studentId},createdBy:decoded.uid,
        }),
      ]);
      return res.status(200).json({ ok: true, item: { id: studentId, studentId, mentorId, status: 'active' } });
    }

    if (action === 'performance') {
      const studentId = id(body.studentId);
      const student = await profile(db, studentId);
      if (!sameTenant(actor, student, organizationId)) return res.status(403).json({ error: 'You cannot access this learner.' });
      if (isAdmin(actor) && !sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      if (!isAdmin(actor)) {
        const assignment = await db.doc(`mentorAssignments/${studentId}`).get();
        if (!assignment.exists || String(assignment.data()?.mentorId || '') !== decoded.uid) throw new Error('Mentor access to this learner is not configured.');
      }
      return res.status(200).json({ ok: true, item: await performanceFor(db, studentId) });
    }

    if (action === 'questionFailures') {
      const base = organizationId ? db.collection('questionPerformance').where('organizationId','==',organizationId).orderBy('failedCount','desc').limit(50) : db.collection('questionPerformance').orderBy('failedCount','desc').limit(50);
      const snapshot = await base.get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'listConversations') {
      const requestedStudent = body.studentId ? id(body.studentId) : '';
      const requestedMentor = body.mentorId ? id(body.mentorId) : '';
      if (isAdmin(actor)) {
        let snapshot = await db.collection('mentorConversations').get();
        let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => !organizationId || String(item.organizationId || '') === organizationId);
        const studentSnapshots = await Promise.all(items.map(item => db.doc(`users/${String(item.studentId || '')}`).get()));
        const allowedStudentIds = new Set(studentSnapshots.filter(item => item.exists && sameTenant(actor, item.data() || {}, organizationId) && sameScope(actor, item.data() || {})).map(item => item.id));
        items = items.filter(item => allowedStudentIds.has(String(item.studentId || '')));
        if (requestedStudent) items = items.filter(item => String(item.studentId || '') === requestedStudent);
        if (requestedMentor) items = items.filter(item => String(item.mentorId || '') === requestedMentor);
        return res.status(200).json({ ok: true, items });
      }
      organizationId = String(actor.organizationId || '').trim();
      if (!organizationId) throw new Error('Your mentor account is not linked to a tenant organization.');
      if (requestedMentor && requestedMentor !== decoded.uid) throw new Error('You can only access your own mentor conversations.');
      const assignment = await db.collection('mentorAssignments').where('mentorId','==',decoded.uid).get();
      const assignedStudents = new Set(
        assignment.docs
          .filter(doc => String(doc.data()?.organizationId || '') === organizationId && doc.data()?.status !== 'inactive')
          .map(doc => String(doc.data().studentId || ''))
      );
      if (requestedStudent && !assignedStudents.has(requestedStudent)) throw new Error('This learner is not assigned to you.');
      const snapshot = await db.collection('mentorConversations').where('mentorId','==',decoded.uid).get();
      const scopedConversationDocs = snapshot.docs.filter(doc =>
        String(doc.data()?.organizationId || '') === organizationId
        && assignedStudents.has(String(doc.data()?.studentId || ''))
      );
      const items = requestedStudent
        ? scopedConversationDocs.filter(doc => String(doc.data()?.studentId || '') === requestedStudent)
        : scopedConversationDocs;
      return res.status(200).json({ ok: true, items: items.map(doc => {
        const data=doc.data()||{};
        return {id:doc.id,...data,lastMessageAt:iso(data.lastMessageAt),unread:unreadFor(data.unreadFor).includes(decoded.uid)};
      }) });
    }

    if (action === 'listMyConversations') {
      const studentId = decoded.uid;
      const assignment = await db.doc(`mentorAssignments/${studentId}`).get();
      if (!assignment.exists) return res.status(200).json({ ok: true, items: [] });
      const mentorId = String(assignment.data()?.mentorId || '');
      const assignmentOrganizationId = String(assignment.data()?.organizationId || '').trim();
      const student = await profile(db, studentId);
      if (!assignmentOrganizationId || !String(student.organizationId || '').trim() || assignmentOrganizationId !== String(student.organizationId || '').trim()) {
        return res.status(200).json({ ok: true, items: [] });
      }
      const mentor = await profile(db, mentorId);
      if (!sameTenant(student, mentor, assignmentOrganizationId)) {
        return res.status(200).json({ ok: true, items: [] });
      }
      const ref = db.doc(`mentorConversations/${conversationId(studentId, mentorId)}`);
      const snapshot = await ref.get();
      const item = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : { id: ref.id, studentId, mentorId, status: 'open' };
      const itemData=item as Record<string,unknown>;
      return res.status(200).json({ ok: true, items: [{
        ...item,
        lastMessageAt:iso(itemData.lastMessageAt),
        unread:unreadFor(itemData.unreadFor).includes(decoded.uid),
        mentorName: String(mentor.displayName || mentor.email || mentorId),
        mentorPhotoURL: String(mentor.photoURL || ''),
      }] });
    }

    if (action === 'messages') {
      const conversation = await db.doc(`mentorConversations/${id(body.conversationId)}`).get();
      if (!conversation.exists) return res.status(200).json({ ok: true, items: [], unread:false });
      const data = conversation.data() || {};
      await assertParticipant(db, decoded.uid, data);
      const messages = await conversation.ref.collection('messages').orderBy('createdAt','asc').limit(200).get();
      const wasUnread=unreadFor(data.unreadFor).includes(decoded.uid);
      if(wasUnread)await markContainerRead(conversation.ref,data,decoded.uid);
      return res.status(200).json({ ok: true, unread:false, items: messages.docs.map(messagePayload) });
    }

    if(action==='markConversationRead'){
      const conversation=await db.doc(`mentorConversations/${id(body.conversationId)}`).get();
      if(!conversation.exists)return res.status(200).json({ok:true,updated:false});
      const data=conversation.data()||{};
      await assertParticipant(db,decoded.uid,data);
      const updated=await markContainerRead(conversation.ref,data,decoded.uid);
      return res.status(200).json({ok:true,updated});
    }

    if (action === 'sendMessage') {
      const studentId = id(body.studentId);
      const mentorId = id(body.mentorId);
      const student = await profile(db, studentId);
      const mentor = await profile(db, mentorId);
      if (!sameTenant(actor, student, organizationId) || !sameTenant(actor, mentor, organizationId)) return res.status(403).json({ error: 'You cannot access this learner.' });
      if (isAdmin(actor) && !sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const message = String(body.message || '').trim();
      if (!message || message.length > 10000) throw new Error('A message is required.');
      const ref = db.doc(`mentorConversations/${conversationId(studentId, mentorId)}`);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() || {} : { studentId, mentorId, status: 'open' };
      if (String(decoded.uid) !== studentId && String(decoded.uid) !== mentorId && !isAdmin(actor)) throw new Error('You are not allowed to send to this conversation.');
      const assignment = await db.doc(`mentorAssignments/${studentId}`).get();
      if (
        !assignment.exists
        || String(assignment.data()?.mentorId || '') !== mentorId
        || String(assignment.data()?.organizationId || '') !== String(student.organizationId || '')
        || assignment.data()?.status === 'inactive'
      ) throw new Error('This learner is not assigned to this mentor.');
      if (String(decoded.uid) === studentId && mentorId !== String(assignment.data()?.mentorId || '')) {
        throw new Error('You can only message your assigned mentor.');
      }
      const references = messageReferences(body.references);
      const recipientId=String(decoded.uid)===studentId?mentorId:studentId;
      const nextUnread=[...new Set([
        ...unreadFor(current.unreadFor).filter(uid=>uid!==decoded.uid),
        recipientId,
      ])];
      await ref.set({
        ...current,
        organizationId: String(student.organizationId || organizationId),
        studentId,
        mentorId,
        status: 'open',
        lastMessageAt: FieldValue.serverTimestamp(),
        lastMessageSenderId:decoded.uid,
        unreadFor:nextUnread,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const messageRef = ref.collection('messages').doc();
      await messageRef.set({
        senderId: decoded.uid,
        recipientId,
        body: message,
        references,
        createdAt: FieldValue.serverTimestamp(),
      });
      const senderName=String(actor.displayName||actor.email||'VOP member');
      await createNotification(db,{
        organizationId:String(student.organizationId||organizationId),recipientId,type:'mentor-feedback',
        title:'New mentoring message',body:`${senderName}: ${message.slice(0,240)}`,
        actionUrl:recipientId===mentorId?'/mentor':'/support',
        metadata:{source:'mentor-message',conversationId:ref.id,studentId,mentorId,messageId:messageRef.id},
        createdBy:decoded.uid,
      });
      return res.status(200).json({ ok: true, item: { id: messageRef.id, senderId: decoded.uid, recipientId, body: message, references, createdAt:new Date().toISOString(), editedAt:'', deleted:false } });
    }

    if(action==='editMessage'||action==='deleteMessage'){
      const conversationIdValue=id(body.conversationId);
      const messageId=id(body.messageId);
      const conversation=await db.doc(`mentorConversations/${conversationIdValue}`).get();
      if(!conversation.exists)throw new Error('Conversation was not found.');
      const conversationData=conversation.data()||{};
      await assertParticipant(db,decoded.uid,conversationData);
      const messageRef=conversation.ref.collection('messages').doc(messageId);
      const message=await messageRef.get();
      if(!message.exists)throw new Error('Message was not found.');
      const data=message.data()||{};
      if(String(data.senderId||'')!==decoded.uid)throw new Error('You can only change messages you sent.');
      if(data.deleted===true)throw new Error('This message has already been deleted.');
      if(action==='deleteMessage'){
        await messageRef.set({
          body:'',references:[],deleted:true,deletedAt:FieldValue.serverTimestamp(),deletedBy:decoded.uid,
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        return res.status(200).json({ok:true,item:{id:messageId,senderId:decoded.uid,body:'',references:[],deleted:true,deletedAt:new Date().toISOString()}});
      }
      const nextBody=String(body.message||'').trim();
      if(!nextBody||nextBody.length>10000)throw new Error('A message is required.');
      const references=messageReferences(body.references);
      await messageRef.set({
        body:nextBody,references,editedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return res.status(200).json({ok:true,item:{
        id:messageId,senderId:decoded.uid,body:nextBody,references,editedAt:new Date().toISOString(),deleted:false,
      }});
    }

    if (action === 'createSupportRequest') {
      if(!isCandidate(actor))throw new Error('Only a learner or candidate can open a learning support request.');
      const candidateId=decoded.uid;
      const candidateOrganizationId=String(actor.organizationId||'').trim();
      if(!candidateOrganizationId)throw new Error('Your account is not linked to an organization.');
      const message=String(body.message||'').trim();
      if(message.length<3||message.length>10000)throw new Error('Describe the question or support need in 3 to 10,000 characters.');
      const subject=String(body.subject||'').trim().slice(0,180)
        ||(supportCategory(body.category)==='doctrine'?'Doctrine question':'Learning support request');
      const target=supportTarget(body.target);
      const channel=supportChannel(body.channel);
      const category=supportCategory(body.category);
      const spiritualInterest=supportInterest(body.spiritualInterest);
      const priority=supportPriority(body.priority);
      const references=messageReferences(body.references);
      const assignedMentorId=(target==='mentor'||target==='both')
        ?await activeMentorFor(db,candidateId,candidateOrganizationId):'';
      if(target==='mentor'&&!assignedMentorId){
        throw new Error('No active mentor is assigned yet. Choose Organization support team or ask your administrator to assign a mentor.');
      }
      const teamRecipients=(target==='support_team'||target==='both')
        ?await supportTeamRecipients(db,candidateOrganizationId):[];
      if(target==='support_team'&&!teamRecipients.length){
        throw new Error('The organization support team is not configured yet.');
      }
      const recipients=[...new Set([
        ...(assignedMentorId?[assignedMentorId]:[]),
        ...teamRecipients,
      ])].filter(uid=>uid!==candidateId);
      if(!recipients.length)throw new Error('No support recipient is currently available for this request.');

      const requestRef=db.collection('learningSupportRequests').doc();
      const messageRef=requestRef.collection('messages').doc();
      const createdAt=FieldValue.serverTimestamp();
      const campaignTag=spiritualInterest==='one_voice_27'||category==='one_voice_27'?'one_voice_27':'';
      const followUpStatus=spiritualInterest==='none'?'not_required':'new';
      await requestRef.set({
        organizationId:candidateOrganizationId,candidateId,
        candidateName:String(actor.displayName||actor.email||'Learner'),
        candidateEmail:String(actor.email||decoded.email||''),
        subject,message,category,priority,target,channel,spiritualInterest,campaignTag,
        followUpStatus,followUpScheduledAt:null,followUpCompletedAt:null,followUpUpdatedAt:createdAt,
        references,assignedMentorId,recipientIds:recipients,status:'open',
        initialMessageId:messageRef.id,unreadFor:recipients,
        createdAt,updatedAt:createdAt,lastMessageAt:createdAt,lastMessageSenderId:candidateId,
        createdBy:candidateId,firstResponseAt:null,resolvedAt:null,
      });
      await messageRef.set({
        senderId:candidateId,senderRole:'candidate',body:message,references,
        createdAt:FieldValue.serverTimestamp(),
      });
      await Promise.all(recipients.map(recipientId=>createNotification(db,{
        organizationId:candidateOrganizationId,recipientId,type:'learning-support',
        title:priority==='high'?'High-priority learning support request':subject,
        body:`${String(actor.displayName||actor.email||'A learner')} asked for help: ${message.slice(0,240)}`,
        actionUrl:recipientId===assignedMentorId?'/mentor':'/admin/mentorship',
        metadata:{
          source:'candidate-support-request',requestId:requestRef.id,candidateId,
          category,target,channel,spiritualInterest,campaignTag,
        },
        createdBy:candidateId,
      })));
      const whatsappTargets=(channel==='whatsapp'||channel==='both')
        ?await supportWhatsAppTargets(db,candidateOrganizationId,assignedMentorId,target):[];
      return res.status(201).json({
        ok:true,
        item:{
          id:requestRef.id,organizationId:candidateOrganizationId,candidateId,subject,message,category,
          priority,target,channel,spiritualInterest,campaignTag,followUpStatus,references,assignedMentorId,status:'open',
          whatsappTargets,
          whatsappText:`VOP Support #${requestRef.id}\n${subject}\n${message}`,
        },
      });
    }

    if (action === 'listMySupportRequests') {
      if(!isCandidate(actor))throw new Error('Only a learner or candidate can view personal support requests.');
      const snapshot=await db.collection('learningSupportRequests').where('candidateId','==',decoded.uid).limit(100).get();
      const items=snapshot.docs
        .map(doc=>supportRequestPayload(doc))
        .sort((a,b)=>supportCreatedMillis((b as Record<string,unknown>).createdAt)-supportCreatedMillis((a as Record<string,unknown>).createdAt));
      return res.status(200).json({ok:true,items});
    }

    if (action === 'listSupportRequests') {
      let items:Record<string,unknown>[]=[];
      if(isAdmin(actor)){
        const snapshot=await db.collection('learningSupportRequests').limit(300).get();
        const allowed:Record<string,unknown>[]=[];
        for(const doc of snapshot.docs){
          const data=doc.data()||{};
          const requestOrganizationId=String(data.organizationId||'').trim();
          if(!requestOrganizationId)continue;
          try{
            await assertOrganizationScope(db,{...actor,uid:decoded.uid},requestOrganizationId);
            if(organizationId&&requestOrganizationId!==organizationId)continue;
            allowed.push(supportRequestPayload(doc));
          }catch{/* outside administrator scope */}
        }
        items=allowed;
      }else if(isMentor(actor)){
        const mentorOrganizationId=String(actor.organizationId||'').trim();
        if(!mentorOrganizationId)throw new Error('Your mentor account is not linked to an organization.');
        const snapshot=await db.collection('learningSupportRequests').where('assignedMentorId','==',decoded.uid).get();
        items=snapshot.docs
          .filter(doc=>String(doc.data()?.organizationId||'')===mentorOrganizationId)
          .map(doc=>supportRequestPayload(doc));
      }else{
        throw new Error('Administrator or mentor access is required to view the support queue.');
      }
      items=items
        .sort((a,b)=>supportCreatedMillis(b.lastMessageAt||b.createdAt)-supportCreatedMillis(a.lastMessageAt||a.createdAt));
      return res.status(200).json({ok:true,items});
    }

    if (action === 'supportRequestMessages') {
      const requestId=id(body.requestId);
      const request=await db.doc(`learningSupportRequests/${requestId}`).get();
      if(!request.exists)return res.status(200).json({ok:true,items:[]});
      await assertSupportRequestAccess(db,decoded.uid,actor,request.data()||{});
      const messages=await request.ref.collection('messages').orderBy('createdAt','asc').limit(200).get();
      const requestData=request.data()||{};
      const wasUnread=unreadFor(requestData.unreadFor).includes(decoded.uid);
      if(wasUnread)await markContainerRead(request.ref,requestData,decoded.uid);
      const whatsappTargets=await supportWhatsAppTargets(
        db,
        String(requestData.organizationId||''),
        String(requestData.assignedMentorId||''),
        requestData.target,
      );
      return res.status(200).json({ok:true,unread:false,whatsappTargets,items:messages.docs.map(messagePayload)});
    }

    if (action === 'replySupportRequest') {
      const requestId=id(body.requestId);
      const requestRef=db.doc(`learningSupportRequests/${requestId}`);
      const request=await requestRef.get();
      if(!request.exists)throw new Error('Support request was not found.');
      const requestData=request.data()||{};
      await assertSupportRequestAccess(db,decoded.uid,actor,requestData);
      const message=String(body.message||'').trim();
      if(!message||message.length>10000)throw new Error('A support reply is required.');
      const references=Array.isArray(body.references)
        ?body.references.slice(0,8).map(safeReference).filter(Boolean):[];
      const candidateId=String(requestData.candidateId||'');
      const senderIsCandidate=decoded.uid===candidateId;
      const messageRef=requestRef.collection('messages').doc();
      await messageRef.set({
        senderId:decoded.uid,
        senderRole:senderIsCandidate?'candidate':isMentor(actor)?'mentor':'support_team',
        body:message,references,createdAt:FieldValue.serverTimestamp(),
      });
      const recipients=senderIsCandidate
        ?[...new Set((Array.isArray(requestData.recipientIds)?requestData.recipientIds:[])
          .map(value=>String(value||'')).filter(Boolean))]
        :[candidateId];
      const update:Record<string,unknown>={
        updatedAt:FieldValue.serverTimestamp(),lastMessageAt:FieldValue.serverTimestamp(),
        lastMessageSenderId:decoded.uid,
        unreadFor:[...new Set([
          ...unreadFor(requestData.unreadFor).filter(uid=>uid!==decoded.uid),
          ...recipients.filter(uid=>uid&&uid!==decoded.uid),
        ])],
        status:senderIsCandidate&&String(requestData.status||'')==='resolved'?'open':'in_progress',
      };
      if(!senderIsCandidate&&!requestData.firstResponseAt)update.firstResponseAt=FieldValue.serverTimestamp();
      if(senderIsCandidate)update.resolvedAt=null;
      await requestRef.set(update,{merge:true});
      await Promise.all(recipients.filter(uid=>uid&&uid!==decoded.uid).map(recipientId=>createNotification(db,{
        organizationId:String(requestData.organizationId||''),recipientId,type:'learning-support',
        title:senderIsCandidate?'Learner replied to support request':'New support reply',
        body:message.slice(0,300),actionUrl:recipientId===candidateId?'/support':recipientId===String(requestData.assignedMentorId||'')?'/mentor':'/admin/mentorship',
        metadata:{source:'candidate-support-reply',requestId,messageId:messageRef.id},
        createdBy:decoded.uid,
      })));
      return res.status(200).json({ok:true,item:{
        id:messageRef.id,senderId:decoded.uid,body:message,references,createdAt:new Date().toISOString(),editedAt:'',deleted:false,
      }});
    }

    if(action==='markSupportRequestRead'){
      const requestId=id(body.requestId);
      const request=await db.doc(`learningSupportRequests/${requestId}`).get();
      if(!request.exists)return res.status(200).json({ok:true,updated:false});
      const data=request.data()||{};
      await assertSupportRequestAccess(db,decoded.uid,actor,data);
      const updated=await markContainerRead(request.ref,data,decoded.uid);
      return res.status(200).json({ok:true,updated});
    }

    if(action==='editSupportMessage'||action==='deleteSupportMessage'){
      const requestId=id(body.requestId);
      const messageId=id(body.messageId);
      const requestRef=db.doc(`learningSupportRequests/${requestId}`);
      const request=await requestRef.get();
      if(!request.exists)throw new Error('Support request was not found.');
      const requestData=request.data()||{};
      await assertSupportRequestAccess(db,decoded.uid,actor,requestData);
      const messageRef=requestRef.collection('messages').doc(messageId);
      const message=await messageRef.get();
      if(!message.exists)throw new Error('Message was not found.');
      const data=message.data()||{};
      if(String(data.senderId||'')!==decoded.uid)throw new Error('You can only change messages you sent.');
      if(data.deleted===true)throw new Error('This message has already been deleted.');
      const initialId=await supportInitialMessageId(requestRef,requestData);
      if(action==='deleteSupportMessage'){
        const batch=db.batch();
        batch.set(messageRef,{
          body:'',references:[],deleted:true,deletedAt:FieldValue.serverTimestamp(),deletedBy:decoded.uid,
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        if(messageId===initialId)batch.set(requestRef,{message:'',updatedAt:FieldValue.serverTimestamp()},{merge:true});
        await batch.commit();
        return res.status(200).json({ok:true,item:{id:messageId,senderId:decoded.uid,body:'',references:[],deleted:true,deletedAt:new Date().toISOString()}});
      }
      const nextBody=String(body.message||'').trim();
      if(!nextBody||nextBody.length>10000)throw new Error('A support reply is required.');
      const references=messageReferences(body.references);
      const batch=db.batch();
      batch.set(messageRef,{
        body:nextBody,references,editedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      if(messageId===initialId)batch.set(requestRef,{message:nextBody,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await batch.commit();
      return res.status(200).json({ok:true,item:{
        id:messageId,senderId:decoded.uid,body:nextBody,references,editedAt:new Date().toISOString(),deleted:false,
      }});
    }

    if (action === 'updateSupportRequest') {
      const requestId=id(body.requestId);
      const requestRef=db.doc(`learningSupportRequests/${requestId}`);
      const request=await requestRef.get();
      if(!request.exists)throw new Error('Support request was not found.');
      const requestData=request.data()||{};
      await assertSupportRequestAccess(db,decoded.uid,actor,requestData);
      const nextStatus=supportStatus(body.status??requestData.status);
      const nextPriority=supportPriority(body.priority??requestData.priority);
      const currentFollowUp=String(requestData.spiritualInterest||'none')==='none'?'not_required'
        :supportFollowUpStatus(requestData.followUpStatus,'new');
      const nextFollowUp=body.followUpStatus===undefined
        ?currentFollowUp:supportFollowUpStatus(body.followUpStatus,currentFollowUp);
      const scheduledAt=body.followUpScheduledAt===undefined
        ?String(requestData.followUpScheduledAt||'')
        :supportFollowUpDate(body.followUpScheduledAt);
      if(nextFollowUp==='scheduled'&&!scheduledAt)throw new Error('Choose a date and time before scheduling evangelism follow-up.');
      const update:Record<string,unknown>={
        status:nextStatus,priority:nextPriority,followUpStatus:nextFollowUp,
        followUpScheduledAt:nextFollowUp==='scheduled'?scheduledAt:null,
        followUpCompletedAt:nextFollowUp==='completed'?FieldValue.serverTimestamp():null,
        followUpUpdatedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),updatedBy:decoded.uid,
      };
      if(['resolved','closed'].includes(nextStatus))update.resolvedAt=FieldValue.serverTimestamp();
      else update.resolvedAt=null;
      await requestRef.set(update,{merge:true});
      const candidateId=String(requestData.candidateId||'');
      const followUpChanged=nextFollowUp!==currentFollowUp
        ||(nextFollowUp==='scheduled'&&scheduledAt!==String(requestData.followUpScheduledAt||''));
      if(candidateId)await createNotification(db,{
        organizationId:String(requestData.organizationId||''),recipientId:candidateId,type:'learning-support',
        title:followUpChanged
          ?nextFollowUp==='scheduled'?'Evangelism follow-up scheduled':'Evangelism follow-up updated'
          :nextStatus==='resolved'?'Your support request was resolved':'Support request updated',
        body:followUpChanged
          ?nextFollowUp==='scheduled'
            ?`Your requested follow-up has been scheduled for ${new Date(scheduledAt).toLocaleString('en-US',{timeZone:'UTC'})} UTC.`
            :`Your requested follow-up is now ${nextFollowUp.replace('_',' ')}.`
          :nextStatus==='resolved'
            ?'Your VOP support request has been marked resolved. You can reopen it by replying if you still need help.'
            :`Your support request status is now ${nextStatus.replace('_',' ')}.`,
        actionUrl:'/support',metadata:{source:'candidate-support-status',requestId,status:nextStatus,followUpStatus:nextFollowUp},
        createdBy:decoded.uid,
      });
      return res.status(200).json({ok:true,item:{
        id:requestId,status:nextStatus,priority:nextPriority,followUpStatus:nextFollowUp,
        followUpScheduledAt:nextFollowUp==='scheduled'?scheduledAt:'',
      }});
    }

    if (action === 'getAutomationSettings') {
      if (!isAdmin(actor)) throw new Error('Only organization administrators can access mentorship automation settings.');
      if (!organizationId && String(actor.role || '') !== 'super_admin') throw new Error('A tenant organization is required.');
      const snapshot = await db.doc(organizationId ? `organizations/${organizationId}/settings/mentorship` : 'system/mentorship').get();
      return res.status(200).json({ ok: true, item: snapshot.exists ? snapshot.data() : {
        enabled: false,
        channel: 'in_app',
        minAverageScore: 0,
        maxProgressPercent: 0,
        cooldownDays: 7,
      }});
    }

    if (action === 'saveAutomationSettings') {
      if (!isAdmin(actor)) throw new Error('Only organization administrators can change mentorship automation settings.');
      if (!organizationId && String(actor.role || '') !== 'super_admin') throw new Error('A tenant organization is required.');
      const minAverageScore = Math.max(0, Math.min(100, Number(body.minAverageScore || 0)));
      const maxProgressPercent = Math.max(0, Math.min(100, Number(body.maxProgressPercent || 0)));
      const cooldownDays = Math.max(1, Math.min(90, Number(body.cooldownDays || 7)));
      const channel = body.channel === 'email' ? 'email' : 'in_app';
      await db.doc(organizationId ? `organizations/${organizationId}/settings/mentorship` : 'system/mentorship').set({
        enabled: body.enabled === true,
        channel,
        minAverageScore,
        maxProgressPercent,
        cooldownDays,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: decoded.uid,
      }, { merge: true });
      return res.status(200).json({ ok: true, item: { enabled: body.enabled === true, channel, minAverageScore, maxProgressPercent, cooldownDays } });
    }

    if (action === 'createDraft') {
      const studentId = id(body.studentId);
      const student = await profile(db, studentId);
      if (!sameTenant(actor, student, organizationId)) return res.status(403).json({ error: 'You cannot access this learner.' });
      if (!sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const performance = await performanceFor(db, studentId);
      const draft = draftFor(student, performance);
      const ref = db.collection('notificationDrafts').doc();
      await ref.set({
        organizationId: String(student.organizationId || organizationId),
        studentId,
        type: 'performance-support',
        channel: body.channel === 'email' ? 'email' : 'in_app',
        subject: draft.subject,
        body: draft.body,
        status: 'draft',
        performanceSnapshot: performance,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: decoded.uid,
      });
      return res.status(200).json({ ok: true, item: { id: ref.id, studentId, ...draft, channel: body.channel === 'email' ? 'email' : 'in_app', status: 'draft' } });
    }

    if (action === 'sendDraft') {
      const draftId = id(body.draftId);
      const draftRef = db.doc(`notificationDrafts/${draftId}`);
      const draftSnapshot = await draftRef.get();
      if (!draftSnapshot.exists) throw new Error('Message draft was not found.');
      const draft = draftSnapshot.data() || {};
      const draftOrganizationId = String(draft.organizationId || '').trim();
      if (!draftOrganizationId) throw new Error('The message draft is missing its organization.');
      if (draftOrganizationId !== organizationId) throw new Error('This draft belongs to another organization.');
      const student = await profile(db, String(draft.studentId || ''));
      if (!sameTenant(actor, student, organizationId)) return res.status(403).json({ error: 'You cannot access this learner.' });
      if (!sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const channel = String(draft.channel || 'in_app');
      let delivery = 'in_app';
      if (channel === 'email') {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.RESEND_FROM_EMAIL;
        const to = String(student.email || '');
        if (!apiKey || !from) throw new Error('Email delivery is not configured.');
        if (!to) throw new Error('The learner has no email address.');
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: [to], subject: String(draft.subject || ''), html: String(draft.body || '').replace(/\\n/g, '<br/>') }),
        });
        if (!emailResponse.ok) throw new Error('Email delivery failed.');
        delivery = 'email';
      } else {
        await createNotification(db,{
          organizationId:String(draft.organizationId||organizationId),
          recipientId:String(draft.studentId||''),
          title:String(draft.subject||'Learning support'),
          body:String(draft.body||''),
          type:'learning-support',
          actionUrl:'/support',
          metadata:{source:'mentorship-draft',draftId},
          createdBy:decoded.uid,
        });
      }
      await draftRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp(), delivery }, { merge: true });
      return res.status(200).json({ ok: true, delivery });
    }

    return res.status(400).json({ error: 'Unsupported mentorship action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mentorship operation failed.';
    if (message.includes('Sign in') || message.includes('Administrator privileges') || message.includes('not allowed') || message.includes('not configured') || message.includes('not assigned') || message.includes('not found') || message.includes('cannot manage') || message.includes('outside your tenant') || message.includes('outside your hierarchy') || message.includes('subscription')) return res.status(403).json({ error: message });
    console.error('VOP mentorship operation failed', error);
    return res.status(500).json({ error: message });
  }
}
