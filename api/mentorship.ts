import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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
  return ['super_admin','union_admin','conference_admin','district_admin','church_admin'].includes(String(data.role || ''));
}

function isMentor(data: Record<string, unknown>) {
  return String(data.role || '') === 'mentor' || (data.mentorProfile && typeof data.mentorProfile === 'object' && (data.mentorProfile as Record<string, unknown>).enabled === true);
}

function sameScope(actor: Record<string, unknown>, student: Record<string, unknown>) {
  const role = String(actor.role || '');
  if (role === 'super_admin') return true;
  const node = String(actor.adminNodeId || '');
  if (!node) return true;
  const field = role === 'union_admin' ? 'unionId' : role === 'conference_admin' ? 'conferenceId' : role === 'district_admin' ? 'districtId' : 'churchId';
  return !student[field] || String(student[field]) === node;
}

async function assertAdmin(db: FirebaseFirestore.Firestore, uid: string) {
  const actor = await profile(db, uid);
  if (!isAdmin(actor)) throw new Error('Administrator privileges are required.');
  return actor;
}

async function assertParticipant(db: FirebaseFirestore.Firestore, uid: string, conversation: Record<string, unknown>) {
  if (isAdmin(await profile(db, uid))) return;
  if (String(conversation.studentId || '') === uid || String(conversation.mentorId || '') === uid) return;
  throw new Error('You are not a participant in this conversation.');
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

    if (['listStudents','listMentors','listAssignments','questionFailures','createDraft','sendDraft','getAutomationSettings','saveAutomationSettings'].includes(action)) {
      await assertAdmin(db, decoded.uid);
    }

    if (action === 'listStudents') {
      const snapshot = await db.collection('users').get();
      const students = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })).filter(item => String(item.role || 'student') === 'student' && sameScope(actor, item));
      return res.status(200).json({ ok: true, items: students });
    }

    if (action === 'listMentors') {
      const snapshot = await db.collection('users').get();
      const mentors = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })).filter(item => isMentor(item));
      return res.status(200).json({ ok: true, items: mentors });
    }

    if (action === 'listAssignments') {
      const snapshot = await db.collection('mentorAssignments').get();
      const studentSnapshots = await Promise.all(snapshot.docs.map(doc => db.doc(`users/${String(doc.data()?.studentId || '')}`).get()));
      const allowedStudentIds = new Set(studentSnapshots.filter(item => item.exists && sameScope(actor, item.data() || {})).map(item => item.id));
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => allowedStudentIds.has(String(item.studentId || '')));
      return res.status(200).json({ ok: true, items });
    }

    if (action === 'assign') {
      await assertAdmin(db, decoded.uid);
      const studentId = id(body.studentId);
      const mentorId = id(body.mentorId);
      const student = await profile(db, studentId);
      const mentor = await profile(db, mentorId);
      if (String(student.role || 'student') !== 'student') throw new Error('The selected account is not a learner.');
      if (!isMentor(mentor)) throw new Error('The selected account is not configured as a mentor.');
      if (!sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const ref = db.doc(`mentorAssignments/${studentId}`);
      await ref.set({
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
      if (isAdmin(actor) && !sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      if (!isAdmin(actor)) {
        const assignment = await db.doc(`mentorAssignments/${studentId}`).get();
        if (!assignment.exists || String(assignment.data()?.mentorId || '') !== decoded.uid) throw new Error('Mentor access to this learner is not configured.');
      }
      return res.status(200).json({ ok: true, item: await performanceFor(db, studentId) });
    }

    if (action === 'questionFailures') {
      const snapshot = await db.collection('questionPerformance').orderBy('failedCount', 'desc').limit(50).get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'listConversations') {
      const requestedStudent = body.studentId ? id(body.studentId) : '';
      const requestedMentor = body.mentorId ? id(body.mentorId) : '';
      if (isAdmin(actor)) {
        let snapshot = await db.collection('mentorConversations').get();
        let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const studentSnapshots = await Promise.all(items.map(item => db.doc(`users/${String(item.studentId || '')}`).get()));
        const allowedStudentIds = new Set(studentSnapshots.filter(item => item.exists && sameScope(actor, item.data() || {})).map(item => item.id));
        items = items.filter(item => allowedStudentIds.has(String(item.studentId || '')));
        if (requestedStudent) items = items.filter(item => String(item.studentId || '') === requestedStudent);
        if (requestedMentor) items = items.filter(item => String(item.mentorId || '') === requestedMentor);
        return res.status(200).json({ ok: true, items });
      }
      const assignment = await db.collection('mentorAssignments').where('mentorId','==',decoded.uid).get();
      const assignedStudents = new Set(assignment.docs.map(doc => String(doc.data().studentId || '')));
      let snapshot = await db.collection('mentorConversations').where('mentorId','==',decoded.uid).get();
      if (requestedStudent && !assignedStudents.has(requestedStudent)) throw new Error('This learner is not assigned to you.');
      if (requestedStudent) snapshot = await db.collection('mentorConversations').where('mentorId','==',decoded.uid).where('studentId','==',requestedStudent).get();
      return res.status(200).json({ ok: true, items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'listMyConversations') {
      const studentId = decoded.uid;
      const assignment = await db.doc(`mentorAssignments/${studentId}`).get();
      if (!assignment.exists) return res.status(200).json({ ok: true, items: [] });
      const mentorId = String(assignment.data()?.mentorId || '');
      const mentor = await profile(db, mentorId);
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
      return res.status(200).json({ ok: true, items: messages.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }

    if (action === 'sendMessage') {
      const studentId = id(body.studentId);
      const mentorId = id(body.mentorId);
      const student = await profile(db, studentId);
      if (isAdmin(actor) && !sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const message = String(body.message || '').trim();
      if (!message || message.length > 10000) throw new Error('A message is required.');
      const ref = db.doc(`mentorConversations/${conversationId(studentId, mentorId)}`);
      const existing = await ref.get();
      const current = existing.exists ? existing.data() || {} : { studentId, mentorId, status: 'open' };
      if (String(decoded.uid) !== studentId && String(decoded.uid) !== mentorId && !isAdmin(actor)) throw new Error('You are not allowed to send to this conversation.');
      if (String(decoded.uid) === mentorId) {
        const assignment = await db.doc(`mentorAssignments/${studentId}`).get();
        if (!assignment.exists || String(assignment.data()?.mentorId || '') !== mentorId) throw new Error('This learner is not assigned to you.');
      }
      const references = Array.isArray(body.references) ? body.references.map(safeReference).filter(Boolean) : [];
      await ref.set({
        ...current,
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
      const snapshot = await db.doc('system/mentorship').get();
      return res.status(200).json({ ok: true, item: snapshot.exists ? snapshot.data() : {
        enabled: false,
        channel: 'in_app',
        minAverageScore: 0,
        maxProgressPercent: 0,
        cooldownDays: 7,
      }});
    }

    if (action === 'saveAutomationSettings') {
      const minAverageScore = Math.max(0, Math.min(100, Number(body.minAverageScore || 0)));
      const maxProgressPercent = Math.max(0, Math.min(100, Number(body.maxProgressPercent || 0)));
      const cooldownDays = Math.max(1, Math.min(90, Number(body.cooldownDays || 7)));
      const channel = body.channel === 'email' ? 'email' : 'in_app';
      await db.doc('system/mentorship').set({
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
      if (!sameScope(actor, student)) throw new Error('You cannot manage this learner.');
      const performance = await performanceFor(db, studentId);
      const draft = draftFor(student, performance);
      const ref = db.collection('notificationDrafts').doc();
      await ref.set({
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
      const student = await profile(db, String(draft.studentId || ''));
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
