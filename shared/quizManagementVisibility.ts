import { platformStewardedResource } from './platformStewardship.ts';
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
    return { id, ...data, canEdit: isSuperAdmin || !platformStewardedResource(data) };
  }

  const questions = Array.isArray(data.questions)
    ? data.questions.map((raw: unknown) => {
      const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      return {
        key: String(item.key || ''),
        question: String(item.question || ''),
        options: Array.isArray(item.options) ? item.options.map(String) : [],
      };
    })
    : [];
  return {
    id,
    title: String(data.title || ''),
    description: String(data.description || ''),
    language: String(data.language || ''),
    guideId: String(data.guideId || ''),
    attachmentType: ['guide','lesson','chapter','section','block'].includes(String(data.attachmentType || ''))
      ? String(data.attachmentType) : 'guide',
    anchorId: String(data.anchorId || ''),
    assessmentKind: data.assessmentKind === 'final_exam' ? 'final_exam'
      : data.assessmentKind === 'chapter_quiz' ? 'chapter_quiz' : 'practice',
    assessmentInstructions: String(data.assessmentInstructions || ''),
    assessmentTimeLimitMinutes: Number(data.assessmentTimeLimitMinutes || 0),
    assessmentPassThreshold: Number(data.assessmentPassThreshold || 0),
    assessmentMaxAttempts: Number(data.assessmentMaxAttempts || 0),
    assessmentRetakeCooldownMinutes: Number(data.assessmentRetakeCooldownMinutes || 0),
    assessmentFeedbackMode: ['score_only','after_submit','none'].includes(String(data.assessmentFeedbackMode || ''))
      ? String(data.assessmentFeedbackMode) : 'score_only',
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
