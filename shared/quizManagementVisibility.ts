import { publicQuizQuestions, type QuizQuestion } from './quizAttachments.js';

/**
 * A contributor can discover shared or same-tenant quizzes, but only the author
 * (and the Super Admin) may receive an unredacted quiz bank. A whitelist, rather
 * than a shallow copy, ensures new server-only fields are not exposed by default.
 */
export function quizManagementItem(
  id: string,
  data: Record<string, unknown>,
  callerUid: string,
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin || (Boolean(callerUid) && data.ownerUid === callerUid)) {
    return { id, ...data, canEdit: true };
  }

  const questions = Array.isArray(data.questions)
    ? publicQuizQuestions(data.questions as QuizQuestion[])
    : [];
  return {
    id,
    title: String(data.title || ''),
    description: String(data.description || ''),
    language: String(data.language || ''),
    guideId: String(data.guideId || ''),
    attachmentType: data.attachmentType === 'lesson' ? 'lesson' : 'guide',
    lessonId: String(data.lessonId || ''),
    organizationId: String(data.organizationId || ''),
    ownerOrganizationId: String(data.ownerOrganizationId || ''),
    ownerUid: String(data.ownerUid || ''),
    sharingScope: String(data.sharingScope || ''),
    published: data.published === true,
    archived: data.archived === true,
    sourceContentId: String(data.sourceContentId || ''),
    questions,
    canEdit: false,
  };
}
