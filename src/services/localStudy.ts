import { getActiveLanguage } from './storage';
import { auth } from '../lib/firebase';
import type { Question } from '../types';
import { queueCompletion, dropCompletion, queueResume, dropResume, type PendingCompletion, type PendingResume } from './offlineStudyQueue';

/**
 * Offline completion is ONLY a pending request. It never awards credit before
 * server-side permission, publication, and lesson-type checks succeed.
 */
export async function completeLesson(
  guideId: string,
  lessonId: string,
  language: string = getActiveLanguage(),
): Promise<'synced' | 'queued' | 'failed'> {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return 'failed';
  const item: PendingCompletion = {
    uid:firebaseUser.uid, language, guideId, lessonId, queuedAt:Date.now(),
  };
  const queue = () => queueCompletion(item) ? 'queued' as const : 'failed' as const;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return queue();
  try {
    const token = await firebaseUser.getIdToken();
    const response = await fetch('/api/study/progress', {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer ' + token},
      body:JSON.stringify({
        action:'completeLesson',language:item.language,guideId,lessonId,
      }),
    });
    if (response.ok) {
      dropCompletion(item);
      return 'synced';
    }
    return response.status >= 500 ? queue() : 'failed';
  } catch { return queue(); }
}

export async function saveLessonResume(
  guideId:string, lessonId:string, pageIndex:number, language:string=getActiveLanguage(),
):Promise<'synced'|'queued'|'failed'> {
  const firebaseUser=auth?.currentUser;
  if (!firebaseUser || !Number.isInteger(pageIndex) || pageIndex < 0) return 'failed';
  const item:PendingResume={uid:firebaseUser.uid,language,guideId,lessonId,pageIndex,queuedAt:Date.now()};
  const queue=()=>queueResume(item)?'queued' as const:'failed' as const;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return queue();
  try {
    const token=await firebaseUser.getIdToken();
    const response=await fetch('/api/study/progress',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({action:'saveLessonResume',language,guideId,lessonId,pageIndex}),
    });
    if (response.ok) { dropResume(item); return 'synced'; }
    return response.status >= 500 ? queue() : 'failed';
  } catch { return queue(); }
}

export interface AssessmentPolicyResult {
  sessionId:string;
  resumed:boolean;
  startedAt:string;
  expiresAt:string|null;
  questions:Question[];
  previousScore:number|null;
  previousScoreRevoked:boolean;
  assessmentPolicy:{
    threshold:number;
    attemptsUsed:number;
    maxAttempts:number|null;
    remainingAttempts:number|null;
    cooldownMinutes:number;
    timeLimitMinutes:number;
    feedbackMode:'score_only'|'after_submit'|'none';
    instructions:string;
  };
}

export class AssessmentStartConditionError extends Error {
  code:string;
  previousScore:number|null;
  retryAt:string|null;
  maxAttempts:number|null;
  constructor(
    message:string,code:string,previousScore:number|null=null,
    details:{retryAt?:string|null;maxAttempts?:number|null}={},
  ){
    super(message);
    this.name='AssessmentStartConditionError';
    this.code=code;
    this.previousScore=previousScore;
    this.retryAt=details.retryAt||null;
    this.maxAttempts=Number.isInteger(Number(details.maxAttempts))&&Number(details.maxAttempts)>0
      ?Number(details.maxAttempts):null;
  }
}

export class AssessmentSubmissionConditionError extends Error {
  code:string;
  constructor(message:string,code:string){
    super(message);
    this.name='AssessmentSubmissionConditionError';
    this.code=code;
  }
}

export interface AssessmentSubmissionResult {
  replayed?:boolean;
  score: number | null;
  passed: boolean | null;
  threshold:number;
  feedbackMode:'score_only'|'after_submit'|'none';
  explanations?:string[];
  retakePolicy: {
    attemptsUsed: number;
    maxAttempts: number | null;
    remainingAttempts: number | null;
    cooldownMinutes: number;
    retryAt: string | null;
  };
}

