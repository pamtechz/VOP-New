import type { DiscoverGuide, User, LanguageCode, Lesson } from '../types';

export interface GuideProgress {
  guideId: string;
  completed: number;
  total: number;
  passedTests: number;
  totalTests: number;
  percent: number;
  qualified: boolean;
}

export interface CurriculumProgress {
  guides: GuideProgress[];
  completedGuides: number;
  totalGuides: number;
  completedItems: number;
  totalItems: number;
  percent: number;
  certificateEligible: boolean;
}

/** Only a single-test guide can reuse a historical aggregate score. */
function getTestScore(guide: DiscoverGuide, test: Lesson, scores: Record<string, number>): number | undefined {
  const key = `${guide.id}:${test.id}`;
  if (Object.hasOwn(scores, key)) return scores[key];
  return guide.lessons.filter(lesson => lesson.type === 'Test').length === 1 ? scores[guide.id] : undefined;
}

function validScore(score: number | undefined): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

/**
 * Derive display progress from the active language's administrator-selected
 * certificate guides; never trust stored completion counters for eligibility.
 * This is a local preview calculation, not authorization to issue a credential.
 */
export function calculateCurriculumProgress(
  guides: DiscoverGuide[], user: User, passThreshold: number, language: LanguageCode,
): CurriculumProgress {
  const required = guides.filter(guide => guide.certificateEligible && guide.language === language);
  const completed = new Set(user.progress.completedLessons ?? []);
  const scores = user.progress.guideScores ?? {};
  const validThreshold = Number.isFinite(passThreshold) && passThreshold >= 0 && passThreshold <= 100;

  const guideProgress = required.map(guide => {
    const lessons = guide.lessons.filter(lesson => lesson.type === 'Lesson');
    const tests = guide.lessons.filter(lesson => lesson.type === 'Test');
    const finishedLessons = lessons.filter(lesson => completed.has(lesson.id)).length;
    const passedTests = tests.filter(test => {
      if (!validThreshold) return false;
      const score = getTestScore(guide, test, scores);
      return validScore(score) && score >= passThreshold;
    }).length;
    const done = finishedLessons + passedTests;
    const total = lessons.length + tests.length;
    return {
      guideId: guide.id,
      completed: done,
      total,
      passedTests,
      totalTests: tests.length,
      percent: total ? Math.round(done * 100 / total) : 0,
      qualified: validThreshold && lessons.length > 0 && tests.length > 0 && done === total,
    };
  });

  const completedItems = guideProgress.reduce((sum, guide) => sum + guide.completed, 0);
  const totalItems = guideProgress.reduce((sum, guide) => sum + guide.total, 0);
  const completedGuides = guideProgress.filter(guide => guide.qualified).length;
  return {
    guides: guideProgress,
    completedGuides,
    totalGuides: required.length,
    completedItems,
    totalItems,
    percent: totalItems ? Math.round(completedItems * 100 / totalItems) : 0,
    certificateEligible: validThreshold && required.length > 0 && completedGuides === required.length,
  };
}

/** A display-only mean of actual required assessment marks, not the last test score. */
export function calculateCurriculumAverageScore(
  guides: DiscoverGuide[], user: User, language: LanguageCode,
): number | null {
  const required = guides.filter(guide => guide.certificateEligible && guide.language === language);
  if (!required.length || required.some(guide => !guide.lessons.some(lesson => lesson.type === 'Test'))) return null;
  const scores = user.progress.guideScores ?? {};
  const marks = required.flatMap(guide => guide.lessons
    .filter(lesson => lesson.type === 'Test')
    .map(test => getTestScore(guide, test, scores)));
  if (!marks.length || !marks.every(validScore)) return null;
  return Math.round(marks.reduce((sum, mark) => sum + mark!, 0) / marks.length);
}
