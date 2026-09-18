import type { Question } from '../types';

/** A misconfigured question cannot silently change from multiple-choice to true/false. */
export function isQuestionConfigured(question: Question): boolean {
  if (!question || typeof question.question !== 'string' || !question.question.trim()) return false;
  if (question.options !== undefined || question.correctOptionIndex !== undefined) {
    return Array.isArray(question.options) && question.options.length >= 2 &&
      question.options.every(option => typeof option === 'string' && option.trim().length > 0) &&
      Number.isInteger(question.correctOptionIndex) &&
      question.correctOptionIndex! >= 0 && question.correctOptionIndex! < question.options.length;
  }
  return typeof question.answer === 'boolean';
}

export function isQuizConfigured(questions: Question[]): boolean {
  return Array.isArray(questions) && questions.length > 0 && questions.every(isQuestionConfigured);
}

/** Return null, not a score, for missing, malformed or unanswered assessments. */
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
  return Math.round(correct * 100 / questions.length);
}
