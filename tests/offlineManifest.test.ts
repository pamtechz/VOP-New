import assert from 'node:assert/strict';
import test from 'node:test';
import { readOfflineManifest } from '../src/services/offlineManifest.ts';

const valid = () => ({
  schemaVersion: 2,
  languages: ['bem', 'toi'],
  languageLabels: ['Bemba', 'Tonga'],
  lessonIds: ['lesson-01', 'lesson-02', 'lesson-03'],
  titles: [
    ['Bemba source title one', 'Bemba source title two', 'Bemba source title three'],
    ['Tonga source title one', 'Tonga source title two', 'Tonga source title three'],
  ],
  count: 6,
  version: 'a'.repeat(64),
  assetHashes: { 'approved.jpg': 'b'.repeat(64) },
});

test('real language names, variable lesson inventory, titles and image checksums come only from manifest', () => {
  const catalog = readOfflineManifest(valid());
  assert.deepEqual(catalog.languages, ['bem', 'toi']);
  assert.deepEqual(catalog.languageLabels, ['Bemba', 'Tonga']);
  assert.deepEqual(catalog.lessonIds, ['lesson-01', 'lesson-02', 'lesson-03']);
  assert.deepEqual(catalog.titles[0], ['Bemba source title one', 'Bemba source title two', 'Bemba source title three']);
  assert.equal(catalog.assetHashes['approved.jpg'], 'b'.repeat(64));
  assert.equal(catalog.count, catalog.languages.length * catalog.lessonIds.length);
});

test('missing, inconsistent, unsafe or old-schema catalogs fail closed', () => {
  const invalid = [
    null, [], {},
    { ...valid(), languages: [] },
    { ...valid(), languageLabels: undefined },
    { ...valid(), languageLabels: [] },
    { ...valid(), languageLabels: ['Bemba'] },
    { ...valid(), languageLabels: ['Bemba', ''] },
    { ...valid(), lessonIds: [] },
    { ...valid(), count: 2080 },
    { ...valid(), count: '6' },
    { ...valid(), languages: ['bem', 'bem'] },
    { ...valid(), lessonIds: ['lesson-01', 'lesson-01', 'lesson-03'] },
    { ...valid(), languages: ['bem', '../secret'] },
    { ...valid(), lessonIds: ['../../admin', 'lesson-02', 'lesson-03'] },
    { ...valid(), titles: undefined },
    { ...valid(), titles: [] },
    { ...valid(), titles: [['Only one language']] },
    { ...valid(), titles: [['Too few'], ['Tonga one', 'Tonga two', 'Tonga three']] },
    { ...valid(), titles: [['Bemba one', '', 'Bemba three'], ['Tonga one', 'Tonga two', 'Tonga three']] },
    { ...valid(), version: 'not-a-digest' },
    { ...valid(), assetHashes: undefined },
    { ...valid(), assetHashes: { '../escape.jpg': 'a'.repeat(64) } },
    { ...valid(), assetHashes: { 'approved.jpg': 'wrong' } },
    { ...valid(), schemaVersion: 1 },
  ];
  for (const value of invalid) assert.throws(() => readOfflineManifest(value));
});
