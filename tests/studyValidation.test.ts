import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredPassThreshold, validStudyId, validStudyLanguage } from '../shared/studyValidation.ts';

test('study paths accept simple document IDs but reject Firestore path injection', () => {
  for (const id of ['discover', 'guide_123', 'quiz-ab_cd']) assert.equal(validStudyId(id), true);
  for (const id of ['', '../users', 'abc/def', '.', 'spaces here', 'x'.repeat(121)]) {
    assert.equal(validStudyId(id), false, id);
  }
});

test('study locales are BCP-47-like codes, never Firestore paths', () => {
  for (const code of ['en', 'eng', 'bem', 'pt-br', 'zh-hant']) assert.equal(validStudyLanguage(code), true);
  for (const code of ['', 'en/../../users', 'en US', '__proto__', 'A', 'x'.repeat(125)]) {
    assert.equal(validStudyLanguage(code), false, code);
  }
});

test('missing or zero pass marks fail closed rather than giving a free pass', () => {
  for (const value of [undefined, null, '', '  ', 'not configured', 0, '0', -1, 101, NaN, Infinity, true]) {
    assert.equal(configuredPassThreshold(value), null, String(value));
  }
  for (const value of [1, 70, '80', 100]) {
    assert.equal(configuredPassThreshold(value), Number(value));
  }
});
