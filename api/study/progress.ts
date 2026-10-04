import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { configuredPassThreshold, validStudyId, validStudyLanguage } from '../../shared/studyValidation.js';
import { curriculumAnchorExists, curriculumPages } from '../../shared/curriculumStructure.js';
import { ensureAutomaticGraduationReview } from '../../server/graduationAutomation.js';
import {ensureAutomaticProgramGraduationReviews} from '../../server/programGraduationAutomation.js';
import {organizationPointRules,pointKindForAssessment} from '../../server/engagementPoints.js';
import {awardApprovedCertificate,awardApprovedProgramCertificate} from '../../server/certificateAward.js';
import {createNotification} from '../../server/notifications.js';

const ASSESSMENT_ATTEMPT_POLICY_VERSION = 2;

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
  id?: unknown;
  question?: unknown;
  prompt?: unknown;
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
async function finalizeAutomaticCertificateRelease(
  db:FirebaseFirestore.Firestore,
  candidateId:string,
  guideId:string,
  guideReview:{status?:string}|null,
  programReviews:Array<{status?:string;programId?:string}>,
  createdBy:string,
){
  if(guideReview?.status==='approved'){
    try{
      const award=await awardApprovedCertificate(db,candidateId,createdBy,guideId);
      if(award.created){
        const candidate=await db.doc(`users/${candidateId}`).get();
        const organizationId=String(candidate.data()?.organizationId||'').trim();
        await createNotification(db,{
          organizationId,recipientId:candidateId,type:'certificate',
          title:'Certificate awarded',
          body:'Your course certificate was issued automatically after all completion and assessment requirements were verified.',
          actionUrl:'/certificates',
          metadata:{source:'automatic-certificate-release',guideId},
          createdBy,
        });
      }
    }catch(error){
      console.error('Automatic guide certificate release failed',error);
    }
  }
  for(const review of programReviews){
    const programId=String(review.programId||'').trim();
    if(review.status!=='approved'||!programId)continue;
    try{
      const award=await awardApprovedProgramCertificate(db,candidateId,createdBy,programId);
      if(award.created){
        const candidate=await db.doc(`users/${candidateId}`).get();
        const organizationId=String(candidate.data()?.organizationId||'').trim();
        await createNotification(db,{
          organizationId,recipientId:candidateId,type:'certificate',
          title:'Program certificate awarded',
          body:'Your program certificate was issued automatically after every required guide, lesson and assessment was verified.',
          actionUrl:'/certificates',
          metadata:{source:'automatic-program-certificate-release',programId},
          createdBy,
        });
      }
    }catch(error){
      console.error('Automatic program certificate release failed',error);
    }
  }
}

