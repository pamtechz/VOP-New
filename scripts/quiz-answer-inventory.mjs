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

/**
 * Redaction is permitted only when a complete authoritative private bank
 * exactly matches both public representations and the owning guide. Never
 * infer answers or edit a historical assessment with no matching bank.
 */
export function verifiedMigrationCandidate({ guideId, guideOrganizationId, assessmentPath, assessment, bank }) {
  if (!assessment || !bank || assessment.type !== 'Test') return { reason:'A canonical Test and private bank are required' };
  if (String(assessment.sourceQuizId || '') !== String(bank.id || '') ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(String(bank.id || '')) ||
      String(assessment.guideId || '') !== guideId ||
      String(bank.guideId || '') !== guideId ||
      String(bank.assessmentPath || '') !== assessmentPath ||
      String(assessment.organizationId || '') !== guideOrganizationId ||
      String(bank.organizationId || '') !== guideOrganizationId) {
    return { reason:'Guide, source quiz or organization ownership mismatch' };
  }
  const language = String(assessment.language || '');
  if (!language || language !== String(bank.language || '')) return { reason:'Assessment language mismatch' };
  if (!Array.isArray(assessment.questions) || !Array.isArray(bank.questions) ||
      !assessment.questions.length || assessment.questions.length !== bank.questions.length) {
    return { reason:'Assessment and private bank question counts differ' };
  }

  const publicQuestions = [];
  const seen = new Set();
  for (const record of bank.questions) {
    if (!record || typeof record !== 'object') return { reason:'Invalid private bank question' };
    const key = String(record.key || '').trim(), question = String(record.question || '').trim();
    const options = Array.isArray(record.options) ? record.options.map(String) : [];
    if (!key || seen.has(key) || !question || options.length < 2 ||
        options.some(option => !option.trim()) ||
        !Number.isInteger(record.correctOptionIndex) ||
        record.correctOptionIndex < 0 || record.correctOptionIndex >= options.length) {
      return { reason:'Private bank has invalid or duplicate answer keys' };
    }
    seen.add(key);
    publicQuestions.push({ key, question, options });
  }
  const project = entries => entries.map(item => ({
    key:String(item?.key || '').trim(),
    question:String(item?.question || '').trim(),
    options:Array.isArray(item?.options) ? item.options.map(String) : [],
  }));
  if (JSON.stringify(project(assessment.questions)) !== JSON.stringify(publicQuestions) ||
      (Array.isArray(assessment.quiz) &&
       JSON.stringify(project(assessment.quiz)) !== JSON.stringify(publicQuestions))) {
    return { reason:'Public questions or order disagree with the private bank' };
  }
  return { publicQuestions };
}