export async function beginQuizAttempt(
  guideId:string,testId:string,language:string=getActiveLanguage(),confirmRetake=false,
):Promise<AssessmentPolicyResult>{
  const firebaseUser=auth?.currentUser;
  if(!firebaseUser)throw new Error('Sign in before starting an assessment.');
  const token=await firebaseUser.getIdToken();
  const response=await fetch('/api/study/progress',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action:'startQuiz',language,guideId,lessonId:testId,confirmRetake}),
  });
  const body=await response.json().catch(()=>({})) as Partial<AssessmentPolicyResult>&{
    ok?:unknown;error?:unknown;code?:unknown;confirmationRequired?:unknown;previousScore?:unknown;
    retryAt?:unknown;maxAttempts?:unknown;
  };
  const code=typeof body.code==='string'?body.code:'';
  const conditionDetails={
    retryAt:typeof body.retryAt==='string'&&body.retryAt?body.retryAt:null,
    maxAttempts:Number.isInteger(Number(body.maxAttempts))&&Number(body.maxAttempts)>0?Number(body.maxAttempts):null,
  };
  if(code==='ASSESSMENT_RETAKE_CONFIRMATION'&&body.confirmationRequired===true){
    throw new AssessmentStartConditionError(
      typeof body.error==='string'?body.error:'Confirm the retake before replacing the current result.',
      code,
      Number.isFinite(Number(body.previousScore))?Number(body.previousScore):null,
      conditionDetails,
    );
  }
  if(!response.ok){
    const message=typeof body.error==='string'?body.error:'The assessment could not be started.';
    if(code.startsWith('ASSESSMENT_'))throw new AssessmentStartConditionError(message,code,null,conditionDetails);
    throw new Error(message);
  }
  if(!body.sessionId||!body.assessmentPolicy||!Array.isArray(body.questions)||!body.questions.length){
    throw new Error('The assessment could not load its published questions.');
  }
  return {
    ...(body as AssessmentPolicyResult),
    resumed:body.resumed===true,
    previousScore:Number.isFinite(Number(body.previousScore))?Number(body.previousScore):null,
    previousScoreRevoked:body.previousScoreRevoked===true,
    questions:body.questions as Question[],
  };
}

export async function submitQuizAnswers(
  guideId: string,
  testId: string,
  answers: Record<number, number | boolean>,
  language: string = getActiveLanguage(),
  sessionId = '',
): Promise<AssessmentSubmissionResult | null> {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return null;

  const token = await firebaseUser.getIdToken();
  const response = await fetch('/api/study/progress', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'submitQuiz',
      language,
      guideId,
      lessonId: testId,
      sessionId,
      answers: Object.fromEntries(Object.entries(answers).map(([index, answer]) => [index, answer])),
    }),
  });

  const body = await response.json().catch(() => null) as {
    error?:unknown; code?:unknown; replayed?:unknown; score?:unknown; passed?:unknown; threshold?:unknown;
    feedbackMode?:unknown; explanations?:unknown;
    retakePolicy?:Partial<AssessmentSubmissionResult['retakePolicy']>;
  } | null;
  if (!response.ok) {
    const message=typeof body?.error === 'string' && body.error.trim()
      ? body.error : 'The assessment could not be verified and saved.';
    const code=typeof body?.code==='string'?body.code:'';
    if(code.startsWith('ASSESSMENT_'))throw new AssessmentSubmissionConditionError(message,code);
    throw new Error(message);
  }
  const feedbackMode=['score_only','after_submit','none'].includes(String(body?.feedbackMode||''))
    ?String(body?.feedbackMode) as AssessmentSubmissionResult['feedbackMode']:'score_only';
  const hidden=feedbackMode==='none';
  const score=hidden?null:Number(body?.score);
  if (hidden || (Number.isFinite(score) && Number(score) >= 0 && Number(score) <= 100)) {
    // Graduation eligibility is already re-evaluated atomically by /api/study/progress.
    // Do not issue a second learner graduation POST: an incomplete curriculum is
    // a normal state and the duplicate request previously surfaced as a noisy 409.
    const policy = body?.retakePolicy || {};
    return {
      replayed:body?.replayed===true,
      score,
      passed:hidden?null:body?.passed === true,
      threshold:Number(body?.threshold)||0,
      feedbackMode,
      explanations:Array.isArray(body?.explanations)?body!.explanations.map(String):undefined,
      retakePolicy: {
        attemptsUsed: Math.max(1, Math.trunc(Number(policy.attemptsUsed) || 1)),
        maxAttempts: Number.isInteger(Number(policy.maxAttempts)) && Number(policy.maxAttempts) > 0
          ? Number(policy.maxAttempts) : null,
        remainingAttempts: Number.isInteger(Number(policy.remainingAttempts)) && Number(policy.remainingAttempts) >= 0
          ? Number(policy.remainingAttempts) : null,
        cooldownMinutes: Math.max(0, Math.trunc(Number(policy.cooldownMinutes) || 0)),
        retryAt: typeof policy.retryAt === 'string' && policy.retryAt ? policy.retryAt : null,
      },
    };
  }
  return null;
}
