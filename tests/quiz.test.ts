import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuiz, isQuizConfigured } from '../src/services/quiz.ts';
import type { Question } from '../src/types/index.ts';

const trueFalse: Question = { key: 'tf', question: 'A factual question', answer: false, explanation: '' };
const multipleChoice: Question = {
  key: 'mc', question: 'Choose the correct option', answer: false, explanation: '',
  options: ['first', 'second', 'third'], correctOptionIndex: 1,
};

test('correctly grades validated mixed true/false and multiple-choice questions', () => {
  assert.equal(isQuizConfigured([trueFalse, multipleChoice]), true);
  assert.equal(gradeQuiz([trueFalse, multipleChoice], { 0: false, 1: 1 }), 100);
  assert.equal(gradeQuiz([trueFalse, multipleChoice], { 0: false, 1: 0 }), 50);
});

test('rejects missing questions and answers rather than awarding a score', () => {
  assert.equal(isQuizConfigured([]), false);
  assert.equal(gradeQuiz([], {}), null);
  assert.equal(gradeQuiz([trueFalse, multipleChoice], { 0: false }), null);
});

test('misconfigured multiple-choice cannot fall back to true or false', () => {
  const missingKey: Question = { ...multipleChoice, correctOptionIndex: undefined };
  const invalidKey: Question = { ...multipleChoice, correctOptionIndex: 8 };
  const missingOption: Question = { ...multipleChoice, options: ['first', ''] };
  for (const question of [missingKey, invalidKey, missingOption]) {
    assert.equal(isQuizConfigured([question]), false);
    assert.equal(gradeQuiz([question], { 0: false }), null);
  }
});

test('only answer values of the correct question type are accepted', () => {
  assert.equal(gradeQuiz([trueFalse], { 0: 0 }), null);
  assert.equal(gradeQuiz([multipleChoice], { 0: true }), null);
  assert.equal(gradeQuiz([multipleChoice], { 0: 100 }), null);
});

test('missing and blank question IDs are invalid', () => {
  for (const key of ['', '  ', undefined]) {
    const question = { ...trueFalse, key } as Question;
    assert.equal(isQuizConfigured([question]), false);
    assert.equal(gradeQuiz([question], { 0: false }), null);
  }
});

test('duplicate question IDs cannot produce a passing result', () => {
  const duplicate = { ...multipleChoice, key: trueFalse.key };
  assert.equal(isQuizConfigured([trueFalse, duplicate]), false);
  assert.equal(gradeQuiz([trueFalse, duplicate], { 0: false, 1: 1 }), null);
});
