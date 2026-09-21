import {
  getActiveLanguage, getCurrentUser, getStoredGraduationRequests,
  getStoredGuides, getStoredSettings, submitGraduationRequest, updateUser,
} from './storage';
import { calculateCurriculumAverageScore, calculateCurriculumProgress } from './progress.ts';
import { applyLessonCompletion, applyQuizScore } from './studyTransactions.ts';

/**
 * Device-local study cache integration. Never interpret these writes as
 * authenticated completion, trusted marks or official certificate issuance.
 */
export function completeLesson(guideId: string, lessonId: string): boolean {
  const guides = getStoredGuides();
  const language = getActiveLanguage();
  const updated = applyLessonCompletion(
    getCurrentUser(), guides, getStoredSettings().quizPassThreshold, language, guideId, lessonId,
  );
  if (!updated) return false;
  updateUser(updated);
  return true;
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
