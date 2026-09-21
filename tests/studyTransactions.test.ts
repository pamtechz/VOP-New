import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLessonCompletion, applyQuizScore } from '../src/services/studyTransactions.ts';
import type { DiscoverGuide, User } from '../src/types/index.ts';

const user = (): User => ({
  uid: 'learner', displayName: 'Learner', email: '',
  privileges: { admin: false, guardian: false, editor: false, manager: false, developer: false },
  information: { enrollmentDate: '', graduating: false, graduated: false, baptismCandidate: false, baptized: false },
  progress: { discoverProgress: 0, completedGuidesCount: 0, totalGuidesCount: 0, completedLessons: [], guideScores: {} },
});
const guide = (id = 'guide', language = 'en'): DiscoverGuide => ({
  id, discoverNumber: 1, title: 'Guide', subtitle: 'Guide', description: '', language, image: '', certificateEligible: true,
  lessons: [
    { id: `${id}-lesson`, lessonNumber: '1', type: 'Lesson', title: 'Bible study', description: '', estimatedMinutes: 1,
      contentPages: [{ pageNumber: 1, title: 'Study', content: 'Configured Bible lesson.' }] },
    { id: `${id}-test-1`, lessonNumber: '2', type: 'Test', title: 'Test 1', description: '', estimatedMinutes: 1,
      questions: [{ key: 'q1', question: 'Is this a configured question?', answer: true, explanation: '' }] },
    { id: `${id}-test-2`, lessonNumber: '3', type: 'Test', title: 'Test 2', description: '', estimatedMinutes: 1,
      questions: [{ key: 'q2', question: 'Is this another configured question?', answer: true, explanation: '' }] },
  ],
});

test('completed lesson and two assessment marks update active-language progress independently', () => {
  const guides = [guide(), guide('translation', 'bem')];
  const completed = applyLessonCompletion(user(), guides, 80, 'en', 'guide', 'guide-lesson');
  assert.ok(completed);
  assert.deepEqual(completed.progress.completedLessons, ['guide-lesson']);
  assert.equal(completed.progress.totalGuidesCount, 1);
  const first = applyQuizScore(completed, guides, 80, 'en', 'guide', 'guide-test-1', 91);
  assert.ok(first);
  assert.equal(first.progress.completedGuidesCount, 0);
  const second = applyQuizScore(first, guides, 80, 'en', 'guide', 'guide-test-2', 80);
  assert.ok(second);
  assert.deepEqual(second.progress.guideScores, { 'guide:guide-test-1': 91, 'guide:guide-test-2': 80 });
  assert.equal(second.progress.discoverProgress, 100);
  assert.equal(second.progress.completedGuidesCount, 1);
  assert.deepEqual(user().progress.guideScores, {});
});

test('a failed assessment is never made a guide-wide pass, and retake overwrites just its own mark', () => {
  const guides = [guide()];
  const first = applyQuizScore(user(), guides, 80, 'en', 'guide', 'guide-test-1', 79.5);
  assert.ok(first);
  assert.equal(first.progress.completedGuidesCount, 0);
  assert.equal(first.progress.guideScores['guide:guide-test-1'], 79.5);
  assert.equal(Object.hasOwn(first.progress.guideScores, 'guide'), false);
  const second = applyQuizScore(first, guides, 80, 'en', 'guide', 'guide-test-1', 80);
  assert.equal(second?.progress.guideScores['guide:guide-test-1'], 80);
});

test('rejects non-existent, wrong-language or repeated lesson identifiers', () => {
  const original = guide();
  assert.equal(applyLessonCompletion(user(), [original], 80, 'en', 'guide', 'not-present'), null);
  assert.equal(applyLessonCompletion(user(), [original], 80, 'bem', 'guide', 'guide-lesson'), null);
  const duplicate = guide('second');
  duplicate.lessons[0].id = 'guide-lesson';
  assert.equal(applyLessonCompletion(user(), [original, duplicate], 80, 'en', 'guide', 'guide-lesson'), null);
});

test('rejects blank lesson content, missing tests and invalid or out-of-range marks', () => {
  const original = guide();
  original.lessons[0].contentPages = [];
  assert.equal(applyLessonCompletion(user(), [original], 80, 'en', 'guide', 'guide-lesson'), null);
  assert.equal(applyQuizScore(user(), [original], 80, 'en', 'guide', 'unknown', 90), null);
  original.lessons[1].questions = [];
  assert.equal(applyQuizScore(user(), [original], 80, 'en', 'guide', 'guide-test-1', 90), null);
  assert.equal(applyQuizScore(user(), [guide()], 80, 'en', 'guide', 'guide-test-1', 101), null);
  assert.equal(applyQuizScore(user(), [guide()], 80, 'en', 'guide', 'guide-test-1', Number.NaN), null);
});

test('invalid configured passing marks fail closed', () => {
  assert.equal(applyLessonCompletion(user(), [guide()], Number.NaN, 'en', 'guide', 'guide-lesson'), null);
  assert.equal(applyQuizScore(user(), [guide()], -1, 'en', 'guide', 'guide-test-1', 90), null);
});
