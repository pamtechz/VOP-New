import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function admin() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Server-side administration is not configured.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function draftFor(student: Record<string, unknown>, averageScore: number, progressPercent: number) {
  const name = String(student.displayName || 'there').split(' ')[0];
  return {
    subject: averageScore > 0 ? 'Support with your VOP learning progress' : 'Let’s continue your VOP learning journey',
    body: `Hello ${name},\n\nYour VOP learning record shows ${Math.round(progressPercent)}% progress and an assessment average of ${Math.round(averageScore)}%. We are checking in to make sure you have the support you need. Your mentor is available to help you review lessons and questions at your own pace.\n\nKeep going — every lesson is a step forward.\n\nVOP Learning Support`,
  };
}

export default async function handler(req: { method?: string; headers?: Record<string, string | string[]> }, res: { status:(n:number)=>any; json:(v:unknown)=>void }) {
  try {
    const expected = process.env.CRON_SECRET;
    const authorization = first(req.headers?.authorization ?? req.headers?.Authorization);
    if (!expected || authorization !== `Bearer ${expected}`) return res.status(401).json({ error: 'Unauthorized.' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    const db = getFirestore(admin());
    const organizationsSnapshot = await db.collection('organizations').where('status','==','active').get();
    const organizations = organizationsSnapshot.docs;

    let processed = 0;
    let created = 0;
    let sent = 0;
    const now = Date.now();

    for (const organizationDoc of organizations) {
      const organizationId = organizationDoc.id;
      if (!organizationId) continue;
      const orgConfigSnapshot = await db.doc(`organizations/${organizationId}/settings/mentorship`).get();
      const config = orgConfigSnapshot.exists ? orgConfigSnapshot.data() || {} : {};
      if (config.enabled !== true) continue;

      const minAverageScore = Number(config.minAverageScore || 0);
      const maxProgressPercent = Number(config.maxProgressPercent || 0);
      const cooldownDays = Math.max(1, Number(config.cooldownDays || 7));
      if (minAverageScore <= 0 && maxProgressPercent <= 0) continue;

      const studentsSnapshot = await db.collection('users').where('organizationId','==',organizationId).get();

      for (const studentDoc of studentsSnapshot.docs) {
      const student = studentDoc.data();
      if (String(student.role || 'student') !== 'student') continue;
      processed += 1;
      const progress = student.progress && typeof student.progress === 'object' ? student.progress as Record<string, unknown> : {};
      const progressPercent = Math.max(0, Math.min(100, Number(progress.discoverProgress || 0)));
      const attempts = await studentDoc.ref.collection('assessmentAttempts').orderBy('createdAt','desc').limit(20).get();
      const scores = attempts.docs.map(doc => Number(doc.data().score)).filter(Number.isFinite);
      const averageScore = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
      const scoreTrigger = minAverageScore > 0 && scores.length > 0 && averageScore <= minAverageScore;
      const progressTrigger = maxProgressPercent > 0 && progressPercent <= maxProgressPercent;
      if (!scoreTrigger && !progressTrigger) continue;

      const recentDrafts = await db.collection('notificationDrafts').where('studentId','==',studentDoc.id).limit(20).get();
      const hasRecent = recentDrafts.docs.some(doc => {
        const createdAt = doc.data().createdAt;
        const millis = createdAt?.toMillis?.() ?? Date.parse(String(createdAt || ''));
        return Number.isFinite(millis) && now - millis < cooldownDays * 86400000;
      });
      if (hasRecent) continue;

      const draft = draftFor(student, averageScore, progressPercent);
      const draftRef = db.collection('notificationDrafts').doc();
      const channel = config.channel === 'email' ? 'email' : 'in_app';
      await draftRef.set({
        organizationId,
        studentId: studentDoc.id,
        type: 'performance-support',
        channel,
        subject: draft.subject,
        body: draft.body,
        status: 'draft',
        trigger: { scoreTrigger, progressTrigger, averageScore, progressPercent },
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'system',
      });
      created += 1;

      if (channel === 'email' && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && student.email) {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to: [String(student.email)],
            subject: draft.subject,
            html: draft.body.replace(/\\n/g, '<br/>'),
          }),
        });
        if (emailResponse.ok) {
          await draftRef.set({ status:'sent', sentAt:FieldValue.serverTimestamp(), delivery:'email' }, { merge:true });
          sent += 1;
        }
      } else {
        await db.collection('notifications').add({
          organizationId,
          recipientId: studentDoc.id,
          title: draft.subject,
          body: draft.body,
          type: 'learning-support',
          createdAt: FieldValue.serverTimestamp(),
          read: false,
        });
        await draftRef.set({ status:'sent', sentAt:FieldValue.serverTimestamp(), delivery:'in_app' }, { merge:true });
        sent += 1;
      }
    }

      }
    }

    return res.status(200).json({ ok:true, processed, created, sent });
  } catch (error) {
    console.error('VOP mentorship automation failed', error);
    return res.status(500).json({ error:'Mentorship automation failed.' });
  }
}
