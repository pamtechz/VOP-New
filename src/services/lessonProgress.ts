import type { DiscoverGuide, Lesson, User } from '../types';

/** Use the grading API's organization-scoped score before any historical
 * keys. Redacted canonical tests may NEVER use an old local/aggregate grade. */
export function lessonScoreForDisplay(guide: DiscoverGuide, lesson: Lesson, user: User): number | undefined {
  if (lesson.type !== 'Test' && !(Array.isArray(lesson.questions) && lesson.questions.length > 0)) {
    return undefined;
  }
  const scores = user.progress?.guideScores ?? {};
  const serverKey = `${user.organizationId || 'platform'}:${guide.language}:${guide.id}:${lesson.id}`;
  const value = (key: string): number | undefined => {
    const raw = scores[key];
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100
      ? raw : undefined;
  };
  if (Object.hasOwn(scores, serverKey)) return value(serverKey);
  if (lesson.sourceQuizId) return undefined;
  for (const key of [`${guide.language}:${guide.id}:${lesson.id}`, `${guide.id}:${lesson.id}`]) {
    if (Object.hasOwn(scores, key)) return value(key);
  }
  return guide.lessons.filter(item => item.type === 'Test').length === 1 ? value(guide.id) : undefined;
}

export function lessonIsComplete(guide: DiscoverGuide, lesson: Lesson, user: User, passThreshold: number): boolean {
  if (lesson.type === 'Test') {
    if (!Number.isFinite(passThreshold) || passThreshold < 1 || passThreshold > 100) return false;
    const score = lessonScoreForDisplay(guide, lesson, user);
    if (score !== undefined && score >= passThreshold) return true;
    const completedAssessments = (user.progress as { completedAssessments?: string[] })?.completedAssessments ?? [];
    return completedAssessments.includes(`${guide.language}:${guide.id}:${lesson.id}`)
      || completedAssessments.includes(lesson.id);
  }
  const completed = user.progress?.completedLessons ?? [];
  return completed.includes(`${guide.language}:${guide.id}:${lesson.id}`)
    || completed.includes(lesson.id);
}

/**
 * Return all tests/quizzes attached to a study lesson or attached to any chapter/section within that lesson.
 * Excludes guide-level assessments and final exams.
 */
export function getAttachedAssessmentsForLesson(guide: DiscoverGuide, lesson: Lesson): Lesson[] {
  const sectionIds = new Set<string>();
  const chapterIds = new Set<string>();
  if (Array.isArray(lesson.chapters)) {
    for (const chapter of lesson.chapters) {
      if (chapter.id) chapterIds.add(chapter.id);
      if (Array.isArray(chapter.sections)) {
        for (const section of chapter.sections) {
          if (section.id) sectionIds.add(section.id);
        }
      }
    }
  }

  return (guide.lessons || []).filter(item => {
    if (item.type !== 'Test') return false;
    if (item.attachmentType === 'guide' || item.assessmentKind === 'final_exam') return false;

    // Direct lesson attachment or naming convention
    if (item.attachedLessonId === lesson.id) return true;
    if (item.id === `quiz_${lesson.id}`) return true;
    if (!item.attachedLessonId && (item as any).lessonId === lesson.id) return true;
    if ((lesson as any).quizLessonId === item.id || (lesson as any).attachedQuizId === item.id) return true;

    // Attached to a section or chapter inside this lesson
    if (item.anchorId && (sectionIds.has(item.anchorId) || chapterIds.has(item.anchorId))) return true;

    return false;
  });
}

/**
 * Check whether a specific study lesson has all its attached tests / quizzes completed and passed.
 * If the lesson has no attached tests, this returns true.
 * If any attached test or embedded section quiz has not reached the pass mark, this returns false.
 */
export function lessonAttachedTestsAreComplete(
  guide: DiscoverGuide,
  lesson: Lesson,
  user: User,
  passThreshold: number
): boolean {
  const attached = getAttachedAssessmentsForLesson(guide, lesson);

  for (const testItem of attached) {
    const configuredThreshold = Number(testItem.assessmentPassThreshold);
    const effectiveThreshold = Number.isFinite(configuredThreshold) && configuredThreshold >= 1 && configuredThreshold <= 100
      ? configuredThreshold
      : passThreshold;
    if (!lessonIsComplete(guide, testItem, user, effectiveThreshold)) {
      return false;
    }
  }

  // If the lesson itself has embedded questions and no separate Test items were attached
  if (attached.length === 0 && Array.isArray(lesson.questions) && lesson.questions.length > 0) {
    const score = lessonScoreForDisplay(guide, lesson, user);
    if (score === undefined || score < passThreshold) {
      return false;
    }
  }

  return true;
}

/** Determine whether an independent module/lesson in a linear VOP track is unlocked for the learner.
 * Lesson 0 (or guide #1) is always unlocked.
 * A subsequent lesson is unlocked if and only if all preceding lessons are completed
 * AND any tests attached to those preceding lessons or their sections are completed.
 */
export function isLessonUnlocked(
  guide: DiscoverGuide,
  lessonIndex: number,
  user: User,
  passThreshold: number,
  studyLessons: Lesson[]
): boolean {
  if (lessonIndex <= 0) return true;
  if ((guide as { allowFreeNavigation?: boolean }).allowFreeNavigation === true) return true;

  // Verify all preceding lessons up to lessonIndex - 1
  for (let i = 0; i < lessonIndex; i++) {
    const prev = studyLessons[i];
    if (!prev) continue;
    // 1. Preceding lesson reading content must be completed
    if (!lessonIsComplete(guide, prev, user, passThreshold)) {
      return false;
    }
    // 2. Any test attached to preceding lesson or sections must also be completed
    if (!lessonAttachedTestsAreComplete(guide, prev, user, passThreshold)) {
      return false;
    }
  }

  return true;
}

