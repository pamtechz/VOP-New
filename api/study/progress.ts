import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { configuredPassThreshold, validStudyId, validStudyLanguage } from '../../shared/studyValidation.js';
import { curriculumAnchorExists, curriculumPages } from '../../shared/curriculumStructure.js';
import { ensureAutomaticGraduationReview } from '../../server/graduationAutomation.js';

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
function positiveOverride(value:unknown,fallback:number,max:number){
  const parsed=Number(value??0);
  return Number.isInteger(parsed)&&parsed>0&&parsed<=max?parsed:fallback;
}
function assessmentPolicy(lesson:Record<string,unknown>,settings:Record<string,unknown>){
  const configured=configuredPassThreshold(lesson.assessmentPassThreshold)
    ?? configuredPassThreshold(settings.quizPassThreshold);
  return {
    threshold:configured,
    maxAttempts:positiveOverride(lesson.assessmentMaxAttempts,nonNegativeWhole(settings.quizMaxAttempts,100),100),
    retakeCooldownMinutes:positiveOverride(lesson.assessmentRetakeCooldownMinutes,nonNegativeWhole(settings.quizRetakeCooldownMinutes,10080),10080),
    timeLimitMinutes:nonNegativeWhole(lesson.assessmentTimeLimitMinutes,1440),
    feedbackMode:['score_only','after_submit','none'].includes(String(lesson.assessmentFeedbackMode||''))
      ?String(lesson.assessmentFeedbackMode):'score_only',
    instructions:String(lesson.assessmentInstructions||'').trim().slice(0,5000),
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

function publicAttemptQuestions(questions:QuestionRecord[]){
  if(!Array.isArray(questions)||questions.length===0)return null;
  const keys=new Set<string>();
  const result:Array<Record<string,unknown>>=[];
  for(let index=0;index<questions.length;index+=1){
    const item=questions[index];
    const key=typeof item?.key==='string'?item.key.trim():typeof item?.id==='string'?item.id.trim():'';
    const question=typeof item?.question==='string'?item.question.trim():typeof item?.prompt==='string'?item.prompt.trim():'';
    if(!key||!question||keys.has(key))return null;
    keys.add(key);
    if(Array.isArray(item.options)){
      const options=item.options.map(value=>typeof value==='string'?value.trim():'');
      if(options.length<2||options.some(value=>!value))return null;
      result.push({key,question,options,questionType:'single_select'});
      continue;
    }
    if(typeof item.answer==='boolean'){
      result.push({key,question,questionType:'true_false'});
      continue;
    }
    return null;
  }
  return result;
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

    if (!validStudyLanguage(language) || !validStudyId(guideId) || !validStudyId(lessonId) || !['completeLesson', 'submitQuiz', 'saveLessonResume', 'startQuiz'].includes(action)) {
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
    const platformGuide = useTenantGuide && candidateGuideShared
      && (!candidateGuideOrganizationId || String(candidateGuideData.scope || '') === 'platform');
    if (useTenantGuide && candidateGuideOrganizationId !== organizationId && !enrolledForGuide
        && !platformGuide && (lessonData.sharingScope !== 'shared' || lessonData.archived === true)) {
      return res.status(403).json({ error: 'This lesson is not shared with your organization.' });
    }

    if (action === 'startQuiz') {
      if (String(lessonData.type ?? '') !== 'Test') {
        return res.status(409).json({ error:'The selected item is not an assessment.' });
      }
      const policyOrganizationId=candidateGuideOrganizationId||organizationId;
      const [platformSettingsSnap,scopedSettingsSnap]=await Promise.all([
        db.doc('system/settings').get(),
        policyOrganizationId
          ?db.doc(`organizations/${policyOrganizationId}/settings/settings`).get()
          :Promise.resolve(null),
      ]);
      const platformSettings=platformSettingsSnap.data()||{};
      const scopedSettings=scopedSettingsSnap?.exists?scopedSettingsSnap.data()||{}:{};
      // Match learner-facing settings inheritance: tenant values override only
      // keys that actually exist; otherwise the platform setting remains effective.
      const settingsData={...platformSettings,...scopedSettings};
      const policy=assessmentPolicy(lessonData,settingsData);
      if(policy.threshold===null)return res.status(409).json({error:'This assessment is unavailable until an administrator configures its pass mark.'});
      const effectiveGuideId=legacyStudyGuide?'discover':guideId;
      const sourceQuizId=String(lessonData.sourceQuizId||'').trim();
      let attemptQuestionSource=Array.isArray(lessonData.questions)
        ?lessonData.questions as QuestionRecord[]
        :Array.isArray(lessonData.quiz)?lessonData.quiz as QuestionRecord[]:[];
      if(sourceQuizId){
        if(!/^[A-Za-z0-9_-]{1,120}$/.test(sourceQuizId)||!useTenantGuide){
          return res.status(409).json({error:'The assessment source is invalid.'});
        }
        const quizSnap=await db.doc(`quizzes/${sourceQuizId}`).get();
        const quiz=quizSnap.data()||{};
        if(!quizSnap.exists||quiz.published!==true||quiz.archived===true
          ||String(quiz.guideId||'')!==guideId
          ||String(quiz.assessmentPath||'')!==lessonRef.path
          ||String(quiz.language||'')!==language
          ||String(quiz.organizationId||'')!==candidateGuideOrganizationId){
          return res.status(409).json({error:'This assessment is not available for a new attempt.'});
        }
        if(['chapter','section','block'].includes(String(quiz.attachmentType||''))){
          const parentId=String(quiz.lessonId||'');
          const anchorId=String(quiz.anchorId||'');
          if(!validStudyId(parentId)||!validStudyId(anchorId)
            ||String(lessonData.attachedLessonId||'')!==parentId
            ||String(lessonData.anchorId||'')!==anchorId){
            return res.status(409).json({error:'The assessment attachment has changed.'});
          }
          const parent=await guideRef.collection('lessons').doc(parentId).get();
          if(!parent.exists||parent.data()?.published!==true||parent.data()?.archived===true
            ||parent.data()?.type==='Test'
            ||!curriculumAnchorExists(parent.data()?.chapters,quiz.attachmentType,anchorId)){
            return res.status(409).json({error:'The assessment chapter, section or block is no longer published.'});
          }
        }
        attemptQuestionSource=Array.isArray(quiz.questions)
          ?quiz.questions as QuestionRecord[]
          :Array.isArray(quiz.quiz)?quiz.quiz as QuestionRecord[]:[];
      }
      const attemptQuestions=publicAttemptQuestions(attemptQuestionSource);
      if(!attemptQuestions){
        return res.status(409).json({
          error:'This assessment has no valid published questions. Ask the course administrator to republish the assessment.',
          code:'ASSESSMENT_CONFIGURATION',
        });
      }
      const scoreKey=`${policyOrganizationId||'platform'}:${language}:${effectiveGuideId}:${lessonId}`;
      const policyRef=userRef.collection('assessmentAttemptPolicy').doc(
        retakePolicyKey(policyOrganizationId,language,effectiveGuideId,lessonId));
      const historical=await userRef.collection('assessmentAttempts').where('lessonId','==',lessonId).limit(500).get();
      const relevant=historical.docs.filter(doc=>{
        const row=doc.data()||{};
        return String(row.organizationId||'')===policyOrganizationId
          &&String(row.language||'')===language&&String(row.guideId||'')===effectiveGuideId;
      });
      const sessionId=randomUUID();
      const sessionRef=userRef.collection('assessmentSessions').doc(sessionId);
      const startedAt=Date.now();
      const startedAtIso=new Date(startedAt).toISOString();
      const expiresAt=policy.timeLimitMinutes>0?startedAt+policy.timeLimitMinutes*60_000:0;
      const historicalLastAttemptMs=relevant.reduce((latest,doc)=>Math.max(latest,timestampMs(doc.data()?.createdAt)),0);
      const latestAttempt=relevant.reduce<FirebaseFirestore.QueryDocumentSnapshot|null>((latest,doc)=>{
        if(!latest)return doc;
        return timestampMs(doc.data()?.createdAt)>timestampMs(latest.data()?.createdAt)?doc:latest;
      },null);
      const reserved=await db.runTransaction(async transaction=>{
        const [currentPolicy,currentUser]=await Promise.all([
          transaction.get(policyRef),transaction.get(userRef),
        ]);
        const policyData=currentPolicy.data()||{};
        const priorAttempts=currentPolicy.exists
          ?Math.max(0,Number(policyData.attemptCount||0)):relevant.length;
        const lastAttemptMs=currentPolicy.exists?timestampMs(policyData.lastAttemptAt):historicalLastAttemptMs;
        if(policy.maxAttempts>0&&priorAttempts>=policy.maxAttempts){
          throw new Error(`Assessment attempt limit reached (${policy.maxAttempts} attempt${policy.maxAttempts===1?'':'s'}).`);
        }
        const retryAtMs=lastAttemptMs+policy.retakeCooldownMinutes*60_000;
        if(policy.retakeCooldownMinutes>0&&priorAttempts>0&&retryAtMs>startedAt){
          throw new Error(`Assessment retake is available after ${new Date(retryAtMs).toISOString()}.`);
        }
        const currentData=currentUser.data()||{};
        const progress=currentData.progress&&typeof currentData.progress==='object'
          ?currentData.progress as Record<string,unknown>:{};
        const scores=progress.guideScores&&typeof progress.guideScores==='object'
          ?progress.guideScores as Record<string,unknown>:{};
        const currentScore=Number(scores[scoreKey]);
        const hasCurrentScore=Number.isFinite(currentScore)&&currentScore>=0&&currentScore<=100;
        const isRetake=priorAttempts>0||hasCurrentScore;
        if(isRetake&&hasCurrentScore&&body.confirmRetake!==true){
          throw new Error(`Assessment retake confirmation required. The current score of ${Math.round(currentScore*100)/100}% and its earned credit will be revoked when the retake starts.`);
        }
        if(isRetake&&hasCurrentScore){
          const nextScores={...scores};
          delete nextScores[scoreKey];
          transaction.set(userRef,{
            progress:{...progress,guideScores:nextScores,updatedAt:FieldValue.serverTimestamp()},
            updatedAt:FieldValue.serverTimestamp(),
          },{merge:true});
          if(latestAttempt){
            transaction.set(latestAttempt.ref,{
              creditStatus:'revoked_for_retake',creditRevokedAt:FieldValue.serverTimestamp(),
              supersededBySessionId:sessionId,updatedAt:FieldValue.serverTimestamp(),
            },{merge:true});
          }
        }
        const attemptNumber=priorAttempts+1;
        transaction.set(policyRef,{
          organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
          attemptCount:attemptNumber,lastAttemptAt:startedAtIso,updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        transaction.set(sessionRef,{
          sessionId,organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
          attemptNumber,startedAt:startedAtIso,
          expiresAt:expiresAt?new Date(expiresAt).toISOString():null,
          previousScore:hasCurrentScore?currentScore:null,
          previousScoreRevoked:isRetake&&hasCurrentScore,
          consumed:false,createdAt:FieldValue.serverTimestamp(),
        });
        return {attemptNumber,priorAttempts,previousScore:hasCurrentScore?currentScore:null,previousScoreRevoked:isRetake&&hasCurrentScore};
      });
      return res.status(200).json({
        ok:true,sessionId,startedAt:startedAtIso,
        expiresAt:expiresAt?new Date(expiresAt).toISOString():null,
        questions:attemptQuestions,
        previousScore:reserved.previousScore,
        previousScoreRevoked:reserved.previousScoreRevoked,
        assessmentPolicy:{
          threshold:policy.threshold,maxAttempts:policy.maxAttempts||null,
          remainingAttempts:policy.maxAttempts>0?Math.max(0,policy.maxAttempts-reserved.attemptNumber):null,
          cooldownMinutes:policy.retakeCooldownMinutes,timeLimitMinutes:policy.timeLimitMinutes,
          feedbackMode:policy.feedbackMode,instructions:policy.instructions,
          attemptsUsed:reserved.attemptNumber,
        },
      });
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

      let certificateReview:Awaited<ReturnType<typeof ensureAutomaticGraduationReview>>|null=null;
      if(useTenantGuide&&guideId!=='discover'){
        try{
          certificateReview=await ensureAutomaticGraduationReview(db,decoded.uid,guideId,'system:lesson-completion');
        }catch(reviewError){
          // Study completion is authoritative even if a downstream review
          // notification/configuration is temporarily unavailable. A later
          // qualifying progress write or certificate-page read can retry.
          console.warn('Automatic certificate review could not be created after lesson completion',reviewError);
        }
      }
      return res.status(200).json({
        ok:true,
        completionKey:`${language}:${guideId}:${lessonId}`,
        certificateReview,
      });
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
    const score = gradeServerQuiz(questions, answers);

    if (score === null) {
      return res.status(400).json({ error: 'The assessment answers or question configuration are invalid.' });
    }

    const policyOrganizationId=candidateGuideOrganizationId||organizationId;
    // Submission must use the same settings inheritance as startQuiz:
    // platform defaults remain effective unless the organization explicitly
    // overrides a key. Previously, any organization settings document masked
    // the platform pass mark and caused a false 503 during submission.
    const [platformSettingsSnap,scopedSettingsSnap]=await Promise.all([
      db.doc('system/settings').get(),
      policyOrganizationId
        ?db.doc(`organizations/${policyOrganizationId}/settings/settings`).get()
        :Promise.resolve(null),
    ]);
    const platformSettings=platformSettingsSnap.data()||{};
    const scopedSettings=scopedSettingsSnap?.exists?scopedSettingsSnap.data()||{}:{};
    const settingsData={...platformSettings,...scopedSettings};
    const policy=assessmentPolicy(lessonData,settingsData);
    const threshold=policy.threshold;
    if (threshold === null) {
      return res.status(409).json({
        error:'This assessment is unavailable until an administrator configures its pass mark.',
        code:'ASSESSMENT_CONFIGURATION',
      });
    }
    const maxAttempts=policy.maxAttempts;
    const retakeCooldownMinutes=policy.retakeCooldownMinutes;
    const timeLimitMinutes=policy.timeLimitMinutes;
    const sessionId=String(body.sessionId||'').trim();
    const sessionRef=sessionId?userRef.collection('assessmentSessions').doc(sessionId):null;
    let sessionSnapshot=sessionRef?await sessionRef.get():null;
    if(!sessionSnapshot?.exists){
      return res.status(409).json({error:'Review the assessment instructions and start the attempt before submitting answers.'});
    }
    if(sessionSnapshot?.exists){
      const session=sessionSnapshot.data()||{};
      if(session.consumed===true
        ||String(session.organizationId||'')!==policyOrganizationId
        ||String(session.language||'')!==language
        ||String(session.guideId||'')!==(legacyStudyGuide?'discover':guideId)
        ||String(session.lessonId||'')!==lessonId){
        return res.status(409).json({error:'This assessment attempt session is not valid.'});
      }
      const expires=timestampMs(session.expiresAt);
      if(expires>0&&Date.now()>expires){
        return res.status(409).json({error:'The assessment time limit has expired. Start a permitted retake to try again.'});
      }
    }

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
    const passed = score >= threshold;
    const attemptId = randomUUID();
    const attemptRef = userRef.collection('assessmentAttempts').doc(attemptId);
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
      const transactionalSession = sessionRef ? await transaction.get(sessionRef) : null;
      if (!snapshot.exists) throw new Error('VOP account profile was not found.');
      if(!transactionalSession?.exists||transactionalSession.data()?.consumed===true){
        throw new Error('This assessment attempt has already been submitted or is no longer valid.');
      }
      const session=transactionalSession.data()||{};
      const attemptsUsed=Math.max(1,Math.trunc(Number(session.attemptNumber)||1));

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
        assessmentKind:String(lessonData.assessmentKind||'practice'),
        timeLimitMinutes,
        feedbackMode:policy.feedbackMode,
        questionResults,
        failedQuestionKeys: failedQuestions.map(item => item.key),
        attemptNumber: attemptsUsed,
        createdAt: FieldValue.serverTimestamp(),
      });

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
      transaction.set(sessionRef!,{consumed:true,consumedAt:FieldValue.serverTimestamp()},{merge:true});
      return { attemptsUsed };
    });

    let certificateReview:Awaited<ReturnType<typeof ensureAutomaticGraduationReview>>|null=null;
    if(useTenantGuide&&guideId!=='discover'){
      try{
        certificateReview=await ensureAutomaticGraduationReview(db,decoded.uid,guideId,'system:assessment-completion');
      }catch(reviewError){
        console.warn('Automatic certificate review could not be created after assessment completion',reviewError);
      }
    }

    // Per-question correctness is retained for authorized mentor analytics only.
    // Exposing failed keys lets clients reconstruct the answer bank by probing.
    const remainingAttempts = maxAttempts > 0 ? Math.max(0, maxAttempts - policyResult.attemptsUsed) : null;
    const retryAt = retakeCooldownMinutes > 0 && remainingAttempts !== 0
      ? new Date(attemptTimeMs + retakeCooldownMinutes * 60_000).toISOString()
      : null;
    return res.status(200).json({
      ok: true,
      score:policy.feedbackMode==='none'?null:score,
      passed:policy.feedbackMode==='none'?null:passed,
      scoreKey,threshold,timeLimitMinutes,feedbackMode:policy.feedbackMode,
      explanations:policy.feedbackMode==='after_submit'
        ?questions.map(question=>String((question as Record<string,unknown>).explanation||''))
        :undefined,
      certificateReview,
      retakePolicy: {
        attemptsUsed: policyResult.attemptsUsed,
        maxAttempts: maxAttempts || null,
        remainingAttempts,
        cooldownMinutes: retakeCooldownMinutes,
        retryAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Study progress could not be saved.';
    if (message === 'Server-side Firebase administration is not configured.') {
      console.warn('VOP study server configuration is unavailable:', message);
      return res.status(503).json({ error: message, code:'SERVER_CONFIGURATION' });
    }
    if (message.includes('not configured')) {
      console.warn('VOP study configuration is unavailable:', message);
      return res.status(409).json({ error: message, code:'ASSESSMENT_CONFIGURATION' });
    }
    if (message.includes('Assessment attempt limit reached')) {
      return res.status(409).json({error:message,code:'ASSESSMENT_ATTEMPT_LIMIT'});
    }
    if (message.includes('Assessment retake confirmation required')) {
      return res.status(409).json({error:message,code:'ASSESSMENT_RETAKE_CONFIRMATION'});
    }
    if (message.includes('Assessment retake is available after')) {
      return res.status(409).json({error:message,code:'ASSESSMENT_RETAKE_COOLDOWN'});
    }
    if (message.includes('Complete all published study lessons')
        || message.includes('already been submitted')
        || message.includes('attempt session')) return res.status(409).json({error:message,code:'ASSESSMENT_POLICY'});
    if (message.includes('profile was not found')) return res.status(404).json({ error: message });
    console.error('VOP study progress sync failed', error);
    return res.status(500).json({ error: 'Study progress could not be saved.' });
  }
}
