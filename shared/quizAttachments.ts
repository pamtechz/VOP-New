/**
 * One quiz belongs to exactly one guide or to a specific lesson inside a guide.
 * Reused by API writes and regression tests. Never trust client-supplied answer keys.
 */
export type QuizAttachmentType = 'guide' | 'lesson';
export type QuizQuestion = {
  key: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  answer: false;
  explanation: string;
};
export function normalizeQuizQuestions(value: unknown, quizId: string): QuizQuestion[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('A quiz can have at most 200 questions.');
  return value.map((raw: unknown, index: number) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid quiz question.');
    const item = raw as Record<string, unknown>;
    const question = String(item.question || '').trim();
    if (!question || question.length > 500) throw new Error(`Question ${index + 1} needs a valid prompt (max 500 characters).`);
    const options = Array.isArray(item.options) ? item.options.map(option => String(option).trim()) : [];
    if (options.length < 2 || options.length > 6 || options.some(option => !option || option.length > 300)) {
      throw new Error(`Question ${index + 1} needs 2–6 nonempty options (max 300 characters each).`);
    }
    const correctOptionIndex = Number(item.correctOptionIndex);
    if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
      throw new Error(`Question ${index + 1} needs a valid correct option.`);
    }
    const explanation = String(item.explanation || '').trim();
    if (explanation.length > 3000) throw new Error(`Question ${index + 1} explanation is too long.`);
    return { key: `${quizId}-q${index + 1}`, question, options, correctOptionIndex, answer: false, explanation };
  });
}
export function quizLessonNumber(attachmentType: QuizAttachmentType, parentLessonNumber?: string): string {
  return attachmentType === 'guide' ? '999999' : `${parentLessonNumber || '0'}.quiz`;
}
