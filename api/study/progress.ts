import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { configuredPassThreshold, validStudyId, validStudyLanguage } from '../../shared/studyValidation.js';
import { curriculumAnchorExists, curriculumPages } from '../../shared/curriculumStructure.js';

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

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === 'object') {
    const stamp = value as { toDate?:()=>Date; seconds?:number; _seconds?:number };
    if (typeof stamp.toDate === 'function') return stamp.toDate().getTime();
    const seconds = Number(stamp.seconds ?? stamp._seconds);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  return 0;
}

function retakePolicyKey(organizationId:string, language:string, guideId:string, lessonId:string) {
  return createHash('sha256').update([organizationId || 'platform',language,guideId,lessonId].join(':')).digest('hex');
}

function nonNegativeWhole(value: unknown, max: number) {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : 0;
}

function policyWhole(value: unknown, fallback: unknown, max: number) {
  return value === null || value === undefined || value === ''
    ? nonNegativeWhole(fallback, max)
    : nonNegativeWhole(value, max);
}

function policyPassMark(value: unknown, fallback: unknown) {
  return configuredPassThreshold(value === null || value === undefined || value === '' ? fallback : value);
}

function assessmentPolicyData(value: unknown) {
  const policy=value&&typeof value==='object'&&!Array.isArray(value) ? value as Record<string,unknown> : {};
  const feedbackMode=policy.feedbackMode==='after_pass'||policy.feedbackMode==='none' ? String(policy.feedbackMode) : 'after_submit';
  return {
    instructions:String(policy.instructions||'').trim().slice(0,4000),
    timeLimitMinutes:nonNegativeWhole(policy.timeLimitMinutes,480),
    passingPercent:policy.passingPercent,
    maxAttempts:policy.maxAttempts,
    retakeCooldownMinutes:policy.retakeCooldownMinutes,
    feedbackMode,
  };
}

