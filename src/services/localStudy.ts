import { getActiveLanguage } from './storage';
import { auth } from '../lib/firebase';
import { queueCompletion, dropCompletion, type PendingCompletion } from './offlineStudyQueue';

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

export interface AssessmentSubmissionResult {
  score: number;
  passed: boolean;
  retakePolicy: {
    attemptsUsed: number;
    maxAttempts: number | null;
    remainingAttempts: number | null;
    cooldownMinutes: number;
    retryAt: string | null;
  };
}

export async function submitQuizAnswers(
  guideId: string,
  testId: string,
  answers: Record<number, number | boolean>,
  language: string = getActiveLanguage(),
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
      answers: Object.fromEntries(Object.entries(answers).map(([index, answer]) => [index, answer])),
    }),
  });

  const body = await response.json().catch(() => null) as {
    error?:unknown; score?:unknown; passed?:unknown;
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
