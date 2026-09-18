import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurriculumProgress } from '../src/services/progress.ts';
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
    { id: `${id}-lesson`, lessonNumber: '1', title: 'Study', type: 'Lesson', description: '', estimatedMinutes: 1 },
    ...Array.from({ length: tests }, (_, i) => ({ id: `${id}-test-${i}`, lessonNumber: `2.${i}`, title: 'Test', type: 'Test' as const, description: '', estimatedMinutes: 1 })),
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
