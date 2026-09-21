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
      ((typeof page.content === 'string' && page.content.trim().length > 0) || (Array.isArray(page.blocks) && page.blocks.some(block => {
        if (!block || typeof block !== 'object' || typeof block.type !== 'string') return false;
        if (block.type === 'divider') return true;
        if (block.type === 'image') return Boolean(block.imageUrl?.trim());
        if (block.type === 'video' || block.type === 'link') return Boolean(block.url?.trim());
        if (block.type === 'list') return Array.isArray(block.items) && block.items.some(item => String(item).trim());
        return Boolean(block.text?.trim());
      })),
    );
}
