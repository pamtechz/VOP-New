import type { Question } from '../types';

/** A misconfigured question cannot silently change from multiple-choice to true/false. */
export function isQuestionConfigured(question: Question): boolean {
  if (!question || typeof question.key !== 'string' || !question.key.trim() ||
      typeof question.question !== 'string' || !question.question.trim()) return false;
  if (question.options !== undefined || question.correctOptionIndex !== undefined) {
    return Array.isArray(question.options) && question.options.length >= 2 &&
      question.options.every(option => typeof option === 'string' && option.trim().length > 0) &&
      Number.isInteger(question.correctOptionIndex) &&
      question.correctOptionIndex! >= 0 && question.correctOptionIndex! < question.options.length;
  }
  return typeof question.answer === 'boolean';
}

/** Question IDs must be stable and unambiguous within each assessment. */
export function isQuizConfigured(questions: Question[]): boolean {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  const keys = new Set<string>();
  for (const question of questions) {
    if (!isQuestionConfigured(question)) return false;
    const key = question.key.trim();
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

/**
 * Return null for invalid or unanswered assessments. Keep the exact percentage:
 * rounding BEFORE comparing a configured threshold can incorrectly grant a pass
 * (for example, 159/200 = 79.5%, rounded to 80%). Round only for display.
 * This calculation is device-local and does not constitute a trusted grade.
 */
export function gradeQuiz(
  questions: Question[],
  answers: Record<number, number | boolean>,
): number | null {
  if (!isQuizConfigured(questions)) return null;
  let correct = 0;
  for (let i = 0; i < questions.length; i += 1) {
    if (!Object.hasOwn(answers, i)) return null;
    const question = questions[i];
    const answer = answers[i];
    if (Array.isArray(question.options)) {
      if (typeof answer !== 'number' || !Number.isInteger(answer) ||
          answer < 0 || answer >= question.options.length) return null;
      if (answer === question.correctOptionIndex) correct += 1;
    } else {
      if (typeof answer !== 'boolean') return null;
      if (answer === question.answer) correct += 1;
    }
  }
  return correct * 100 / questions.length;
}

/** Validate learner-visible quiz shape, which intentionally has no answer key.
 * True/false legacy quizzes may still have an answer field; only the server
 * may grade learner responses. */
export function isPlayableQuizConfigured(questions: Question[]): boolean {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  const keys = new Set<string>();
  for (const question of questions) {
    if (!question || typeof question.key !== 'string' || !question.key.trim()
        || typeof question.question !== 'string' || !question.question.trim()) return false;
    const key = question.key.trim();
    if (keys.has(key)) return false;
    keys.add(key);
    if (question.options !== undefined) {
      if (!Array.isArray(question.options) || question.options.length < 2
          || !question.options.every(option => typeof option === 'string' && Boolean(option.trim()))) return false;
    } else if (question.questionType === 'true_false') {
      // Canonical true/false answer keys are deliberately server-only.
    } else if (typeof question.answer !== 'boolean') {
      // Legacy optionless questions without an explicit safe type remain
      // invalid rather than guessing their shape.
      return false;
    }
  }
  return true;
}

export function areQuizResponsesComplete(
  questions: Question[],
  responses: Record<number, number | boolean>,
): boolean {
  if (!isPlayableQuizConfigured(questions)) return false;
  return questions.every((question, index) => {
    if (!Object.hasOwn(responses, index)) return false;
    const answer = responses[index];
    return Array.isArray(question.options)
      ? typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < question.options.length
      : (question.questionType === 'true_false' || typeof question.answer === 'boolean') && typeof answer === 'boolean';
  });
}
