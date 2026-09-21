import {
  getActiveLanguage, getStoredGraduationRequests,
  getStoredGuides, getStoredSettings, submitGraduationRequest, updateUser,
} from './storage';
import { calculateCurriculumAverageScore, calculateCurriculumProgress } from './progress.ts';
import { applyQuizScore } from './studyTransactions.ts';
import { auth } from '../lib/firebase';

/**
 * Device-local study cache integration. Never interpret these writes as
 * authenticated completion, trusted marks or official certificate issuance.
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

export function submitQuizScore(guideId: string, testId: string, exactScore: number): boolean {
  const guides = getStoredGuides();
  const language = getActiveLanguage();
  const threshold = getStoredSettings().quizPassThreshold;
  const updated = applyQuizScore(getCurrentUser(), guides, threshold, language, guideId, testId, exactScore);
  if (!updated) return false;

  const state = calculateCurriculumProgress(guides, updated, threshold, language);
  const average = calculateCurriculumAverageScore(guides, updated, language);
  const required = guides.find(guide => guide.language === language && guide.certificateEligible);
  const hasRequest = getStoredGraduationRequests().some(request =>
    request.candidateId === updated.uid && request.guideId === required?.id && request.status !== 'rejected');

  if (state.certificateEligible && average !== null && required &&
      !updated.information.graduated && !updated.information.graduating && !hasRequest) {
    const awaitingApproval = { ...updated, information: { ...updated.information, graduating: true } };
    // This only creates an unverified local request; it is not an approval or issuance.
    submitGraduationRequest(awaitingApproval, required, average);
    updateUser(awaitingApproval);
  } else {
    updateUser(updated);
  }
  return true;
}
