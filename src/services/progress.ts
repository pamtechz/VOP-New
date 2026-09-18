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

/** Derived progress for the active language, never cached user-facing counters. */
export function calculateCurriculumProgress(
  guides: DiscoverGuide[], user: User, passThreshold: number, language: LanguageCode,
): CurriculumProgress {
  const eligibleGuides = guides.filter(guide => guide.certificateEligible && guide.language === language);
  const completed = new Set(user.progress.completedLessons ?? []);
  const scores = user.progress.guideScores ?? {};
  const threshold = Number.isFinite(passThreshold) && passThreshold >= 0 && passThreshold <= 100
    ? passThreshold
    : 100; // Invalid settings cannot accidentally make certificates easier to obtain.

  const guideProgress = eligibleGuides.map(guide => {
    const lessons = guide.lessons.filter(lesson => lesson.type === 'Lesson');
    const tests = guide.lessons.filter(lesson => lesson.type === 'Test');
    const finishedLessons = lessons.filter(lesson => completed.has(lesson.id)).length;
    // The existing schema stores a single score per guide. It cannot prove
    // passing multiple tests, so multi-test guides remain ineligible until
    // individual test results are stored and verified.
    const passedTests = tests.length === 1 && Number.isFinite(scores[guide.id]) && scores[guide.id] >= threshold ? 1 : 0;
    const done = finishedLessons + passedTests;
    const total = lessons.length + tests.length;
    return {
      guideId: guide.id,
      completed: done,
      total,
      passedTests,
      totalTests: tests.length,
      percent: total ? Math.round(done * 100 / total) : 0,
      qualified: lessons.length > 0 && tests.length === 1 && done === total,
    };
  });

  const completedItems = guideProgress.reduce((sum, guide) => sum + guide.completed, 0);
  const totalItems = guideProgress.reduce((sum, guide) => sum + guide.total, 0);
  const completedGuides = guideProgress.filter(guide => guide.qualified).length;
  return {
    guides: guideProgress,
    completedGuides,
    totalGuides: eligibleGuides.length,
    completedItems,
    totalItems,
    percent: totalItems ? Math.round(completedItems * 100 / totalItems) : 0,
    certificateEligible: eligibleGuides.length > 0 && completedGuides === eligibleGuides.length,
  };
}
