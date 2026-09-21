import type { DiscoverGuide, User, LanguageCode, Lesson } from '../types';
import { calculateCurriculumProgress } from './progress.ts';
import { isLessonConfigured } from './lesson.ts';
import { isQuizConfigured } from './quiz.ts';

/**
 * Browser-demo transactions only. A production server must authenticate the
 * learner, verify the lesson attempt and grade answers with private keys.
 */
function findUnambiguousItem(
  guides: DiscoverGuide[], language: LanguageCode, guideId: string, lessonId: string,
  type: Lesson['type'],
): Lesson | null {
  const selectedGuides = guides.filter(guide => guide.language === language && guide.id === guideId);
  if (selectedGuides.length !== 1 || !Array.isArray(selectedGuides[0].lessons)) return null;
  const matches = guides.filter(guide => guide.language === language)
    .flatMap(guide => Array.isArray(guide.lessons) ? guide.lessons : [])
    .filter(lesson => lesson?.id === lessonId);
  if (matches.length !== 1 || matches[0].type !== type) return null;
  return selectedGuides[0].lessons.some(lesson => lesson === matches[0]) ? matches[0] : null;
}

function withDerivedProgress(
  user: User, guides: DiscoverGuide[], threshold: number, language: LanguageCode,
): User | null {
  const state = calculateCurriculumProgress(guides, user, threshold, language);
  if (state.configurationError || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) return null;
  return { ...user, progress: {
    ...user.progress, discoverProgress: state.percent,
    completedGuidesCount: state.completedGuides, totalGuidesCount: state.totalGuides,
  } };
}

/** Do not credit a missing, blank or ambiguously identified Bible-study page. */
export function applyLessonCompletion(
  user: User, guides: DiscoverGuide[], threshold: number, language: LanguageCode,
  guideId: string, lessonId: string,
): User | null {
  const lesson = findUnambiguousItem(guides, language, guideId, lessonId, 'Lesson');
  if (!lesson || !isLessonConfigured(lesson)) return null;
  const candidate: User = { ...user, progress: {
    ...user.progress,
    completedLessons: [...new Set([...(user.progress.completedLessons ?? []), lessonId])],
  } };
  return withDerivedProgress(candidate, guides, threshold, language);
}

/** Store each configured test's exact percentage, never a fabricated guide-wide result. */
export function applyQuizScore(
  user: User, guides: DiscoverGuide[], threshold: number, language: LanguageCode,
  guideId: string, testId: string, score: number,
): User | null {
  const test = findUnambiguousItem(guides, language, guideId, testId, 'Test');
  if (!test || !isQuizConfigured(test.questions ?? []) ||
      !Number.isFinite(score) || score < 0 || score > 100) return null;
  const candidate: User = { ...user, progress: {
    ...user.progress,
    guideScores: { ...(user.progress.guideScores ?? {}), [`${guideId}:${testId}`]: score },
  } };
  return withDerivedProgress(candidate, guides, threshold, language);
}
