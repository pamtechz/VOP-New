import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { organizationInHierarchyScope } from '../server/tenant.js';
import { requirePermissionForProfile } from '../server/permissions.js';

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
  if (!['guide','lesson','section','topic','block'].includes(type)) return null;
  const referenceId = String(item.id || '').trim();
  const label = String(item.label || '').trim();
  if (!referenceId || !label) return null;
  return { type, id: referenceId, label };
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
      ['listStudents','listMentors','listAssignments','getAutomationSettings'].includes(action) ? 'view' :
      ['assign','saveAutomationSettings','sendMessage','createDraft','sendDraft'].includes(action) ? 'manage' :
      ['performance','questionFailures','listConversations','listMyConversations','messages'].includes(action) ? 'read' : '';
    if (permissionAction) await requirePermissionForProfile(db, actor as Record<string, unknown>, 'mentoring', permissionAction);
    let organizationId = String(body.organizationId || actor.organizationId || '').trim();
    if (isAdmin(actor)) organizationId = await assertOrganizationScope(db, { ...actor, uid: decoded.uid }, organizationId);

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
      return res.status(200).json({ ok: true, item: { id: studentId, studentId, mentorId, status: 'active' } });
    }

    if (action === 'performance') {
      const studentId = id(body.studentId);
      const student = await profile(db, studentId);
      if (!sameTenant(actor, student, organizationId)) throw new Error('You cannot access this learner.');
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
      return res.status(200).json({ ok: true, items: items.map(doc => ({ id: doc.id, ...doc.data() })) });
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
      return res.status(200).json({ ok: true, items: [{ ...item, mentorName: String(mentor.displayName || mentor.email || mentorId), mentorPhotoURL: String(mentor.photoURL || '') }] });
    }

    if (action === 'messages') {
      const conversation = await db.doc(`mentorConversations/${id(body.conversationId)}`).get();
      if (!conversation.exists) return res.status(200).json({ ok: true, items: [] });
      const data = conversation.data() || {};
      await assertParticipant(db, decoded.uid, data);
      const messages = await conversation.ref.collection('messages').orderBy('createdAt','asc').limit(200).get();
      return res.status(200).json({ ok: true, items: messages.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: iso(doc.data()?.createdAt) })) });
    }

    if (action === 'sendMessage') {
      const studentId = id(body.studentId);
      const mentorId = id(body.mentorId);
      const student = await profile(db, studentId);
      const mentor = await profile(db, mentorId);
      if (!sameTenant(actor, student, organizationId) || !sameTenant(actor, mentor, organizationId)) throw new Error('You cannot access this learner.');
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
      const references = Array.isArray(body.references) ? body.references.map(safeReference).filter(Boolean) : [];
      await ref.set({
        ...current,
        organizationId: String(student.organizationId || organizationId),
        studentId,
        mentorId,
        status: 'open',
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const messageRef = ref.collection('messages').doc();
      await messageRef.set({
        senderId: decoded.uid,
        recipientId: String(decoded.uid) === studentId ? mentorId : studentId,
        body: message,
        references,
        createdAt: FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ ok: true, item: { id: messageRef.id, senderId: decoded.uid, body: message, references } });
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
      if (!sameTenant(actor, student, organizationId)) throw new Error('You cannot access this learner.');
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
      if (!sameTenant(actor, student, organizationId)) throw new Error('You cannot access this learner.');
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
        await db.collection('notifications').add({
          organizationId: String(draft.organizationId || organizationId),
          recipientId: String(draft.studentId || ''),
          title: String(draft.subject || ''),
          body: String(draft.body || ''),
          type: 'learning-support',
          createdAt: FieldValue.serverTimestamp(),
          read: false,
        });
      }
      await draftRef.set({ status: 'sent', sentAt: FieldValue.serverTimestamp(), delivery }, { merge: true });
      return res.status(200).json({ ok: true, delivery });
    }

    return res.status(400).json({ error: 'Unsupported mentorship action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mentorship operation failed.';
    if (message.includes('Sign in') || message.includes('Administrator privileges') || message.includes('not allowed') || message.includes('not configured') || message.includes('not assigned') || message.includes('not found') || message.includes('cannot manage')) return res.status(403).json({ error: message });
    console.error('VOP mentorship operation failed', error);
    return res.status(500).json({ error: message });
  }
}
