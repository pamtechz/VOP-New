import type { DiscoverGuide, User, LanguageCode, Lesson } from '../types';
import { isQuizConfigured } from './quiz.ts';
import { isLessonConfigured } from './lesson.ts';

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
  configurationError?: string;
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

/** Legacy completion stores only lesson IDs. Duplicate IDs can grant false credit. */
function validateRequiredIds(guides: DiscoverGuide[]): string | undefined {
  const guideIds = new Set<string>();
  const lessonIds = new Set<string>();
  for (const guide of guides) {
    if (typeof guide.id !== 'string' || !guide.id.trim() || guideIds.has(guide.id)) {
      return 'Required guides must have unique, nonempty identifiers.';
    }
    guideIds.add(guide.id);
    if (!Array.isArray(guide.lessons)) return 'A required guide has no valid lesson collection.';
    for (const lesson of guide.lessons) {
      if (!lesson || typeof lesson.id !== 'string' || !lesson.id.trim() || lessonIds.has(lesson.id)) {
        return 'Required lessons must have unique, nonempty identifiers across the selected curriculum.';
      }
      if (lesson.type !== 'Lesson' && lesson.type !== 'Test') {
        return 'A required guide contains an unknown lesson or assessment type.';
      }
      lessonIds.add(lesson.id);
    }
  }
  return undefined;
}

/** A blank study page must not earn course credit, even if its ID was completed before an edit. */
function validateRequiredLessons(guides: DiscoverGuide[]): string | undefined {
  for (const guide of guides) {
    if (guide.lessons.some(lesson => lesson.type === 'Lesson' && !isLessonConfigured(lesson))) {
      return 'A required lesson has missing or invalid study content.';
    }
  }
  return undefined;
}

/** All required test questions and answer keys must remain valid after edits. */
function validateRequiredQuizzes(guides: DiscoverGuide[]): string | undefined {
  for (const guide of guides) {
    const tests = guide.lessons.filter(lesson => lesson.type === 'Test');
    if (tests.some(test => !isQuizConfigured(test.questions ?? []))) {
      return 'A required assessment has missing or invalid questions or answer keys.';
    }
  }
  return undefined;
}

/**
 * Display-only progress from the selected language's administrator-required
 * guides. Never authorize official certificate issuance using browser records.
 */
export function calculateCurriculumProgress(
  guides: DiscoverGuide[], user: User, passThreshold: number, language: LanguageCode,
): CurriculumProgress {
  const required = guides.filter(guide => guide.certificateEligible && guide.language === language);
  const configurationError = validateRequiredIds(required) ?? validateRequiredLessons(required) ?? validateRequiredQuizzes(required);
  const completed = new Set(user.progress.completedLessons ?? []);
  const scores = user.progress.guideScores ?? {};
  const validThreshold = Number.isFinite(passThreshold) && passThreshold >= 0 && passThreshold <= 100;

  const guideProgress = required.map(guide => {
    const items = Array.isArray(guide.lessons) ? guide.lessons : [];
    const lessons = items.filter(lesson => lesson.type === 'Lesson');
    const tests = items.filter(lesson => lesson.type === 'Test');
    const finishedLessons = lessons.filter(lesson => isLessonConfigured(lesson) && completed.has(lesson.id)).length;
    const passedTests = tests.filter(test => {
      if (!validThreshold || !isQuizConfigured(test.questions ?? [])) return false;
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
      qualified: !configurationError && validThreshold && lessons.length > 0 && tests.length > 0 && done === total,
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
    certificateEligible: !configurationError && validThreshold && required.length > 0 && completedGuides === required.length,
    configurationError,
  };
}

/** A display-only mean of actual required assessment marks, not the last result. */
export function calculateCurriculumAverageScore(
  guides: DiscoverGuide[], user: User, language: LanguageCode,
): number | null {
  const required = guides.filter(guide => guide.certificateEligible && guide.language === language);
  if (!required.length || validateRequiredIds(required) || validateRequiredLessons(required) ||
      validateRequiredQuizzes(required) ||
      required.some(guide => !guide.lessons.some(lesson => lesson.type === 'Test'))) return null;
  const scores = user.progress.guideScores ?? {};
  const marks = required.flatMap(guide => guide.lessons
    .filter(lesson => lesson.type === 'Test')
    .map(test => getTestScore(guide, test, scores)));
  if (!marks.length || !marks.every(validScore)) return null;
  return Math.round(marks.reduce((sum, mark) => sum + mark!, 0) / marks.length);
}
