import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('committed curriculum is the complete source-derived Bemba and Tonga import', () => {
  const policy = JSON.parse(readFileSync(join(root, 'config/curriculum-policy.json'), 'utf8'));
  const metadata = JSON.parse(readFileSync(join(root, 'config/approved-languages.json'), 'utf8'));
  const master = JSON.parse(readFileSync(join(root, 'content/lessons.master.json'), 'utf8'));
  const seed = JSON.parse(readFileSync(join(root, 'content/lessons.seed.json'), 'utf8'));
  const report = JSON.parse(readFileSync(join(root, 'content/import-report.json'), 'utf8'));
  assert.equal(master.schemaVersion, 2);
  assert.equal(master.languages.length, policy.expectedLanguageCount);
  assert.equal(master.lessonIds.length, policy.expectedLessonCount);
  assert.equal(master.lessons.length, policy.expectedLanguageCount * policy.expectedLessonCount);
  assert.deepEqual(master.languageLabels, metadata.languages.map(item => item.label));
  assert.equal(seed.documents.length, master.lessons.length);
  assert.equal(report.lessonCount, master.lessons.length);
  assert.equal(report.pageCount, master.lessons.reduce((count, lesson) => count + lesson.pages.length, 0));
  assert.equal(report.quizQuestionCount, 0);
  assert.ok(master.lessons.every(lesson => Array.isArray(lesson.quiz) && lesson.quiz.length === 0));
  assert.equal(new Set(master.lessons.map(lesson => `${lesson.lang}/${lesson.lessonId}`)).size, master.lessons.length);
  assert.deepEqual(report.warnings.map(item => item.match(/bemba\d+\.html/)?.[0]).filter(Boolean), ['bemba11.html', 'bemba12.html']);
  for (const [name, expected] of Object.entries(report.assetHashes)) {
    const file = join(root, 'content/assets', basename(name));
    assert.ok(existsSync(file), `Missing imported image ${name}`);
    assert.equal(digest(readFileSync(file)), expected, `Image hash mismatch for ${name}`);
  }
  assert.equal(Object.keys(report.assetHashes).length, report.assetCount);
});
