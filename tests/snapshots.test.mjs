import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const generator = join(dirname(fileURLToPath(import.meta.url)), '../scripts/generate-snapshots.js');

function master() {
  const languages = ['en', 'bem'];
  const languageLabels = ['English', 'Icibemba'];
  const lessonIds = ['lesson-01', 'lesson-02'];
  return {
    languages, languageLabels, lessonIds,
    lessons: languages.flatMap(lang => lessonIds.map(lessonId => ({
      lang, lessonId, title: `${lang} ${lessonId}`,
      pages: Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, title: `Page ${i + 1}`, content: 'Approved sample text.' })),
      quiz: Array.from({ length: 5 }, (_, i) => ({ id: `q${i + 1}`, prompt: `Question ${i + 1}`, options: ['A', 'B'], correctOptionIndex: 0 })),
    }))),
  };
}

test('complete snapshots and data-driven catalog labels generate; incomplete data cannot replace approved output', () => {
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
    const run = () => spawnSync(process.execPath, ['scripts/generate-snapshots.js'], {
      cwd: workspace, encoding: 'utf8',
    });
    const good = master();
    writeFileSync(source, JSON.stringify(good));
    assert.equal(run().status, 0);
    const manifestPath = join(workspace, 'public/lessons/manifest.json');
    const manifest = readFileSync(manifestPath, 'utf8');
    const catalog = JSON.parse(manifest);
    assert.equal(catalog.count, 4);
    assert.deepEqual(catalog.languageLabels, ['English', 'Icibemba']);
    assert.deepEqual(catalog.titles, [
      ['en lesson-01', 'en lesson-02'],
      ['bem lesson-01', 'bem lesson-02'],
    ]);
    const snapshot = JSON.parse(readFileSync(join(workspace, 'public/lessons/bem/lesson-02.json'), 'utf8'));
    assert.equal(snapshot.title, catalog.titles[1][1]);
    assert.equal(snapshot.pages.length, 20);
    assert.equal(snapshot.quiz.length, 5);
    assert.match(snapshot.revision, /^[a-f0-9]{64}$/);

    const withoutLabels = structuredClone(good);
    delete withoutLabels.languageLabels;
    writeFileSync(source, JSON.stringify(withoutLabels));
    assert.notEqual(run().status, 0, 'missing language labels must fail');
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);

    writeFileSync(policyPath, JSON.stringify({ ...approvedPolicy, expectedLanguageCount: 3 }));
    writeFileSync(source, JSON.stringify(good));
    assert.notEqual(run().status, 0, 'mismatched approved inventory must fail');
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest);
    writeFileSync(policyPath, JSON.stringify(approvedPolicy));
    good.lessons.pop();
    writeFileSync(source, JSON.stringify(good));
    assert.notEqual(run().status, 0, 'missing translation must fail');
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest, 'previous bundle must survive incomplete master');

    good.lessons.push({ ...good.lessons[0] });
    writeFileSync(source, JSON.stringify(good));
    assert.notEqual(run().status, 0, 'duplicate translation must fail');
    assert.equal(readFileSync(manifestPath, 'utf8'), manifest, 'previous bundle must survive duplicate master');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
