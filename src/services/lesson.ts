import type { Lesson } from '../types';

/**
 * Empty or malformed study content must never count as a completed lesson.
 * This is a device-local integrity check, not proof of server-side completion.
 */
function hasRenderablePageContent(page: NonNullable<Lesson['contentPages']>[number]): boolean {
  if (typeof page.content === 'string' && page.content.trim().length > 0) return true;
  if (!Array.isArray(page.blocks)) return false;
  return page.blocks.some(block => {
    if (!block || typeof block !== 'object' || typeof block.type !== 'string') return false;
    if (block.type === 'divider') return true;
    if (block.type === 'image') return Boolean(block.imageUrl?.trim());
    if (block.type === 'video' || block.type === 'link') return Boolean(block.url?.trim());
    if (block.type === 'list') return Array.isArray(block.items) && block.items.some(item => String(item).trim().length > 0);
    return Boolean(block.text?.trim());
  });
}

export function isLessonConfigured(lesson: Lesson): boolean {
  return lesson?.type === 'Lesson' && Array.isArray(lesson.contentPages) &&
    lesson.contentPages.length > 0 && lesson.contentPages.every(page =>
      page !== null && typeof page === 'object' &&
      typeof page.title === 'string' && page.title.trim().length > 0 &&
      hasRenderablePageContent(page),
    );
}
