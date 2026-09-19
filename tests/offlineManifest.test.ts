import assert from 'node:assert/strict';
import test from 'node:test';
import { readOfflineManifest } from '../src/services/offlineManifest.ts';

const valid = () => ({
  schemaVersion: 1,
  languages: ['en', 'bem'],
  lessonIds: ['lesson-01', 'lesson-02', 'lesson-03'],
  titles: [
    ['English title one', 'English title two', 'English title three'],
    ['Bemba title one', 'Bemba title two', 'Bemba title three'],
  ],
  count: 6,
  version: 'a'.repeat(64),
});

test('learner inventory and localized lesson titles come from manifest without fixed counts', () => {
  const catalog = readOfflineManifest(valid());
  assert.deepEqual(catalog.languages, ['en', 'bem']);
  assert.deepEqual(catalog.lessonIds, ['lesson-01', 'lesson-02', 'lesson-03']);
  assert.deepEqual(catalog.titles[0], ['English title one', 'English title two', 'English title three']);
  assert.deepEqual(catalog.titles[1], ['Bemba title one', 'Bemba title two', 'Bemba title three']);
  assert.equal(catalog.count, catalog.languages.length * catalog.lessonIds.length);
});

test('empty, inconsistent, missing or malformed localized catalogs fail closed', () => {
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
    { ...valid(), titles: undefined },
    { ...valid(), titles: [] },
    { ...valid(), titles: [['Only one language']] },
    { ...valid(), titles: [['Too few'], ['Bemba one', 'Bemba two', 'Bemba three']] },
    { ...valid(), titles: [['English one', '', 'English three'], ['Bemba one', 'Bemba two', 'Bemba three']] },
    { ...valid(), titles: [['English one', 123, 'English three'], ['Bemba one', 'Bemba two', 'Bemba three']] },
    { ...valid(), version: 'not-a-digest' },
    { ...valid(), schemaVersion: 2 },
  ];
  for (const value of invalid) assert.throws(() => readOfflineManifest(value));
});
