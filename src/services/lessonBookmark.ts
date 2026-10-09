import type { CurriculumProgram, DiscoverGuide, Lesson, User } from '../types';
import { lessonIsComplete } from './lessonProgress.ts';
import { readPendingResumes } from './offlineStudyQueue.ts';

export interface LessonResumeBookmark {
  guideId: string;
  lessonId: string;
  lessonTitle: string;
  lessonNumber: string;
  pageIndex: number;
  pageNumber: number; // 1-based display
  totalPages: number;
  progressPercent: number; // 0..100
  chapterId?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  sectionId?: string;
  sectionTitle?: string;
  sectionNumber?: number;
  pageTitle?: string;
  isCompleted: boolean;
  hasBookmark: boolean; // True if learner has an in-progress reading bookmark
  updatedAt?: string;
}

export interface ActiveGuideBookmark {
  guide: DiscoverGuide;
  lesson: Lesson;
  bookmark: LessonResumeBookmark;
}

export interface ActiveProgramBookmark {
  program: CurriculumProgram;
  guide: DiscoverGuide;
  lesson: Lesson;
  bookmark: LessonResumeBookmark;
}

/**
 * Resolves a high-fidelity bookmark for a study lesson, combining authoritative
 * user profile progress, chapter/section hierarchy, and offline pending queues.
 */
export function resolveLessonResumeBookmark(
  guide: DiscoverGuide,
  lesson: Lesson,
  user: User,
  passThreshold = 75,
): LessonResumeBookmark | null {
  if (lesson.type !== 'Lesson') return null;

  const pages = lesson.contentPages || [];
  const totalPages = Math.max(1, pages.length);
  const isCompleted = lessonIsComplete(guide, lesson, user, passThreshold);

  // Look up authoritative resume state
  const resumes = user.progress?.lessonResume || {};
  const serverKey = `${guide.language}:${guide.id}:${lesson.id}`;
  const fallbackKey = `${guide.id}:${lesson.id}`;
  const storedResume = resumes[serverKey] || resumes[fallbackKey] ||
    Object.values(resumes).find(r => r.guideId === guide.id && r.lessonId === lesson.id);

  // Check client pending queue in case a recent page turn is awaiting sync
  const pending = readPendingResumes().find(
    r => r.uid === user.uid && r.guideId === guide.id && r.lessonId === lesson.id,
  );

  let rawPageIndex = 0;
  let hasRecordedResume = false;
  let updatedAt: string | undefined;

  if (pending && Number.isInteger(pending.pageIndex)) {
    rawPageIndex = pending.pageIndex;
    hasRecordedResume = true;
    updatedAt = new Date(pending.queuedAt).toISOString();
  } else if (storedResume && Number.isInteger(storedResume.pageIndex)) {
    rawPageIndex = storedResume.pageIndex;
    hasRecordedResume = true;
    updatedAt = storedResume.updatedAt;
  }

  const pageIndex = isCompleted
    ? totalPages - 1
    : Math.max(0, Math.min(totalPages - 1, Math.trunc(rawPageIndex) || 0));
  const pageNumber = pageIndex + 1;
  const currentPage = pages[pageIndex];

  // Resolve section and chapter information from structured curriculum
  let sectionTitle = currentPage?.title || '';
  let chapterTitle = '';
  let sectionNumber: number | undefined;
  let chapterNumber: number | undefined;

  if (lesson.chapters?.length && currentPage) {
    const chIndex = lesson.chapters.findIndex(c => c.id === currentPage.chapterId);
    if (chIndex >= 0) {
      const chapter = lesson.chapters[chIndex];
      chapterTitle = chapter.title;
      chapterNumber = chIndex + 1;
      const secIndex = chapter.sections.findIndex(s => s.id === currentPage.sectionId);
      if (secIndex >= 0) {
        sectionTitle = chapter.sections[secIndex].title;
        sectionNumber = secIndex + 1;
      }
    }
  }

  const progressPercent = isCompleted
    ? 100
    : hasRecordedResume || pageIndex > 0
      ? Math.max(1, Math.min(99, Math.round((pageNumber / totalPages) * 100)))
      : 0;

  // A bookmark is actionable when the lesson is not yet completed and has either advanced past page 0
  // or has an explicitly saved reading checkpoint.
  const hasBookmark = !isCompleted && (pageIndex > 0 || hasRecordedResume);

  return {
    guideId: guide.id,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonNumber: lesson.lessonNumber,
    pageIndex,
    pageNumber,
    totalPages,
    progressPercent,
    chapterId: currentPage?.chapterId,
    chapterTitle: chapterTitle || undefined,
    chapterNumber,
    sectionId: currentPage?.sectionId,
    sectionTitle: sectionTitle || undefined,
    sectionNumber,
    pageTitle: currentPage?.title || undefined,
    isCompleted,
    hasBookmark,
    updatedAt,
  };
}

/**
 * Returns the active in-progress bookmark for a guide, prioritized by:
 * 1. Most recently updated in-progress lesson bookmark with pageIndex > 0
 * 2. Any in-progress lesson with an active bookmark
 * 3. First uncompleted study lesson in the curriculum
 */
export function getActiveGuideBookmark(
  guide: DiscoverGuide,
  user: User,
  passThreshold = 75,
): ActiveGuideBookmark | null {
  const studyLessons = [...guide.lessons]
    .filter(l => l.type === 'Lesson')
    .sort((a, b) => {
      const an = Number.parseFloat(a.lessonNumber);
      const bn = Number.parseFloat(b.lessonNumber);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
      return a.lessonNumber.localeCompare(b.lessonNumber, undefined, { numeric: true, sensitivity: 'base' });
    });

  if (studyLessons.length === 0) return null;

  const resolved = studyLessons.map(lesson => ({
    lesson,
    bookmark: resolveLessonResumeBookmark(guide, lesson, user, passThreshold),
  })).filter((item): item is { lesson: Lesson; bookmark: LessonResumeBookmark } => Boolean(item.bookmark));

  // 1. Most recently updated lesson bookmark with active reading progress
  const bookmarked = resolved.filter(item => !item.bookmark.isCompleted && item.bookmark.hasBookmark);
  if (bookmarked.length > 0) {
    bookmarked.sort((a, b) => {
      const timeA = a.bookmark.updatedAt ? new Date(a.bookmark.updatedAt).getTime() : 0;
      const timeB = b.bookmark.updatedAt ? new Date(b.bookmark.updatedAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.bookmark.pageIndex - a.bookmark.pageIndex;
    });
    return { guide, lesson: bookmarked[0].lesson, bookmark: bookmarked[0].bookmark };
  }

  // 2. Next uncompleted lesson
  const nextUncompleted = resolved.find(item => !item.bookmark.isCompleted);
  if (nextUncompleted) {
    return { guide, lesson: nextUncompleted.lesson, bookmark: nextUncompleted.bookmark };
  }

  // 3. Fallback to first lesson
  const first = resolved[0];
  return first ? { guide, lesson: first.lesson, bookmark: first.bookmark } : null;
}

/**
 * Finds an active bookmark within an assigned program/course.
 */
export function getActiveProgramBookmark(
  program: CurriculumProgram,
  guides: DiscoverGuide[],
  user: User,
  passThreshold = 75,
): ActiveProgramBookmark | null {
  const programGuides = guides.filter(g => program.guideIds.includes(g.id));
  for (const guide of programGuides) {
    const active = getActiveGuideBookmark(guide, user, passThreshold);
    if (active && active.bookmark.hasBookmark && !active.bookmark.isCompleted) {
      return { program, ...active };
    }
  }
  return null;
}
