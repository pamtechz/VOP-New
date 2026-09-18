import type { Lesson } from '../types';

/**
 * Empty or malformed study content must never count as a completed lesson.
 * This is a device-local integrity check, not proof of server-side completion.
 */
export function isLessonConfigured(lesson: Lesson): boolean {
  return lesson?.type === 'Lesson' && Array.isArray(lesson.contentPages) &&
    lesson.contentPages.length > 0 && lesson.contentPages.every(page =>
      page !== null && typeof page === 'object' &&
      typeof page.title === 'string' && page.title.trim().length > 0 &&
      typeof page.content === 'string' && page.content.trim().length > 0,
    );
}
