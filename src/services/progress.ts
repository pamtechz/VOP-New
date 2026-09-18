import type { DiscoverGuide, User, LanguageCode } from '../types';

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
      const scoreKey = `${guide.id}:${test.id}`;
      const result = Object.hasOwn(scores, scoreKey)
        ? scores[scoreKey]
        : tests.length === 1 ? scores[guide.id] : undefined;
      // A historical guide-level score can attest to one test only. An invalid
      // newer score must never be silently overridden by that historical value.
      return Number.isFinite(result) && result! >= 0 && result! <= 100 && result! >= passThreshold;
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
