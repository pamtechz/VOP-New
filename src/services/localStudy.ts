import { getActiveLanguage } from './storage';
import { auth } from '../lib/firebase';

/**
 * Learner study writes are authenticated and server-authoritative.
 * localStorage is not used to award lesson or assessment credit.
 */
export async function completeLesson(guideId: string, lessonId: string): Promise<boolean> {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return false;

  const language = getActiveLanguage();
  const token = await firebaseUser.getIdToken();
  const response = await fetch('/api/study/progress', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'completeLesson', language, guideId, lessonId }),
  });

  return response.ok;
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
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}
