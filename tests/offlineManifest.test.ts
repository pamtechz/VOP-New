import assert from 'node:assert/strict';
import test from 'node:test';
import { readOfflineManifest } from '../src/services/offlineManifest.ts';

const valid = () => ({
  schemaVersion: 1,
  languages: ['en', 'bem'],
  lessonIds: ['lesson-01', 'lesson-02', 'lesson-03'],
  count: 6,
  version: 'a'.repeat(64),
});

test('learner inventory comes from manifest without fixed language or lesson counts', () => {
  const catalog = readOfflineManifest(valid());
  assert.deepEqual(catalog.languages, ['en', 'bem']);
  assert.deepEqual(catalog.lessonIds, ['lesson-01', 'lesson-02', 'lesson-03']);
  assert.equal(catalog.count, catalog.languages.length * catalog.lessonIds.length);
});

test('an empty, inconsistent, duplicated, malformed or unsafe manifest fails closed', () => {
  const invalid = [
    null, [], {},
    { ...valid(), languages: [] },
    { ...valid(), lessonIds: [] },
    { ...valid(), count: 2080 },
    { ...valid(), count: '6' },
    { ...valid(), languages: ['en', 'en'] },
    { ...valid(), lessonIds: ['lesson-01', 'lesson-01', 'lesson-03'] },
    { ...valid(), languages: ['en', '../secret'] },
    { ...valid(), lessonIds: ['../../admin', 'lesson-02', 'lesson-03'] },
    { ...valid(), version: 'not-a-digest' },
    { ...valid(), schemaVersion: 2 },
  ];
  for (const value of invalid) assert.throws(() => readOfflineManifest(value));
});
