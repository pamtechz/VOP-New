import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurriculumAverageScore } from '../src/services/progress.ts';
import type { DiscoverGuide, User } from '../src/types/index.ts';

const guide = (id: string, language: string, testCount: number): DiscoverGuide => ({
  id, language, certificateEligible: true,
  lessons: Array.from({ length: testCount }, (_, i) => ({ id: `test-${i}`, type: 'Test' as const })),
}) as DiscoverGuide;
const user = (scores: Record<string, number>): User => ({ progress: { guideScores: scores } }) as User;

test('graduation score is the mean across all tests of required language guides', () => {
  const result = calculateCurriculumAverageScore(
    [guide('one', 'en', 1), guide('two', 'en', 2), guide('translated', 'bem', 1)],
    user({ one: 70, 'two:test-0': 80, 'two:test-1': 100, translated: 0 }), 'en',
  );
  assert.equal(result, 83);
});

test('missing and out-of-range individual marks fail closed', () => {
  const guides = [guide('one', 'en', 2)];
  assert.equal(calculateCurriculumAverageScore(guides, user({ one: 99 }), 'en'), null);
  assert.equal(calculateCurriculumAverageScore(guides, user({ 'one:test-0': 80, 'one:test-1': 120 }), 'en'), null);
});

test('a course without configured required assessments has no average', () => {
  assert.equal(calculateCurriculumAverageScore([], user({}), 'en'), null);
  assert.equal(calculateCurriculumAverageScore([guide('one', 'en', 0)], user({}), 'en'), null);
});
