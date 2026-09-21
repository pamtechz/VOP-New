import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurriculumProgress, calculateCurriculumAverageScore } from '../src/services/progress.ts';
import type { DiscoverGuide, User } from '../src/types/index.ts';

const learner = (done: string[], scores: Record<string, number>): User => ({
  uid: 'learner', displayName: 'Learner', email: '', role: 'student',
  privileges: { admin: false, guardian: false, editor: false, manager: false, developer: false },
  information: { enrollmentDate: '', graduating: false, graduated: false, baptismCandidate: false, baptized: false },
  progress: { discoverProgress: 0, completedGuidesCount: 0, totalGuidesCount: 0, completedLessons: done, guideScores: scores },
});
const guide = (id: string, language = 'en', tests = 1): DiscoverGuide => ({
  id, discoverNumber: 1, title: id, subtitle: id, description: '', language, image: '', certificateEligible: true,
  lessons: [
    {
      id: `${id}-lesson`, lessonNumber: '1', title: 'Study', type: 'Lesson', description: '', estimatedMinutes: 1,
      contentPages: [{ pageNumber: 1, title: 'Study page', content: 'Meaningful Bible study material.' }],
    },
    ...Array.from({ length: tests }, (_, i) => ({
      id: `${id}-test-${i}`, lessonNumber: `2.${i}`, title: 'Test', type: 'Test' as const,
      description: '', estimatedMinutes: 1,
      questions: [{ key: `${id}-question-${i}`, question: 'A configured question?', answer: true, explanation: '' }],
    })),
  ],
});

test('an empty curriculum cannot issue a certificate', () => {
  const result = calculateCurriculumProgress([], learner([], {}), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.percent, 0);
});

test('only active-language required guides count, not translated duplicates', () => {
  const result = calculateCurriculumProgress([guide('en'), guide('bem', 'bem')], learner(['en-lesson'], { en: 90 }), 80, 'en');
  assert.equal(result.totalGuides, 1);
  assert.equal(result.completedGuides, 1);
  assert.equal(result.percent, 100);
  assert.equal(result.certificateEligible, true);
});

test('a configured threshold gates tests and certificate eligibility', () => {
  const guides = [guide('a')];
  assert.equal(calculateCurriculumProgress(guides, learner(['a-lesson'], { a: 85 }), 90, 'en').certificateEligible, false);
  assert.equal(calculateCurriculumProgress(guides, learner(['a-lesson'], { a: 90 }), 90, 'en').certificateEligible, true);
});

test('unfinished lessons cannot be bypassed by a passing score', () => {
  const result = calculateCurriculumProgress([guide('a')], learner([], { a: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.percent, 50);
});

test('the legacy single guide score cannot attest to multiple tests', () => {
  const result = calculateCurriculumProgress([guide('a', 'en', 2)], learner(['a-lesson'], { a: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.completedItems, 1);
});

test('invalid threshold fails closed at 100 percent', () => {
  assert.equal(calculateCurriculumProgress([guide('a')], learner(['a-lesson'], { a: 99 }), Number.NaN, 'en').certificateEligible, false);
});

test('a malformed individual score does not fall back to a historical pass', () => {
  const result = calculateCurriculumProgress([guide('a')], learner(['a-lesson'], {
    a: 100, 'a:a-test-0': Number.NaN,
  }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.completedItems, 1);
});

test('scores outside 0 through 100 never count as a pass', () => {
  for (const score of [-1, 101, Infinity, Number.NaN]) {
    const result = calculateCurriculumProgress([guide('a')], learner(['a-lesson'], { 'a:a-test-0': score }), 80, 'en');
    assert.equal(result.certificateEligible, false);
  }
});

test('duplicate required guide identifiers cannot inflate completion', () => {
  const one = guide('same');
  const result = calculateCurriculumProgress([one, { ...one }], learner(['same-lesson'], { same: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.completedGuides, 0);
  assert.match(result.configurationError ?? '', /unique/);
});

test('one lesson completion cannot satisfy two required guides with a shared lesson ID', () => {
  const first = guide('first');
  const second = guide('second');
  second.lessons[0].id = first.lessons[0].id;
  const result = calculateCurriculumProgress([first, second], learner(['first-lesson'], {
    first: 90, second: 90,
  }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.match(result.configurationError ?? '', /lesson/i);
});

test('collisions outside the selected language do not block valid progress', () => {
  const first = guide('en');
  const translation = { ...first, language: 'bem' };
  const result = calculateCurriculumProgress([first, translation], learner(['en-lesson'], { en: 100 }), 80, 'en');
  assert.equal(result.configurationError, undefined);
  assert.equal(result.certificateEligible, true);
});

test('a saved passing score cannot certify a test whose questions were deleted', () => {
  const course = guide('a');
  course.lessons[1].questions = [];
  const result = calculateCurriculumProgress([course], learner(['a-lesson'], { a: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.completedItems, 1);
  assert.match(result.configurationError ?? '', /assessment/i);
});

test('an invalid answer key fails closed even with a historical passing score', () => {
  const course = guide('a');
  course.lessons[1].questions = [{ key: 'broken', question: 'Choose', answer: true, options: ['One', 'Two'], correctOptionIndex: 4, explanation: '' }];
  const result = calculateCurriculumProgress([course], learner(['a-lesson'], { a: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.match(result.configurationError ?? '', /answer keys/i);
});

test('an empty lesson cannot earn credit from a saved completion flag', () => {
  const course = guide('a');
  course.lessons[0].contentPages = [];
  const result = calculateCurriculumProgress([course], learner(['a-lesson'], { a: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.completedItems, 1);
  assert.match(result.configurationError ?? '', /study content/i);
});

test('an unknown required item type blocks eligibility', () => {
  const course = guide('a');
  course.lessons[0].type = 'Unsupported' as 'Lesson';
  const result = calculateCurriculumProgress([course], learner(['a-lesson'], { a: 100 }), 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.match(result.configurationError ?? '', /unknown/i);
});

test('two different tests cannot share a composite score key', () => {
  const first = guide('alpha:beta');
  const second = guide('alpha');
  first.lessons[1].id = 'gamma';
  second.lessons[1].id = 'beta:gamma';
  const candidate = learner(['alpha:beta-lesson', 'alpha-lesson'], { 'alpha:beta:gamma': 100 });
  const courses = [first, second];
  const result = calculateCurriculumProgress(courses, candidate, 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.equal(result.completedGuides, 0);
  assert.match(result.configurationError ?? '', /ambiguous score identifiers/i);
  assert.equal(calculateCurriculumAverageScore(courses, candidate, 'en'), null);
});

test('a test score key cannot impersonate a historical guide-wide score', () => {
  const first = guide('a');
  const second = guide('a:b:c');
  first.lessons[1].id = 'b:c';
  const candidate = learner(['a-lesson', 'a:b:c-lesson'], {
    'a:b:c': 100, 'a:b:c:a:b:c-test-0': 100,
  });
  const courses = [first, second];
  const result = calculateCurriculumProgress(courses, candidate, 80, 'en');
  assert.equal(result.certificateEligible, false);
  assert.match(result.configurationError ?? '', /ambiguous score identifiers/i);
  assert.equal(calculateCurriculumAverageScore(courses, candidate, 'en'), null);
});
