/**
 * Historical audit helper: detects answer-bearing question records inside
 * nested lesson content without modifying or re-scoring student work.
 * The public lesson data may use questions, quiz, pages or contentPages.
 */
export function hasEmbeddedAnswerKeys(value, depth = 0) {
  if (depth > 24 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(entry => hasEmbeddedAnswerKeys(entry, depth + 1));
  const questionLike = Object.hasOwn(value, 'question')
    || Object.hasOwn(value, 'prompt')
    || Object.hasOwn(value, 'options')
    || Object.hasOwn(value, 'key');
  if (questionLike && (
    Object.hasOwn(value, 'correctOptionIndex')
    || Object.hasOwn(value, 'answer')
    || Object.hasOwn(value, 'explanation')
  )) return true;
  return Object.values(value).some(entry => hasEmbeddedAnswerKeys(entry, depth + 1));
}
