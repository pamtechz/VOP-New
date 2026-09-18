import test from 'node:test';
import assert from 'node:assert/strict';
import { isLessonConfigured } from '../src/services/lesson.ts';
import { gradeQuiz, isQuizConfigured } from '../src/services/quiz.ts';
import type { Lesson, Question } from '../src/types/index.ts';

const lesson: Lesson = {
  id: 'lesson', title: 'Bible study', lessonNumber: '1', description: '',
  type: 'Lesson', estimatedMinutes: 10,
  contentPages: [{ pageNumber: 1, title: 'The Bible', content: 'A published study paragraph.' }],
};

test('a lesson with substantive published pages is configurable', () => {
  assert.equal(isLessonConfigured(lesson), true);
});

test('empty, missing and whitespace-only lesson pages fail closed', () => {
  assert.equal(isLessonConfigured({ ...lesson, contentPages: [] }), false);
  assert.equal(isLessonConfigured({ ...lesson, contentPages: undefined }), false);
  assert.equal(isLessonConfigured({ ...lesson, contentPages: [{ pageNumber: 1, title: 'Title', content: '   ' }] }), false);
  assert.equal(isLessonConfigured({ ...lesson, contentPages: [{ pageNumber: 1, title: '  ', content: 'Text' }] }), false);
});

test('tests cannot masquerade as readable study lessons', () => {
  assert.equal(isLessonConfigured({ ...lesson, type: 'Test' }), false);
});

test('visually identical question identifiers are rejected after trimming', () => {
  const first: Question = { key: 'q1', question: 'First?', answer: true, explanation: '' };
  const second: Question = { key: ' q1 ', question: 'Second?', answer: false, explanation: '' };
  assert.equal(isQuizConfigured([first, second]), false);
  assert.equal(gradeQuiz([first, second], { 0: true, 1: false }), null);
});
