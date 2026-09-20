import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const generator = join(dirname(fileURLToPath(import.meta.url)), '../scripts/generate-snapshots.js');
function master() {
  const languages = ['bem', 'toi'];
  const languageLabels = ['Bemba', 'Tonga'];
  const lessonIds = ['lesson-01', 'lesson-02'];
  return {
    schemaVersion: 2, languages, languageLabels, lessonIds,
    lessons: languages.flatMap(lang => lessonIds.map(lessonId => ({
      lang, lessonId, title: `${lang} ${lessonId}`,
      pages: [
        { pageNumber: 1, title: 'Introduction', blocks: [{ type: 'text', text: 'Authentic synthetic test fixture text.' }] },
        { pageNumber: 2, title: 'Actual section', blocks: [{ type: 'text', text: 'Second synthetic section.' }] },
      ],
      quiz: [], attribution: null,
      source: { file: `source/${lang}/${lessonId}.html`, sha256: 'a'.repeat(64), reportedLessonNumber: 1 },
    }))),
  };
}

test('real-section snapshots and data-driven labels generate; incomplete source cannot replace output', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'vop-snapshots-'));
  try {
    mkdirSync(join(workspace, 'scripts'));
    mkdirSync(join(workspace, 'content'));
    mkdirSync(join(workspace, 'config'));
    copyFileSync(generator, join(workspace, 'scripts/generate-snapshots.js'));
    writeFileSync(join(workspace, 'package.json'), '{"type":"module"}');
    const policyPath = join(workspace, 'config/curriculum-policy.json');
    const approvedPolicy = { schemaVersion: 1, expectedLanguageCount: 2, expectedLessonCount: 2 };
    writeFileSync(policyPath, JSON.stringify(approvedPolicy));
    const source = join(workspace, 'content/lessons.master.json');
    const run = () => spawnSync(process.execPath, ['scripts/generate-snapshots.js'], { cwd: workspace, encoding: 'utf8' });
    const good = master();
    writeFileSync(source, JSON.stringify(good));
    assert.equal(run().status, 0);
    const manifestPath = join(workspace, 'public/lessons/manifest.json');
    const manifest = readFileSync(manifestPath, 'utf8');
    const catalog = JSON.parse(manifest);
    assert.equal(catalog.schemaVersion, 2);
    assert.equal(catalog.count, 4);
    assert.deepEqual(catalog.languageLabels, ['Bemba', 'Tonga']);
    assert.deepEqual(catalog.assetHashes, {});
    const snapshot = JSON.parse(readFileSync(join(workspace, 'public/lessons/bem/lesson-02.json'), 'utf8'));
    assert.equal(snapshot.title, catalog.titles[0][1]);
    assert.equal(snapshot.pages.length, 2);
    assert.equal(snapshot.quiz.length, 0, 'source with no verified quiz must never receive fabricated questions');
    assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
    assert.equal(run().status, 0, 'identical content rebuild is deterministic');
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);

    const withoutLabels = structuredClone(good);
    delete withoutLabels.languageLabels;
    writeFileSync(source, JSON.stringify(withoutLabels));
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);
    writeFileSync(policyPath, JSON.stringify({ ...approvedPolicy, expectedLanguageCount: 3 }));
    writeFileSync(source, JSON.stringify(good));
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);
    writeFileSync(policyPath, JSON.stringify(approvedPolicy));
    good.lessons.pop();
    writeFileSync(source, JSON.stringify(good));
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);
    good.lessons.push({ ...good.lessons[0] });
    writeFileSync(source, JSON.stringify(good));
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
