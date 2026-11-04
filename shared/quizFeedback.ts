/** Format only private, validated questions after the server grades an attempt. */
export function quizAnswerFeedback(question: {
  options?: unknown; correctOptionIndex?: unknown; answer?: unknown; explanation?: unknown;
}): string {
  const options = question.options;
  const index = question.correctOptionIndex;
  const answer = Array.isArray(options) && Number.isInteger(index)
    && Number(index) >= 0 && Number(index) < options.length
    ? String(options[Number(index)])
    : !Array.isArray(options) && typeof question.answer === 'boolean'
      ? question.answer ? 'True' : 'False' : '';
  const explanation = typeof question.explanation === 'string' ? question.explanation.trim() : '';
  return [answer ? `Correct answer: ${answer}` : '', explanation].filter(Boolean).join('\n');
}
