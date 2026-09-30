import { getActiveLanguage } from './storage';
import { auth } from '../lib/firebase';
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
  instructions: string;
  timeLimitMinutes: number;
  passingPercent: number;
  maxAttempts: number | null;
  retakeCooldownMinutes: number;
  feedbackMode: 'after_submit' | 'after_pass' | 'none';
}

export interface AssessmentStartResult {
  attemptId: string;
  startedAt: string;
  expiresAt: string | null;
  policy: AssessmentPolicyResult;
  retakePolicy: {
    attemptsUsed: number;
    maxAttempts: number | null;
    remainingAttempts: number | null;
    cooldownMinutes: number;
    retryAt: string | null;
  };
}

export interface AssessmentSubmissionResult {
  score: number;
  passed: boolean;
  policy?: AssessmentPolicyResult;
  feedback?: Array<{key:string;correct:boolean;explanation:string;correctAnswer:number|boolean|null}>;
  retakePolicy: {
    attemptsUsed: number;
    maxAttempts: number | null;
    remainingAttempts: number | null;
    cooldownMinutes: number;
    retryAt: string | null;
  };
}

export async function startQuizAttempt(
  guideId:string,
  testId:string,
  language:string=getActiveLanguage(),
):Promise<AssessmentStartResult> {
  const firebaseUser=auth?.currentUser;
  if(!firebaseUser) throw new Error('Sign in before starting an assessment.');
  const token=await firebaseUser.getIdToken();
  const response=await fetch('/api/study/progress',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action:'startQuiz',language,guideId,lessonId:testId}),
  });
  const body=await response.json().catch(()=>null) as (AssessmentStartResult&{error?:unknown})|null;
  if(!response.ok||!body?.attemptId){
    throw new Error(typeof body?.error==='string'&&body.error.trim()?body.error:'The assessment attempt could not be started.');
  }
  return body;
}

export async function submitQuizAnswers(
  guideId: string,
  testId: string,
  answers: Record<number, number | boolean>,
  language: string = getActiveLanguage(),
  attemptId = '',
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
      ...(attemptId ? {attemptId} : {}),
      answers: Object.fromEntries(Object.entries(answers).map(([index, answer]) => [index, answer])),
    }),
  });

  const body = await response.json().catch(() => null) as {
    error?:unknown; score?:unknown; passed?:unknown;
    policy?:Partial<AssessmentPolicyResult>;
    feedback?:AssessmentSubmissionResult['feedback'];
    retakePolicy?:Partial<AssessmentSubmissionResult['retakePolicy']>;
  } | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' && body.error.trim()
      ? body.error : 'The assessment could not be verified and saved.');
  }
  const score = Number(body?.score);
  if (Number.isFinite(score) && score >= 0 && score <= 100) {
    // Graduation eligibility is re-evaluated server-side; a 409 simply means the learner has not completed every requirement yet.
    try {
      await fetch('/api/admin/graduations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'submit', guideId, averageScore: score }),
      });
    } catch {
      // Quiz results remain authoritative even when graduation submission is not yet eligible or temporarily unavailable.
    }
    const policy = body?.retakePolicy || {};
    return {
      score,
      passed: body?.passed === true,
      policy: body?.policy && Number.isFinite(Number(body.policy.passingPercent)) ? {
        instructions:String(body.policy.instructions||''),
        timeLimitMinutes:Math.max(0,Math.trunc(Number(body.policy.timeLimitMinutes)||0)),
        passingPercent:Number(body.policy.passingPercent),
        maxAttempts:Number.isInteger(Number(body.policy.maxAttempts))&&Number(body.policy.maxAttempts)>0?Number(body.policy.maxAttempts):null,
        retakeCooldownMinutes:Math.max(0,Math.trunc(Number(body.policy.retakeCooldownMinutes)||0)),
        feedbackMode:body.policy.feedbackMode==='after_pass'||body.policy.feedbackMode==='none'?body.policy.feedbackMode:'after_submit',
      } : undefined,
      feedback:Array.isArray(body?.feedback)?body.feedback:undefined,
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
