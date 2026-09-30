/**
 * One quiz belongs to exactly one guide or to a specific lesson inside a guide.
 * Reused by API writes and regression tests. Never trust client-supplied answer keys.
 */
export type QuizAttachmentType = 'guide' | 'lesson' | 'chapter' | 'section' | 'block';
export type AssessmentKind = 'practice' | 'chapter_quiz' | 'final_exam';
export type AssessmentFeedbackMode = 'after_submit' | 'after_pass' | 'none';
export type AssessmentPolicy = {
  instructions: string;
  timeLimitMinutes: number;
  passingPercent: number | null;
  maxAttempts: number | null;
  retakeCooldownMinutes: number | null;
  feedbackMode: AssessmentFeedbackMode;
};

function optionalWhole(value: unknown, min: number, max: number, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(label);
  return parsed;
}

export function assessmentKindForAttachment(type: QuizAttachmentType): AssessmentKind {
  if (type === 'guide') return 'final_exam';
  if (type === 'chapter') return 'chapter_quiz';
  return 'practice';
}

export function normalizeAssessmentPolicy(value: unknown): AssessmentPolicy {
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const instructions=String(input.instructions||'').trim();
  if(instructions.length>4000)throw new Error('Assessment instructions must not exceed 4,000 characters.');
  const timeLimitMinutes=optionalWhole(input.timeLimitMinutes,0,480,'Time limit must be a whole number from 0 to 480 minutes.') ?? 0;
  const passingPercent=optionalWhole(input.passingPercent,1,100,'Passing percentage must be a whole number from 1 to 100.');
  const maxAttempts=optionalWhole(input.maxAttempts,0,100,'Maximum attempts must be a whole number from 0 to 100.');
  const retakeCooldownMinutes=optionalWhole(input.retakeCooldownMinutes,0,10080,'Retake delay must be a whole number from 0 to 10,080 minutes.');
  const feedbackMode:AssessmentFeedbackMode=input.feedbackMode==='after_pass'||input.feedbackMode==='none'?'after_pass'===input.feedbackMode?'after_pass':'none':'after_submit';
  return {instructions,timeLimitMinutes,passingPercent,maxAttempts,retakeCooldownMinutes,feedbackMode};
}

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

/** Public payload is deliberately incapable of carrying answer keys or explanations.
 * Full questions remain server-only in the contributor-managed quiz document. */
export function publicQuizQuestions(questions: QuizQuestion[]) {
  return questions.map(({ key, question, options }) => ({ key, question, options }));
}
