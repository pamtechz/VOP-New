import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurriculumAverageScore } from '../src/services/progress.ts';
import type { DiscoverGuide, User } from '../src/types/index.ts';

const guide = (id: string, language: string, testCount: number): DiscoverGuide => ({
  id, language, certificateEligible: true,
  lessons: Array.from({ length: testCount }, (_, i) => ({
    id: `${id}-test-${i}`, type: 'Test' as const,
    questions: [{ key: `${id}-q-${i}`, question: 'Configured?', answer: true, explanation: '' }],
  })),
}) as DiscoverGuide;
const user = (scores: Record<string, number>): User => ({ progress: { guideScores: scores } }) as User;

test('graduation score is the mean across all tests of required language guides', () => {
  const result = calculateCurriculumAverageScore(
    [guide('one', 'en', 1), guide('two', 'en', 2), guide('translated', 'bem', 1)],
    user({ one: 70, 'two:two-test-0': 80, 'two:two-test-1': 100, translated: 0 }), 'en',
  );
  assert.equal(result, 83);
});

test('missing and out-of-range individual marks fail closed', () => {
  const guides = [guide('one', 'en', 2)];
  assert.equal(calculateCurriculumAverageScore(guides, user({ one: 99 }), 'en'), null);
  assert.equal(calculateCurriculumAverageScore(guides, user({ 'one:one-test-0': 80, 'one:one-test-1': 120 }), 'en'), null);
});

test('a course without configured required assessments has no average', () => {
  assert.equal(calculateCurriculumAverageScore([], user({}), 'en'), null);
  assert.equal(calculateCurriculumAverageScore([guide('one', 'en', 0)], user({}), 'en'), null);
});

test('ambiguous guide or lesson identifiers cannot contribute to a graduation score', () => {
  const duplicateGuide = [guide('same', 'en', 1), guide('same', 'en', 1)];
  assert.equal(calculateCurriculumAverageScore(duplicateGuide, user({ same: 100 }), 'en'), null);
  const first = guide('one', 'en', 1);
  const second = guide('two', 'en', 1);
  second.lessons[0].id = first.lessons[0].id;
  assert.equal(calculateCurriculumAverageScore([first, second], user({ one: 100, two: 100 }), 'en'), null);
});

test('a deleted or malformed quiz cannot contribute a historical result', () => {
  const course = guide('one', 'en', 1);
  course.lessons[0].questions = [];
  assert.equal(calculateCurriculumAverageScore([course], user({ one: 100 }), 'en'), null);
});
