import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCurriculumProgress } from '../src/services/progress.ts';
import type { DiscoverGuide, User } from '../src/types/index.ts';

const candidate = {
  uid: 'candidate', displayName: 'Candidate', email: '',
  information: { enrollmentDate: '', graduating: false, graduated: false, baptismCandidate: false, baptized: false },
  privileges: { admin: false, guardian: false, editor: false, manager: false, developer: false },
  progress: {
    discoverProgress: 0, completedGuidesCount: 0, totalGuidesCount: 0,
    completedLessons: ['lesson'], guideScores: { 'guide:test-1': 91, 'guide:test-2': 79 },
  },
} as User;
const guides = [{
  id: 'guide', discoverNumber: 1, title: 'Guide', subtitle: 'Guide', description: '', language: 'en', image: '', certificateEligible: true,
  lessons: [
    { id: 'lesson', lessonNumber: '1', title: 'Lesson', type: 'Lesson', description: '', estimatedMinutes: 1 },
    { id: 'test-1', lessonNumber: '2', title: 'Test 1', type: 'Test', description: '', estimatedMinutes: 1 },
    { id: 'test-2', lessonNumber: '3', title: 'Test 2', type: 'Test', description: '', estimatedMinutes: 1 },
  ],
}] as DiscoverGuide[];

test('individual test records must all pass a configurable threshold', () => {
  assert.equal(calculateCurriculumProgress(guides, candidate, 80, 'en').certificateEligible, false);
  const passed = { ...candidate, progress: { ...candidate.progress, guideScores: { 'guide:test-1': 91, 'guide:test-2': 80 } } };
  assert.equal(calculateCurriculumProgress(guides, passed, 80, 'en').certificateEligible, true);
});