function assessmentPolicy(lesson:Record<string,unknown>,settings:Record<string,unknown>){
  const configured=configuredPassThreshold(lesson.assessmentPassThreshold)
    ?? configuredPassThreshold(settings.quizPassThreshold);
  const organizationMaxAttempts=nonNegativeWhole(settings.quizMaxAttempts,100);
  const explicitAttemptOverride=String(lesson.assessmentMaxAttemptsMode||'')==='custom';
  return {
    threshold:configured,
    // Legacy assessmentMaxAttempts values are not authoritative by themselves.
    // Only an explicitly marked custom policy may override the live organization
    // setting. This prevents stale per-assessment values (for example 1) from
    // defeating an organization-wide 0 = unlimited policy.
    maxAttempts:explicitAttemptOverride
      ?positiveOverride(lesson.assessmentMaxAttempts,organizationMaxAttempts,100)
      :organizationMaxAttempts,
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

function object(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

function activeAssessmentSession(
  value:Record<string,unknown>,
  expected:{organizationId:string;language:string;guideId:string;lessonId:string},
  now:number,
){
  if(value.consumed===true||String(value.status||'active')!=='active')return false;
  if(String(value.organizationId||'')!==expected.organizationId
    ||String(value.language||'')!==expected.language
    ||String(value.guideId||'')!==expected.guideId
    ||String(value.lessonId||'')!==expected.lessonId)return false;
  const resumeUntil=timestampMs(value.resumeUntil)||timestampMs(value.expiresAt);
  return resumeUntil<=0||resumeUntil>now;
}

function storedSubmissionPayload(value:unknown){
  const stored=object(value);
  const score=Number(stored.score);
  const threshold=Number(stored.threshold);
  const feedbackMode=['score_only','after_submit','none'].includes(String(stored.feedbackMode||''))
    ?String(stored.feedbackMode):'score_only';
  const attemptsUsed=Math.max(1,Math.trunc(Number(stored.attemptsUsed)||1));
  const maxAttempts=Number.isInteger(Number(stored.maxAttempts))&&Number(stored.maxAttempts)>0
    ?Number(stored.maxAttempts):null;
  const hasRemainingAttempts=stored.remainingAttempts!==null&&stored.remainingAttempts!==undefined&&stored.remainingAttempts!=='';
  const remainingAttempts=hasRemainingAttempts&&Number.isInteger(Number(stored.remainingAttempts))&&Number(stored.remainingAttempts)>=0
    ?Number(stored.remainingAttempts):null;
  if(!Number.isFinite(score)||score<0||score>100||!Number.isFinite(threshold)||threshold<1||threshold>100)return null;
  return {
    score:feedbackMode==='none'?null:score,
    passed:feedbackMode==='none'?null:stored.passed===true,
    threshold,
    timeLimitMinutes:Math.max(0,Math.trunc(Number(stored.timeLimitMinutes)||0)),
    feedbackMode,
    explanations:feedbackMode==='after_submit'&&Array.isArray(stored.explanations)
      ?stored.explanations.map(String):undefined,
    retakePolicy:{
      attemptsUsed,maxAttempts,remainingAttempts,
      cooldownMinutes:Math.max(0,Math.trunc(Number(stored.cooldownMinutes)||0)),
      retryAt:typeof stored.retryAt==='string'&&stored.retryAt?stored.retryAt:null,
    },
  };
}

export default async function handler(
  req: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown },
  res: { status: (n: number) => unknown; json: (v: unknown) => void },
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  let requestedAction='';
  try {
    const firebaseAdmin = admin();
    const authorization = header(req, 'authorization');
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first.' });

    const decoded = await getAuth(firebaseAdmin).verifyIdToken(authorization.slice(7).trim());
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const action = String(body.action ?? '').trim();
    requestedAction=action;
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
      if(action==='startQuiz'||action==='submitQuiz')return res.status(200).json({
        ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',
        error:'This assessment belongs to a different study language. Reopen it from the current course.',
      });
      return res.status(400).json({ error: 'The selected guide language does not match the study request.' });
    }
    if (!lessonSnapshot.exists || lessonSnapshot.data()?.published !== true || lessonSnapshot.data()?.archived === true) {
      return res.status(404).json({ error: 'The selected lesson is not published.' });
    }

    const lessonData = lessonSnapshot.data() ?? {};
    const legacyStudyGuide = !useTenantGuide && guideId === 'discover';
    if (!legacyStudyGuide && String(lessonData.guideId ?? '') !== guideId) {
      if(action==='startQuiz'||action==='submitQuiz')return res.status(200).json({
        ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',
        error:'This assessment is no longer attached to the selected guide. Reopen the course to refresh the published content.',
      });
      return res.status(400).json({ error: 'The lesson does not belong to the selected guide.' });
    }
    const platformGuide = useTenantGuide && candidateGuideShared
      && (!candidateGuideOrganizationId || String(candidateGuideData.scope || '') === 'platform');
    if (useTenantGuide && candidateGuideOrganizationId !== organizationId && !enrolledForGuide
        && !platformGuide && (lessonData.sharingScope !== 'shared' || lessonData.archived === true)) {
      return res.status(403).json({ error: 'This lesson is not shared with your organization.' });
    }

    if (action === 'startQuiz') {
      if (String(lessonData.type ?? '') !== 'Test') {
        return res.status(200).json({
          ok:false,available:false,code:'ASSESSMENT_TYPE',
          error:'The selected item is not an assessment.',
        });
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
      if(policy.threshold===null)return res.status(200).json({
        ok:false,available:false,
        error:'This assessment is unavailable until an administrator configures its pass mark.',
        code:'ASSESSMENT_CONFIGURATION',
      });
      const effectiveGuideId=legacyStudyGuide?'discover':guideId;
      const sourceQuizId=String(lessonData.sourceQuizId||'').trim();
      let attemptQuestionSource=Array.isArray(lessonData.questions)
        ?lessonData.questions as QuestionRecord[]
        :Array.isArray(lessonData.quiz)?lessonData.quiz as QuestionRecord[]:[];
      if(sourceQuizId){
        if(!/^[A-Za-z0-9_-]{1,120}$/.test(sourceQuizId)||!useTenantGuide){
          return res.status(200).json({
            ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',
            error:'The published assessment source is invalid. Ask the course administrator to republish the assessment.',
          });
        }
        const quizSnap=await db.doc(`quizzes/${sourceQuizId}`).get();
        const quiz=quizSnap.data()||{};
        if(!quizSnap.exists||quiz.published!==true||quiz.archived===true
          ||String(quiz.guideId||'')!==guideId
          ||String(quiz.assessmentPath||'')!==lessonRef.path
          ||String(quiz.language||'')!==language
          ||String(quiz.organizationId||'')!==candidateGuideOrganizationId){
          return res.status(200).json({
            ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',
            error:'This assessment changed after the course was published. Ask the course administrator to republish it before starting a new attempt.',
          });
        }
        if(['chapter','section','block'].includes(String(quiz.attachmentType||''))){
          const parentId=String(quiz.lessonId||'');
          const anchorId=String(quiz.anchorId||'');
          if(!validStudyId(parentId)||!validStudyId(anchorId)
            ||String(lessonData.attachedLessonId||'')!==parentId
            ||String(lessonData.anchorId||'')!==anchorId){
            return res.status(200).json({
              ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',
              error:'The assessment attachment changed after publication. Ask the course administrator to republish it.',
            });
          }
          const parent=await guideRef.collection('lessons').doc(parentId).get();
          if(!parent.exists||parent.data()?.published!==true||parent.data()?.archived===true
            ||parent.data()?.type==='Test'
            ||!curriculumAnchorExists(parent.data()?.chapters,quiz.attachmentType,anchorId)){
            return res.status(200).json({
              ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',
              error:'The chapter, section or block for this assessment is no longer published. Reopen the course after it is republished.',
            });
          }
        }
        attemptQuestionSource=Array.isArray(quiz.questions)
          ?quiz.questions as QuestionRecord[]
          :Array.isArray(quiz.quiz)?quiz.quiz as QuestionRecord[]:[];
      }
      const attemptQuestions=publicAttemptQuestions(attemptQuestionSource);
      if(!attemptQuestions){
        return res.status(200).json({
          ok:false,available:false,
          error:'This assessment has no valid published questions. Ask the course administrator to republish the assessment.',
          code:'ASSESSMENT_CONFIGURATION',
        });
      }
      const finalExamAtStart=lessonData.assessmentKind==='final_exam'&&lessonData.attachmentType==='guide';
      let finalRequirementsAtStart:string[]=[];
      if(finalExamAtStart){
        const publishedLessons=(await guideRef.collection('lessons').get()).docs
          .filter(doc=>doc.data().type!=='Test'&&doc.data().published===true&&doc.data().archived!==true);
        if(!publishedLessons.length){
          return res.status(200).json({
            ok:false,available:false,code:'ASSESSMENT_CONFIGURATION',
            error:'This final examination cannot start because the guide has no published study lessons.',
          });
        }
        finalRequirementsAtStart=publishedLessons.map(doc=>`${language}:${guideId}:${doc.id}`);
        const completedLessons=Array.isArray(userData.progress?.completedLessons)
          ?new Set(userData.progress.completedLessons.map((value:unknown)=>String(value))):new Set<string>();
        const remaining=finalRequirementsAtStart.filter(key=>!completedLessons.has(key));
        if(remaining.length){
          return res.status(200).json({
            ok:false,available:false,code:'ASSESSMENT_PREREQUISITE',
            error:`Complete all published study lessons before taking the final guide examination. ${remaining.length} lesson${remaining.length===1?' remains':'s remain'}.`,
            remainingPrerequisites:remaining.length,totalPrerequisites:publishedLessons.length,
          });
        }
      }

      const scoreKey=`${policyOrganizationId||'platform'}:${language}:${effectiveGuideId}:${lessonId}`;
      const graduationRef=policyOrganizationId&&useTenantGuide&&guideId!=='discover'
        ?db.doc('graduationRequests/grad-'+createHash('sha256')
          .update(policyOrganizationId+':'+decoded.uid+':'+guideId).digest('hex').slice(0,48))
        :null;
      const policyRef=userRef.collection('assessmentAttemptPolicy').doc(
        retakePolicyKey(policyOrganizationId,language,effectiveGuideId,lessonId));
      const historical=await userRef.collection('assessmentAttempts').where('lessonId','==',lessonId).limit(500).get();
      const relevant=historical.docs.filter(doc=>{
        const row=doc.data()||{};
        return String(row.organizationId||'')===policyOrganizationId
          &&String(row.language||'')===language&&String(row.guideId||'')===effectiveGuideId;
      });
      const newSessionId=randomUUID();
      const newSessionRef=userRef.collection('assessmentSessions').doc(newSessionId);
      const startedAt=Date.now();
      const startedAtIso=new Date(startedAt).toISOString();
      const expiresAt=policy.timeLimitMinutes>0?startedAt+policy.timeLimitMinutes*60_000:0;
      // Untimed assessments are still resumable for a bounded period. This prevents
      // a lost response, refresh, device sleep or accidental double click from
      // consuming another attempt while also avoiding immortal abandoned sessions.
      const resumeUntil=expiresAt||startedAt+24*60*60*1000;
      const historicalLastAttemptMs=relevant.reduce((latest,doc)=>Math.max(latest,timestampMs(doc.data()?.createdAt)),0);
      const latestAttempt=relevant.reduce((latest,doc)=>{
        if(!latest)return doc;
        return timestampMs(doc.data()?.createdAt)>timestampMs(latest.data()?.createdAt)?doc:latest;
      },null as (typeof relevant)[number]|null);
      const expectedSession={
        organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
      };
      const reserved=await db.runTransaction(async transaction=>{
        const currentPolicy=await transaction.get(policyRef);
        const currentUser=await transaction.get(userRef);
        const graduationRequest=graduationRef?await transaction.get(graduationRef):null;
        const policyData=currentPolicy.data()||{};

        const activeSessionId=String(policyData.activeSessionId||'').trim();
        if(activeSessionId){
          const activeRef=userRef.collection('assessmentSessions').doc(activeSessionId);
          const active=await transaction.get(activeRef);
          const activeData=active.data()||{};
          if(active.exists&&activeAssessmentSession(activeData,expectedSession,startedAt)
            &&Array.isArray(activeData.questionsSnapshot)&&activeData.questionsSnapshot.length){
            const activePolicy=object(activeData.assessmentPolicySnapshot);
            const activeAttemptNumber=Math.max(1,Math.trunc(Number(activeData.attemptNumber)||1));
            return {
              resumed:true,
              sessionId:activeSessionId,
              attemptNumber:activeAttemptNumber,
              previousScore:Number.isFinite(Number(activeData.previousScore))?Number(activeData.previousScore):null,
              previousScoreRevoked:activeData.previousScoreRevoked===true,
              startedAt:String(activeData.startedAt||startedAtIso),
              expiresAt:String(activeData.expiresAt||'')||null,
              questions:activeData.questionsSnapshot as QuestionRecord[],
              assessmentPolicy:{
                threshold:Number(activePolicy.threshold)||policy.threshold,
                maxAttempts:Number(activePolicy.maxAttempts)>0?Number(activePolicy.maxAttempts):null,
                remainingAttempts:Number.isInteger(Number(activePolicy.remainingAttempts))&&Number(activePolicy.remainingAttempts)>=0
                  ?Number(activePolicy.remainingAttempts):null,
                cooldownMinutes:Math.max(0,Math.trunc(Number(activePolicy.cooldownMinutes)||0)),
                timeLimitMinutes:Math.max(0,Math.trunc(Number(activePolicy.timeLimitMinutes)||0)),
                feedbackMode:['score_only','after_submit','none'].includes(String(activePolicy.feedbackMode||''))
                  ?String(activePolicy.feedbackMode):policy.feedbackMode,
                instructions:String(activePolicy.instructions||''),
                attemptsUsed:activeAttemptNumber,
              },
            };
          }
        }

        // Version 2 makes the policy document authoritative only after it has
        // been written by the session-based attempt lifecycle. Older policy
        // documents may contain counters left by pre-session implementations or
        // interrupted starts. Reconcile those once from immutable submitted
        // attempt records instead of permanently locking a learner out.
        const storedPolicyVersion=Math.max(0,Math.trunc(Number(policyData.policyVersion)||0));
        const legacyPolicy=currentPolicy.exists&&storedPolicyVersion<ASSESSMENT_ATTEMPT_POLICY_VERSION;
        const priorAttempts=currentPolicy.exists&&!legacyPolicy
          ?Math.max(0,Number(policyData.attemptCount||0)):relevant.length;
        const lastAttemptMs=currentPolicy.exists&&!legacyPolicy
          ?timestampMs(policyData.lastAttemptAt):historicalLastAttemptMs;
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
        if(finalExamAtStart){
          const completed=new Set(Array.isArray(progress.completedLessons)?progress.completedLessons.map(String):[]);
          if(finalRequirementsAtStart.some(key=>!completed.has(key))){
            throw new Error('Complete all published study lessons before taking the final guide examination.');
          }
        }
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
          const information=currentData.information&&typeof currentData.information==='object'
            ?currentData.information as Record<string,unknown>:{};
          transaction.set(userRef,{
            progress:{...progress,guideScores:nextScores,updatedAt:FieldValue.serverTimestamp()},
            information:{...information,graduating:false},
            updatedAt:FieldValue.serverTimestamp(),
          },{merge:true});
          if(latestAttempt){
            transaction.set(latestAttempt.ref,{
              creditStatus:'revoked_for_retake',creditRevokedAt:FieldValue.serverTimestamp(),
              supersededBySessionId:newSessionId,updatedAt:FieldValue.serverTimestamp(),
            },{merge:true});
          }
          if(graduationRequest?.exists){
            const review=graduationRequest.data()||{};
            const reviewStatus=String(review.status||'').trim();
            if(reviewStatus&&reviewStatus!=='approved'&&reviewStatus!=='rejected'){
              const decisions=Array.isArray(review.decisions)?review.decisions.slice():[];
              decisions.push({
                stageId:'system_retake',stageLabel:'Assessment retake',
                decision:'rejected',
                notes:'Eligibility was revoked automatically because the learner started a new assessment attempt.',
                approverUid:'system:retake',approverRole:'system',decidedAt:startedAtIso,
              });
              transaction.set(graduationRequest.ref,{
                status:'rejected',rejectionReason:'assessment_retake',
                eligibilityRevokedAt:FieldValue.serverTimestamp(),
                supersededBySessionId:newSessionId,approverNotes:'Eligibility revoked by assessment retake.',
                decisions,revision:Math.max(1,Number(review.revision||0)+1),
                approvedAt:null,updatedAt:FieldValue.serverTimestamp(),
              },{merge:true});
            }
          }
        }
        const attemptNumber=priorAttempts+1;
        const remainingAttempts=policy.maxAttempts>0?Math.max(0,policy.maxAttempts-attemptNumber):null;
        const policySnapshot={
          threshold:policy.threshold,maxAttempts:policy.maxAttempts||null,remainingAttempts,
          cooldownMinutes:policy.retakeCooldownMinutes,timeLimitMinutes:policy.timeLimitMinutes,
          feedbackMode:policy.feedbackMode,instructions:policy.instructions,attemptsUsed:attemptNumber,
        };
        transaction.set(policyRef,{
          organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
          policyVersion:ASSESSMENT_ATTEMPT_POLICY_VERSION,
          attemptCount:attemptNumber,lastAttemptAt:startedAtIso,activeSessionId:newSessionId,
          activeSessionStartedAt:startedAtIso,activeSessionResumeUntil:new Date(resumeUntil).toISOString(),
          ...(legacyPolicy?{legacyCounterReconciledAt:FieldValue.serverTimestamp()} : {}),
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        transaction.set(newSessionRef,{
          sessionId:newSessionId,organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
          attemptNumber,status:'active',startedAt:startedAtIso,
          expiresAt:expiresAt?new Date(expiresAt).toISOString():null,
          resumeUntil:new Date(resumeUntil).toISOString(),
          previousScore:hasCurrentScore?currentScore:null,
          previousScoreRevoked:isRetake&&hasCurrentScore,
          consumed:false,
          questionsSnapshot:attemptQuestions,
          // Private server-only snapshot pins the grading key to the exact
          // assessment revision that was opened. Firestore rules deny all
          // client access to assessmentSessions.
          gradingQuestionsSnapshot:attemptQuestionSource,
          assessmentPolicySnapshot:policySnapshot,
          createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
        });
        return {
          resumed:false,sessionId:newSessionId,attemptNumber,
          previousScore:hasCurrentScore?currentScore:null,
          previousScoreRevoked:isRetake&&hasCurrentScore,
          startedAt:startedAtIso,expiresAt:expiresAt?new Date(expiresAt).toISOString():null,
          questions:attemptQuestions,assessmentPolicy:policySnapshot,
        };
      });
      return res.status(200).json({
        ok:true,
        resumed:reserved.resumed,
        sessionId:reserved.sessionId,
        startedAt:reserved.startedAt,
        expiresAt:reserved.expiresAt,
        questions:reserved.questions,
        previousScore:reserved.previousScore,
        previousScoreRevoked:reserved.previousScoreRevoked,
        assessmentPolicy:reserved.assessmentPolicy,
      });
    }

    if (action === 'saveLessonResume') {
      if (String(lessonData.type ?? 'Lesson') !== 'Lesson') {
        return res.status(400).json({ error: 'Only study lessons support resume positions.' });
      }
      const pageIndex = Number(body.pageIndex);
      const structuredPages = Array.isArray(lessonData.chapters)
        ? curriculumPages(lessonData.chapters as Parameters<typeof curriculumPages>[0])
        : [];
      const canonicalPageCount = structuredPages.length || (Array.isArray(lessonData.contentPages) ? lessonData.contentPages.length : 0);
      const maxPageIndex = canonicalPageCount - 1;
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || canonicalPageCount < 1 || pageIndex > maxPageIndex) {
        return res.status(400).json({ error: 'A valid published lesson page position is required.' });
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
        return res.status(400).json({ error: 'Only study lessons can be marked complete.' });
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
          const programReviews=await ensureAutomaticProgramGraduationReviews(db,decoded.uid,guideId,'system:program-lesson-completion');
          await finalizeAutomaticCertificateRelease(db,decoded.uid,guideId,certificateReview,programReviews,'system:lesson-completion');
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
      return res.status(200).json({ ok:false,available:false,error:'The selected item is not an assessment.',code:'ASSESSMENT_TYPE' });
    }

    const policyOrganizationId=candidateGuideOrganizationId||organizationId;
    const effectiveGuideId=legacyStudyGuide?'discover':guideId;
    const scoreKey=`${policyOrganizationId||'platform'}:${language}:${effectiveGuideId}:${lessonId}`;
    const sessionId=String(body.sessionId||'').trim();
    const sessionRef=sessionId?userRef.collection('assessmentSessions').doc(sessionId):null;
    const sessionSnapshot=sessionRef?await sessionRef.get():null;
    if(!sessionSnapshot?.exists){
      return res.status(409).json({
        error:'Review the assessment instructions and start the attempt before submitting answers.',
        code:'ASSESSMENT_SESSION_REQUIRED',
      });
    }
    const sessionData=sessionSnapshot.data()||{};
    const sessionMatches=String(sessionData.organizationId||'')===policyOrganizationId
      &&String(sessionData.language||'')===language
      &&String(sessionData.guideId||'')===effectiveGuideId
      &&String(sessionData.lessonId||'')===lessonId;
    if(!sessionMatches){
      return res.status(409).json({error:'This assessment attempt session is not valid for the selected assessment.',code:'ASSESSMENT_SESSION_INVALID'});
    }
    if(sessionData.consumed===true){
      const replay=storedSubmissionPayload(sessionData.submissionResult);
      if(replay){
        return res.status(200).json({
          ok:true,replayed:true,scoreKey,...replay,certificateReview:null,
        });
      }
      return res.status(409).json({error:'This assessment attempt was already submitted.',code:'ASSESSMENT_SESSION_CONSUMED'});
    }
    const sessionDeadline=timestampMs(sessionData.expiresAt)||timestampMs(sessionData.resumeUntil);
    if(sessionDeadline>0&&Date.now()>sessionDeadline){
      return res.status(409).json({
        error:'This assessment attempt has expired. Start a permitted retake to try again.',
        code:'ASSESSMENT_SESSION_EXPIRED',
      });
    }

    const answers = body.answers && typeof body.answers === 'object'
      ? body.answers as Record<string, unknown>
      : {};
    // The learner-readable assessment only contains prompts and options.
    // Grade using the private quiz bank, never trust client-provided keys.
    const sourceQuizId = String(lessonData.sourceQuizId || '').trim();
    const pinnedQuestions=Array.isArray(sessionData.gradingQuestionsSnapshot)
      ?sessionData.gradingQuestionsSnapshot as QuestionRecord[]:null;
    let gradeable: Record<string, unknown> = pinnedQuestions?{questions:pinnedQuestions}:lessonData;
    // Legacy sessions created before grading snapshots existed fall back to the
    // currently published private bank. New sessions always grade the immutable
    // server-only snapshot captured when the attempt was opened.
    if (!pinnedQuestions && sourceQuizId) {
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(sourceQuizId) || !useTenantGuide) {
        return res.status(200).json({ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',error:'The assessment source is invalid. Reopen the course after the assessment is republished.'});
      }
      const quizSnap = await db.doc(`quizzes/${sourceQuizId}`).get();
      const quiz = quizSnap.data() || {};
      if (!quizSnap.exists
        || quiz.published !== true || quiz.archived === true
        || String(quiz.guideId || '') !== guideId
        || String(quiz.assessmentPath || '') !== lessonRef.path
        || String(quiz.language || '') !== language
        || String(quiz.organizationId || '') !== candidateGuideOrganizationId
      ) return res.status(200).json({ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',error:'This assessment is no longer available for grading. Reopen the course after it is republished.'});
      // A chapter/section/block quiz must still reference a published,
      // currently existing part of the same study lesson.
      if (['chapter','section','block'].includes(String(quiz.attachmentType||''))) {
        const parentId = String(quiz.lessonId || '');
        const anchorId = String(quiz.anchorId || '');
        if (!validStudyId(parentId) || !validStudyId(anchorId) ||
            String(lessonData.attachedLessonId || '') !== parentId ||
            String(lessonData.anchorId || '') !== anchorId) {
          return res.status(200).json({ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',error:'The assessment attachment has changed. Reopen the course after it is republished.'});
        }
        const parent = await guideRef.collection('lessons').doc(parentId).get();
        if (!parent.exists || parent.data()?.published !== true || parent.data()?.archived === true ||
            parent.data()?.type === 'Test' ||
            !curriculumAnchorExists(parent.data()?.chapters,quiz.attachmentType,anchorId)) {
          return res.status(200).json({ok:false,available:false,code:'ASSESSMENT_CONTENT_CHANGED',error:'The assessment chapter, section or block is no longer published. Reopen the course after it is republished.'});
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

    const storedPolicy=object(sessionData.assessmentPolicySnapshot);
    const storedThreshold=configuredPassThreshold(storedPolicy.threshold);
    let policy:ReturnType<typeof assessmentPolicy>;
    if(storedThreshold!==null){
      policy={
        threshold:storedThreshold,
        maxAttempts:nonNegativeWhole(storedPolicy.maxAttempts,100),
        retakeCooldownMinutes:nonNegativeWhole(storedPolicy.cooldownMinutes,10080),
        timeLimitMinutes:nonNegativeWhole(storedPolicy.timeLimitMinutes,1440),
        feedbackMode:['score_only','after_submit','none'].includes(String(storedPolicy.feedbackMode||''))
          ?String(storedPolicy.feedbackMode):'score_only',
        instructions:String(storedPolicy.instructions||'').trim().slice(0,5000),
      };
    }else{
      // Compatibility path for sessions created before policy snapshots were
      // introduced. Current sessions never change pass mark mid-attempt.
      const [platformSettingsSnap,scopedSettingsSnap]=await Promise.all([
        db.doc('system/settings').get(),
        policyOrganizationId
          ?db.doc(`organizations/${policyOrganizationId}/settings/settings`).get()
          :Promise.resolve(null),
      ]);
      const platformSettings=platformSettingsSnap.data()||{};
      const scopedSettings=scopedSettingsSnap?.exists?scopedSettingsSnap.data()||{}:{};
      policy=assessmentPolicy(lessonData,{...platformSettings,...scopedSettings});
    }
    const threshold=policy.threshold;
    if(threshold===null){
      return res.status(200).json({
        ok:false,available:false,
        error:'This assessment is unavailable until an administrator configures its pass mark.',
        code:'ASSESSMENT_CONFIGURATION',
      });
    }
    const maxAttempts=policy.maxAttempts;
    const retakeCooldownMinutes=policy.retakeCooldownMinutes;
    const timeLimitMinutes=policy.timeLimitMinutes;

    const finalExam = lessonData.assessmentKind === 'final_exam' && lessonData.attachmentType === 'guide';
    const finalRequirements = finalExam ? (await guideRef.collection('lessons').get()).docs
      .filter(doc => doc.data().type !== 'Test' && doc.data().published === true && doc.data().archived !== true)
      .map(doc => `${language}:${guideId}:${doc.id}`) : [];
    if (finalExam && (!finalRequirements.length || finalRequirements.some(key =>
      !Array.isArray(userData.progress?.completedLessons) || !userData.progress.completedLessons.includes(key)))) {
      return res.status(200).json({
        ok:false,available:false,code:'ASSESSMENT_PREREQUISITE',
        error:'Complete all published study lessons before taking the final guide examination.',
      });
    }
    const passed = score >= threshold;
    // One attempt document per server-started session makes submission
    // naturally idempotent across retries and concurrent duplicate requests.
    const attemptId=sessionId;
    const attemptRef = userRef.collection('assessmentAttempts').doc(attemptId);
    const assessmentPointKind=pointKindForAssessment(lessonData.assessmentKind);
    const pointRules=await organizationPointRules(db,policyOrganizationId);
    const assessmentPoints=pointRules[assessmentPointKind];
    const pointsLedgerRef=userRef.collection('pointsLedger').doc(`${assessmentPointKind}-${attemptId}`);
    const policyRef = userRef.collection('assessmentAttemptPolicy').doc(
      retakePolicyKey(policyOrganizationId, language, effectiveGuideId, lessonId),
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

    const remainingAttemptsForAttempt=maxAttempts>0
      ?Math.max(0,maxAttempts-Math.max(1,Math.trunc(Number(sessionData.attemptNumber)||1))):null;
    const retryAtForAttempt=retakeCooldownMinutes>0&&remainingAttemptsForAttempt!==0
      ?new Date(attemptTimeMs+retakeCooldownMinutes*60_000).toISOString():null;
    const storedResult={
      score,passed,threshold,timeLimitMinutes,feedbackMode:policy.feedbackMode,
      ...(policy.feedbackMode==='after_submit'
        ?{explanations:questions.map(question=>String((question as Record<string,unknown>).explanation||''))}
        :{}),
      attemptsUsed:Math.max(1,Math.trunc(Number(sessionData.attemptNumber)||1)),
      maxAttempts:maxAttempts||null,remainingAttempts:remainingAttemptsForAttempt,
      cooldownMinutes:retakeCooldownMinutes,retryAt:retryAtForAttempt,
      submittedAt:attemptTimeIso,
    };

    const policyResult = await db.runTransaction(async transaction => {
      const [snapshot,transactionalSession,pointsLedger]=await Promise.all([
        transaction.get(userRef),
        sessionRef?transaction.get(sessionRef):Promise.resolve(null),
        transaction.get(pointsLedgerRef),
      ]);
      if (!snapshot.exists) throw new Error('VOP account profile was not found.');
      if(!transactionalSession?.exists)throw new Error('This assessment attempt session is no longer valid.');
      const transactionalSessionData=transactionalSession.data()||{};
      if(transactionalSessionData.consumed===true){
        const replay=storedSubmissionPayload(transactionalSessionData.submissionResult);
        if(replay)return {attemptsUsed:replay.retakePolicy.attemptsUsed,replayed:true,replay};
        throw new Error('This assessment attempt has already been submitted or is no longer valid.');
      }
      if(String(transactionalSessionData.organizationId||'')!==policyOrganizationId
        ||String(transactionalSessionData.language||'')!==language
        ||String(transactionalSessionData.guideId||'')!==effectiveGuideId
        ||String(transactionalSessionData.lessonId||'')!==lessonId){
        throw new Error('This assessment attempt session is no longer valid.');
      }
      const transactionalDeadline=timestampMs(transactionalSessionData.expiresAt)||timestampMs(transactionalSessionData.resumeUntil);
      if(transactionalDeadline>0&&Date.now()>transactionalDeadline){
        throw new Error('This assessment attempt session has expired.');
      }
      const attemptsUsed=Math.max(1,Math.trunc(Number(transactionalSessionData.attemptNumber)||1));

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
        ...(!pointsLedger.exists&&assessmentPoints>0?{engagementPoints:FieldValue.increment(assessmentPoints)}:{}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if(!pointsLedger.exists){
        transaction.create(pointsLedgerRef,{
          kind:assessmentPointKind,eventId:attemptId,points:assessmentPoints,
          organizationId:policyOrganizationId,assessmentId:lessonId,guideId:effectiveGuideId,
          awardedAt:FieldValue.serverTimestamp(),
        });
      }

      transaction.set(attemptRef, {
        candidateId: decoded.uid,userId: decoded.uid,sessionId,
        score,passed,threshold,creditStatus:'active',
        organizationId:policyOrganizationId,language,guideId:effectiveGuideId,lessonId,
        assessmentKind:String(lessonData.assessmentKind||'practice'),
        timeLimitMinutes,feedbackMode:policy.feedbackMode,
        questionResults,failedQuestionKeys:failedQuestions.map(item=>item.key),
        attemptNumber:attemptsUsed,createdAt:FieldValue.serverTimestamp(),
      },{merge:false});

      for (let index = 0; index < failureRefs.length; index += 1) {
        const failure = failedQuestions[index];
        const ref = failureRefs[index];
        transaction.set(ref, {
          key: failure.key,question: failure.question,organizationId:policyOrganizationId,
          language,guideId,lessonId,failedCount:FieldValue.increment(1),
          answeredCount:FieldValue.increment(1),lastFailedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const successRefs = questionResults.filter(item => item.correct).map(item =>
        db.collection('questionPerformance').doc(
          `${policyOrganizationId || 'platform'}__${language}__${guideId}__${lessonId}__${item.key}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150)
        )
      );
      for (const ref of successRefs) {
        transaction.set(ref,{organizationId:policyOrganizationId,answeredCount:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      }
      transaction.set(sessionRef!,{
        consumed:true,status:'submitted',attemptId,consumedAt:FieldValue.serverTimestamp(),
        submissionResult:{...storedResult,attemptsUsed},
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      transaction.set(policyRef,{
        policyVersion:ASSESSMENT_ATTEMPT_POLICY_VERSION,
        activeSessionId:null,activeSessionStartedAt:null,activeSessionResumeUntil:null,
        lastSubmittedAt:attemptTimeIso,lastCompletedAttemptNumber:attemptsUsed,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return {attemptsUsed,replayed:false,replay:null,pointsAwarded:pointsLedger.exists?0:assessmentPoints};
    });

    if(policyResult.replayed&&policyResult.replay){
      return res.status(200).json({
        ok:true,replayed:true,scoreKey,...policyResult.replay,certificateReview:null,
      });
    }

    let certificateReview:Awaited<ReturnType<typeof ensureAutomaticGraduationReview>>|null=null;
    if(useTenantGuide&&guideId!=='discover'){
      try{
        certificateReview=await ensureAutomaticGraduationReview(db,decoded.uid,guideId,'system:assessment-completion');
        const programReviews=await ensureAutomaticProgramGraduationReviews(db,decoded.uid,guideId,'system:program-assessment-completion');
        await finalizeAutomaticCertificateRelease(db,decoded.uid,guideId,certificateReview,programReviews,'system:assessment-completion');
      }catch(reviewError){
        console.warn('Automatic certificate review could not be created after assessment completion',reviewError);
      }
    }

    // Per-question correctness is retained for authorized mentor analytics only.
    // Exposing failed keys lets clients reconstruct the answer bank by probing.
    const committed=storedSubmissionPayload({...storedResult,attemptsUsed:policyResult.attemptsUsed});
    if(!committed)throw new Error('The saved assessment result could not be reconstructed.');
    return res.status(200).json({
      ok:true,replayed:false,scoreKey,...committed,certificateReview,pointsAwarded:policyResult.pointsAwarded||0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Study progress could not be saved.';
    if (message === 'Server-side Firebase administration is not configured.') {
      console.warn('VOP study server configuration is unavailable:', message);
      return res.status(503).json({ error: message, code:'SERVER_CONFIGURATION' });
    }
    if (message.includes('not configured')) {
      console.warn('VOP study configuration is unavailable:', message);
      return res.status(requestedAction==='startQuiz'?200:409).json({
        ok:requestedAction==='startQuiz'?false:undefined,
        available:requestedAction==='startQuiz'?false:undefined,
        error: message, code:'ASSESSMENT_CONFIGURATION',
      });
    }
    if (message.includes('Assessment attempt limit reached')) {
      const maxMatch=message.match(/\(([0-9]+) attempt/i);
      return res.status(requestedAction==='startQuiz'?200:409).json({
        ok:requestedAction==='startQuiz'?false:undefined,
        available:requestedAction==='startQuiz'?false:undefined,
        error:message,code:'ASSESSMENT_ATTEMPT_LIMIT',
        maxAttempts:maxMatch?Number(maxMatch[1]):null,
      });
    }
    if (message.includes('Assessment retake confirmation required')) {
      const scoreMatch=message.match(/current score of ([0-9]+(?:\.[0-9]+)?)%/i);
      return res.status(200).json({
        ok:false,available:false,
        error:message,
        code:'ASSESSMENT_RETAKE_CONFIRMATION',
        confirmationRequired:true,
        previousScore:scoreMatch?Number(scoreMatch[1]):null,
      });
    }
    if (message.includes('Assessment retake is available after')) {
      const retryMatch=message.match(/available after ([^\.]+(?:\.[0-9]{3}Z)?)/i);
      return res.status(requestedAction==='startQuiz'?200:409).json({
        ok:requestedAction==='startQuiz'?false:undefined,
        available:requestedAction==='startQuiz'?false:undefined,
        error:message,code:'ASSESSMENT_RETAKE_COOLDOWN',
        retryAt:retryMatch?retryMatch[1]:null,
      });
    }
    if (message.includes('Complete all published study lessons')) {
      return res.status(requestedAction==='startQuiz'?200:409).json({
        ok:requestedAction==='startQuiz'?false:undefined,
        available:requestedAction==='startQuiz'?false:undefined,
        error:message,code:'ASSESSMENT_PREREQUISITE',
      });
    }
    if (message.includes('session has expired')) {
      return res.status(409).json({error:message,code:'ASSESSMENT_SESSION_EXPIRED'});
    }
    if (message.includes('already been submitted')||message.includes('attempt session')) {
      return res.status(409).json({error:message,code:'ASSESSMENT_SESSION_INVALID'});
    }
    if (message.includes('profile was not found')) return res.status(404).json({ error: message });
    console.error('VOP study progress sync failed', error);
    return res.status(500).json({ error: 'Study progress could not be saved.' });
  }
}
