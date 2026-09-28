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
): Promise<'synced' | 'queued' | 'failed'> {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return 'failed';
  const item: PendingCompletion = {
    uid:firebaseUser.uid, language:getActiveLanguage(), guideId, lessonId, queuedAt:Date.now(),
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

export async function submitQuizAnswers(
  guideId: string,
  testId: string,
  answers: Record<number, number | boolean>,
): Promise<number | null> {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return null;

  const language = getActiveLanguage();
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

  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as { score?: unknown } | null;
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
    return score;
  }
  return null;
}