function gradeServerQuiz(questions: QuestionRecord[], answers: Record<string, unknown>): number | null {
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const keys = new Set<string>();
  let correct = 0;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const key = typeof question?.key === 'string' ? question.key.trim() : typeof question?.id === 'string' ? question.id.trim() : '';
    const text = typeof question?.question === 'string' ? question.question.trim() : typeof question?.prompt === 'string' ? question.prompt.trim() : '';
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

    if (!validStudyLanguage(language) || !validStudyId(guideId) || !validStudyId(lessonId) || !['completeLesson', 'submitQuiz', 'startQuiz', 'saveLessonResume'].includes(action)) {
      return res.status(400).json({ error: 'A valid study progress request is required.' });
    }

    const db = getFirestore(firebaseAdmin);
    const userRef = db.doc(`users/${decoded.uid}`);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) return res.status(404).json({ error: 'VOP account profile was not found.' });
    const userData = userSnapshot.data() || {};
    const organizationId = String(userData.organizationId || '').trim();
    if (organizationId) {
      const [organization, membership] = await Promise.all([
        db.doc(`organizations/${organizationId}`).get(),
        db.doc(`organizations/${organizationId}/members/${decoded.uid}`).get(),
      ]);
      if (!organization.exists || organization.data()?.status !== 'active' ||
          (membership.exists && membership.data()?.active !== true)) {
        return res.status(403).json({ error: 'Your organization membership is not active.' });
      }
    }

    // A learner without an organization can still study an approved shared guide.
    // Only the literal legacy "discover" ID selects the legacy curriculum.
    const tenantGuideRef = guideId && guideId !== 'discover' ? db.doc(`guides/${guideId}`) : null;
    const legacyGuideRef = db.doc(`curricula/discover/languages/${language}`);
    const candidateGuide = tenantGuideRef ? await tenantGuideRef.get() : null;
    const candidateGuideData = candidateGuide?.exists ? candidateGuide.data() || {} : {};
    const candidateGuideOrganizationId = String(candidateGuideData.organizationId || '').trim();
    const candidateGuideShared = candidateGuideData.sharingScope === 'shared' && candidateGuideData.published === true;
    const enrollmentId=candidateGuide?.exists&&candidateGuideOrganizationId
      ? candidateGuideOrganizationId+'_'+decoded.uid+'_'+guideId : '';
    const enrollment=enrollmentId?await db.doc('courseEnrollments/'+enrollmentId).get():null;
    const enrolledForGuide=Boolean(enrollment?.exists
      && enrollment.data()?.status==='active'
      && String(enrollment.data()?.uid||'')===decoded.uid
      && String(enrollment.data()?.organizationId||'')===candidateGuideOrganizationId
      && String(enrollment.data()?.guideId||'')===guideId);
    const useTenantGuide = Boolean(candidateGuide?.exists && (
      (Boolean(organizationId) && candidateGuideOrganizationId === organizationId)
      || candidateGuideShared
      || enrolledForGuide
    ));
    // Never resolve an unknown or forbidden canonical guide against the
    // legacy Discover collection. Only the literal "discover" ID is legacy.
    if (guideId !== 'discover' && !candidateGuide?.exists) {
      return res.status(404).json({ error: 'The selected guide was not found.' });
    }
    if (guideId !== 'discover' && !useTenantGuide) {
      return res.status(403).json({ error: 'The selected guide is outside your organization.' });
    }
    const guideRef = useTenantGuide ? tenantGuideRef! : legacyGuideRef;
    const lessonRef = guideRef.collection('lessons').doc(lessonId);
    const [guideSnapshot, lessonSnapshot] = await Promise.all([guideRef.get(), lessonRef.get()]);

    if (!guideSnapshot.exists || guideSnapshot.data()?.published !== true || guideSnapshot.data()?.archived === true) {
      return res.status(404).json({ error: 'The selected guide is not published.' });
    }
    if (useTenantGuide && !candidateGuideShared && !enrolledForGuide && candidateGuideOrganizationId !== organizationId) {
      return res.status(403).json({ error: 'The selected guide is outside your organization.' });
    }
    if (useTenantGuide && guideSnapshot.data()?.language && String(guideSnapshot.data()?.language) !== language) {
      return res.status(409).json({ error: 'The selected guide language does not match the study request.' });
    }
    if (!lessonSnapshot.exists || lessonSnapshot.data()?.published !== true || lessonSnapshot.data()?.archived === true) {
      return res.status(404).json({ error: 'The selected lesson is not published.' });
    }

    const lessonData = lessonSnapshot.data() ?? {};
    const legacyStudyGuide = !useTenantGuide && guideId === 'discover';
    if (!legacyStudyGuide && String(lessonData.guideId ?? '') !== guideId) {
      return res.status(409).json({ error: 'The lesson does not belong to the selected guide.' });
    }
    if (useTenantGuide && candidateGuideOrganizationId !== organizationId && !enrolledForGuide
        && (lessonData.sharingScope !== 'shared' || lessonData.archived === true)) {
      return res.status(403).json({ error: 'This lesson is not shared with your organization.' });
    }

    if (action === 'saveLessonResume') {
      const pageIndex = Number(body.pageIndex);
      const structuredPages = Array.isArray(lessonData.chapters)
        ? curriculumPages(lessonData.chapters as Parameters<typeof curriculumPages>[0])
        : [];
      const canonicalPageCount = structuredPages.length || (Array.isArray(lessonData.contentPages) ? lessonData.contentPages.length : 0);
      const maxPageIndex = canonicalPageCount - 1;
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || canonicalPageCount < 1 || pageIndex > maxPageIndex) {
        return res.status(400).json({ error: 'A valid published lesson page position is required.' });
      }
      if (String(lessonData.type ?? 'Lesson') !== 'Lesson') {
        return res.status(409).json({ error: 'Only study lessons support resume positions.' });
      }

      const resumeKey = `${language}:${guideId}:${lessonId}`;
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists) throw new Error('VOP account profile was not found.');
        const data = snapshot.data() ?? {};
        const progress = data.progress && typeof data.progress === 'object'
          ? data.progress as Record<string, unknown>
          : {};
        const existingResume = progress.lessonResume && typeof progress.lessonResume === 'object'
          ? progress.lessonResume as Record<string, unknown>
          : {};
        transaction.set(userRef, {
          progress: {
            ...progress,
            lessonResume: {
              ...existingResume,
              [resumeKey]: {
                language,
                guideId,
                lessonId,
                pageIndex,
                updatedAt: new Date().toISOString(),
              },
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      return res.status(200).json({ ok: true, resumeKey, pageIndex });
    }

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
            lessonResume: Object.fromEntries(
              Object.entries(
                progress.lessonResume && typeof progress.lessonResume === 'object'
                  ? progress.lessonResume as Record<string, unknown>
                  : {},
              ).filter(([key]) => key !== completionKey),
            ),
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
    // The learner-readable assessment only contains prompts and options.
    // Grade using the private quiz bank, never trust client-provided keys.
    const sourceQuizId = String(lessonData.sourceQuizId || '').trim();
    let gradeable: Record<string, unknown> = lessonData;
    if (sourceQuizId) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(sourceQuizId) || !useTenantGuide) {
        return res.status(409).json({ error: 'The assessment source is invalid.' });
      }
      const quizSnap = await db.doc(`quizzes/${sourceQuizId}`).get();
      const quiz = quizSnap.data() || {};
      if (!quizSnap.exists
        || quiz.published !== true || quiz.archived === true
        || String(quiz.guideId || '') !== guideId
        || String(quiz.assessmentPath || '') !== lessonRef.path
        || String(quiz.language || '') !== language
        || String(quiz.organizationId || '') !== candidateGuideOrganizationId
      ) return res.status(409).json({ error: 'This assessment is not available for grading.' });
      // A chapter/section/block quiz must still reference a published,
      // currently existing part of the same study lesson.
      if (['chapter','section','block'].includes(String(quiz.attachmentType||''))) {
        const parentId = String(quiz.lessonId || '');
        const anchorId = String(quiz.anchorId || '');
        if (!validStudyId(parentId) || !validStudyId(anchorId) ||
            String(lessonData.attachedLessonId || '') !== parentId ||
            String(lessonData.anchorId || '') !== anchorId) {
          return res.status(409).json({ error:'The assessment attachment has changed.' });
        }
        const parent = await guideRef.collection('lessons').doc(parentId).get();
        if (!parent.exists || parent.data()?.published !== true || parent.data()?.archived === true ||
            parent.data()?.type === 'Test' ||
            !curriculumAnchorExists(parent.data()?.chapters,quiz.attachmentType,anchorId)) {
          return res.status(409).json({ error:'The assessment chapter, section or block is no longer published.' });
        }
      }
      gradeable = quiz;
    }
    const questions = Array.isArray(gradeable.questions)
      ? gradeable.questions as QuestionRecord[]
      : Array.isArray(gradeable.quiz)
        ? gradeable.quiz as QuestionRecord[]
        : [];
    if (!questions.length) return res.status(409).json({ error:'This assessment has no published questions.' });

    const policyOrganizationId = candidateGuideOrganizationId || organizationId;
    const settingsRef = policyOrganizationId ? db.doc(`organizations/${policyOrganizationId}/settings/settings`) : db.doc('system/settings');
    const settingsSnapshot = await settingsRef.get();
    const settingsData = settingsSnapshot.data() || {};
    const assessmentPolicy = assessmentPolicyData(gradeable.assessmentPolicy);
    const threshold = policyPassMark(assessmentPolicy.passingPercent, settingsData.quizPassThreshold);
    if (threshold === null) return res.status(503).json({ error: 'The assessment pass mark is not configured.' });
    const maxAttempts = policyWhole(assessmentPolicy.maxAttempts, settingsData.quizMaxAttempts, 100);
    const retakeCooldownMinutes = policyWhole(assessmentPolicy.retakeCooldownMinutes, settingsData.quizRetakeCooldownMinutes, 10080);
    const timeLimitMinutes = assessmentPolicy.timeLimitMinutes;
    const feedbackMode = assessmentPolicy.feedbackMode;
    const finalExam = lessonData.assessmentKind === 'final_exam' && lessonData.attachmentType === 'guide';
    const finalRequirements = finalExam ? (await guideRef.collection('lessons').get()).docs
      .filter(doc => doc.data().type !== 'Test' && doc.data().published === true && doc.data().archived !== true)
      .map(doc => `${language}:${guideId}:${doc.id}`) : [];
    if (finalExam && (!finalRequirements.length || finalRequirements.some(key =>
      !Array.isArray(userData.progress?.completedLessons) || !userData.progress.completedLessons.includes(key)))) {
      return res.status(409).json({ error:'Complete all published study lessons before taking the final guide examination.' });
    }

    const effectiveGuideId = legacyStudyGuide ? 'discover' : guideId;
    const scoreKey = `${policyOrganizationId || 'platform'}:${language}:${effectiveGuideId}:${lessonId}`;
    const policyRef = userRef.collection('assessmentAttemptPolicy').doc(
      retakePolicyKey(policyOrganizationId, language, effectiveGuideId, lessonId),
    );
    // Bootstrap from historical attempts so introducing a policy does not reset
    // a learner's prior assessment history.
    const historical = await userRef.collection('assessmentAttempts')
      .where('lessonId','==',lessonId).limit(500).get();
    const relevantHistorical = historical.docs.filter(doc => {
      const row = doc.data() || {};
      return String(row.organizationId || '') === policyOrganizationId
        && String(row.language || '') === language
        && String(row.guideId || '') === effectiveGuideId;
    });
    const historicalAttemptCount = relevantHistorical.length;
    const historicalLastAttemptMs = relevantHistorical.reduce(
      (latest, doc) => Math.max(latest, timestampMs(doc.data()?.createdAt)), 0,
    );
    const attemptTimeMs = Date.now();
    const attemptTimeIso = new Date(attemptTimeMs).toISOString();

    if (action === 'startQuiz') {
      const attemptId=randomUUID();
      const attemptRef=userRef.collection('assessmentAttempts').doc(attemptId);
      const expiresAt=timeLimitMinutes>0 ? new Date(attemptTimeMs+timeLimitMinutes*60_000).toISOString() : null;
      const startResult=await db.runTransaction(async transaction=>{
        const [snapshot,policySnapshot]=await Promise.all([transaction.get(userRef),transaction.get(policyRef)]);
        if(!snapshot.exists)throw new Error('VOP account profile was not found.');
        const profile=snapshot.data()||{};
        const progress=profile.progress&&typeof profile.progress==='object' ? profile.progress as Record<string,unknown> : {};
        if(finalExam&&finalRequirements.some(key=>!Array.isArray(progress.completedLessons)||!progress.completedLessons.includes(key))){
          throw new Error('Complete all published study lessons before taking the final guide examination.');
        }
        const policy=policySnapshot.data()||{};
        const priorAttempts=policySnapshot.exists?Math.max(0,Number(policy.attemptCount||0)):historicalAttemptCount;
        const lastAttemptMs=policySnapshot.exists?timestampMs(policy.lastAttemptAt):historicalLastAttemptMs;
        if(maxAttempts>0&&priorAttempts>=maxAttempts)throw new Error(`Assessment attempt limit reached (${maxAttempts} attempt${maxAttempts===1?'':'s'}).`);
        const retryAtMs=lastAttemptMs+retakeCooldownMinutes*60_000;
        if(retakeCooldownMinutes>0&&priorAttempts>0&&retryAtMs>attemptTimeMs){
          throw new Error(`Assessment retake is available after ${new Date(retryAtMs).toISOString()}.`);
        }
        const attemptsUsed=priorAttempts+1;
        transaction.set(policyRef,{
          organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
          attemptCount:attemptsUsed,lastAttemptAt:attemptTimeIso,updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        transaction.set(attemptRef,{
          candidateId:decoded.uid,userId:decoded.uid,organizationId:policyOrganizationId,
          language,guideId:effectiveGuideId,lessonId,status:'in_progress',
          assessmentKind:String(lessonData.assessmentKind||'practice'),threshold,
          attemptNumber:attemptsUsed,startedAt:attemptTimeIso,expiresAt,
          createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
        });
        return {attemptsUsed};
      });
      return res.status(200).json({
        ok:true,attemptId,startedAt:attemptTimeIso,expiresAt,
        policy:{
          instructions:assessmentPolicy.instructions,timeLimitMinutes,passingPercent:threshold,
          maxAttempts:maxAttempts||null,retakeCooldownMinutes,feedbackMode,
        },
        retakePolicy:{
          attemptsUsed:startResult.attemptsUsed,maxAttempts:maxAttempts||null,
          remainingAttempts:maxAttempts>0?Math.max(0,maxAttempts-startResult.attemptsUsed):null,
          cooldownMinutes:retakeCooldownMinutes,retryAt:null,
        },
      });
    }

    const requestedAttemptId=typeof body.attemptId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(body.attemptId) ? body.attemptId : '';
    const attemptId=requestedAttemptId||randomUUID();
    const attemptRef=userRef.collection('assessmentAttempts').doc(attemptId);
    const startedAttempt=requestedAttemptId ? await attemptRef.get() : null;
    if(requestedAttemptId){
      const data=startedAttempt?.data()||{};
      if(!startedAttempt?.exists||data.status!=='in_progress'
        ||String(data.organizationId||'')!==policyOrganizationId
        ||String(data.language||'')!==language||String(data.guideId||'')!==effectiveGuideId
        ||String(data.lessonId||'')!==lessonId){
        return res.status(409).json({error:'This assessment attempt is no longer active. Start a new attempt.'});
      }
      const expiresAt=timestampMs(data.expiresAt);
      if(expiresAt>0&&Date.now()>expiresAt){
        await attemptRef.set({status:'expired',expiredAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        return res.status(409).json({error:'Time expired for this assessment attempt. Start a new attempt when the retake policy allows.'});
      }
    }
    const score = gradeServerQuiz(questions, answers);
    if (score === null) return res.status(400).json({ error: 'The assessment answers or question configuration are invalid.' });
    const passed = score >= threshold;
    const questionResults = questions.map((question, index) => {
      const answer = answers[String(index)];
      const correct = Array.isArray(question.options)
        ? Number(answer) === Number(question.correctOptionIndex)
        : answer === question.answer;
      const questionKey = typeof question.key === 'string' ? question.key : String(index);
      return {
        key: questionKey,
        question: String(question.question ?? question.prompt ?? ''),
        correct,
        answer: answer ?? null,
        lessonId,
        guideId,
        language,
      };
    });
    const failedQuestions = questionResults.filter(item => !item.correct);
    const failureRefs = failedQuestions.map(item => db.collection('questionPerformance').doc(
      `${policyOrganizationId || 'platform'}__${language}__${guideId}__${lessonId}__${item.key}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150)
    ));

    const policyResult = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(userRef);
      const policySnapshot = await transaction.get(policyRef);
      if (!snapshot.exists) throw new Error('VOP account profile was not found.');

      const policy = policySnapshot.data() || {};
      const priorAttempts = policySnapshot.exists
        ? Math.max(0, Number(policy.attemptCount || 0))
        : historicalAttemptCount;
      const lastAttemptMs = policySnapshot.exists
        ? timestampMs(policy.lastAttemptAt)
        : historicalLastAttemptMs;
      if (!requestedAttemptId) {
        if (maxAttempts > 0 && priorAttempts >= maxAttempts) {
          throw new Error(`Assessment attempt limit reached (${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}).`);
        }
        const retryAtMs = lastAttemptMs + retakeCooldownMinutes * 60_000;
        if (retakeCooldownMinutes > 0 && priorAttempts > 0 && retryAtMs > attemptTimeMs) {
          throw new Error(`Assessment retake is available after ${new Date(retryAtMs).toISOString()}.`);
        }
      }

      const data = snapshot.data() ?? {};
      const progress = data.progress && typeof data.progress === 'object'
        ? data.progress as Record<string, unknown>
        : {};
      if (finalExam && finalRequirements.some(key =>
        !Array.isArray(progress.completedLessons) || !progress.completedLessons.includes(key))) {
        throw new Error('Complete all published study lessons before taking the final guide examination.');
      }
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

      const attemptsUsed = requestedAttemptId
        ? Math.max(1,Number(startedAttempt?.data()?.attemptNumber||priorAttempts||1))
        : priorAttempts + 1;
      if (!requestedAttemptId) {
        transaction.set(policyRef, {
          organizationId:policyOrganizationId,
          language,
          guideId: effectiveGuideId,
          lessonId,
          attemptCount: attemptsUsed,
          lastAttemptAt: attemptTimeIso,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge:true });
      }

      transaction.set(attemptRef, {
        candidateId: decoded.uid,
        userId: decoded.uid,
        score,
        passed,
        threshold,
        organizationId:policyOrganizationId,
        language,
        guideId: effectiveGuideId,
        lessonId,
        status:'completed',
        assessmentKind:String(lessonData.assessmentKind||'practice'),
        questionResults,
        failedQuestionKeys: failedQuestions.map(item => item.key),
        attemptNumber: attemptsUsed,
        completedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        ...(!requestedAttemptId?{createdAt:FieldValue.serverTimestamp(),startedAt:attemptTimeIso}:{}),
      }, {merge:Boolean(requestedAttemptId)});

      for (let index = 0; index < failureRefs.length; index += 1) {
        const failure = failedQuestions[index];
        const ref = failureRefs[index];
        transaction.set(ref, {
          key: failure.key,
          question: failure.question,
          organizationId:policyOrganizationId,
          language,
          guideId,
          lessonId,
          failedCount: FieldValue.increment(1),
          answeredCount: FieldValue.increment(1),
          lastFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const successRefs = questionResults.filter(item => item.correct).map(item =>
        db.collection('questionPerformance').doc(
          `${policyOrganizationId || 'platform'}__${language}__${guideId}__${lessonId}__${item.key}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150)
        )
      );
      for (const ref of successRefs) {
        transaction.set(ref, { organizationId:policyOrganizationId, answeredCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return { attemptsUsed };
    });

    const revealFeedback = feedbackMode === 'after_submit' || (feedbackMode === 'after_pass' && passed);
    const feedback = revealFeedback ? questions.map((question,index)=>({
      key:typeof question.key==='string'?question.key:String(index),
      correct:questionResults[index]?.correct===true,
      explanation:String((question as Record<string,unknown>).explanation||''),
      correctAnswer:Array.isArray(question.options)?Number(question.correctOptionIndex):question.answer,
    })) : undefined;
    const remainingAttempts = maxAttempts > 0 ? Math.max(0, maxAttempts - policyResult.attemptsUsed) : null;
    const retryAt = !passed && retakeCooldownMinutes > 0 && remainingAttempts !== 0
      ? new Date(attemptTimeMs + retakeCooldownMinutes * 60_000).toISOString()
      : null;
    return res.status(200).json({
      ok: true, score, passed, scoreKey, threshold, feedback,
      policy:{
        instructions:assessmentPolicy.instructions,timeLimitMinutes,passingPercent:threshold,
        maxAttempts:maxAttempts||null,retakeCooldownMinutes,feedbackMode,
      },
      retakePolicy: {
        attemptsUsed: policyResult.attemptsUsed,
        maxAttempts: maxAttempts || null,
        remainingAttempts,
        cooldownMinutes: retakeCooldownMinutes,
        retryAt,
      },
    });
  } catch (error) {
    console.error('VOP study progress sync failed', error);
    const message = error instanceof Error ? error.message : 'Study progress could not be saved.';
    if (message.includes('not configured')) return res.status(503).json({ error: message });
    if (message.includes('Complete all published study lessons') || message.includes('Time expired')) return res.status(409).json({error:message});
    if (message.includes('Assessment attempt limit reached') || message.includes('Assessment retake is available after')) {
      return res.status(429).json({error:message});
    }
    if (message.includes('profile was not found')) return res.status(404).json({ error: message });
    return res.status(500).json({ error: 'Study progress could not be saved.' });
  }
}
