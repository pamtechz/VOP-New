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
  const lessonIds = ['lesson-01', 'lesson-02'];
  return {
    languages, lessonIds,
    lessons: languages.flatMap(lang => lessonIds.map(lessonId => ({
      lang, lessonId, title: `${lang} ${lessonId}`,
      pages: Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, title: `Page ${i + 1}`, content: 'Approved sample text.' })),
      quiz: Array.from({ length: 5 }, (_, i) => ({ id: `q${i + 1}`, prompt: `Question ${i + 1}`, options: ['A', 'B'], correctOptionIndex: 0 })),
    }))),
  };
}

test('complete snapshots generate while incomplete and duplicate data fail without replacing the prior bundle', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'vop-snapshots-'));
  try {
    mkdirSync(join(workspace, 'scripts'));
    mkdirSync(join(workspace, 'content'));
    copyFileSync(generator, join(workspace, 'scripts/generate-snapshots.js'));
    writeFileSync(join(workspace, 'package.json'), '{"type":"module"}');
    const source = join(workspace, 'content/lessons.master.json');
    const run = () => spawnSync(process.execPath, ['scripts/generate-snapshots.js'], {
      cwd: workspace,
      env: { ...process.env, SNAPSHOT_EXPECTED_LANGUAGES: '2', SNAPSHOT_EXPECTED_LESSONS: '2' },
      encoding: 'utf8',
    });
    const good = master();
    writeFileSync(source, JSON.stringify(good));
    assert.equal(run().status, 0);
    const manifestPath = join(workspace, 'public/lessons/manifest.json');
    const manifest = readFileSync(manifestPath, 'utf8');
    assert.equal(JSON.parse(manifest).count, 4);
    const snapshot = JSON.parse(readFileSync(join(workspace, 'public/lessons/bem/lesson-02.json'), 'utf8'));
    assert.equal(snapshot.pages.length, 20);
    assert.equal(snapshot.quiz.length, 5);
    assert.match(snapshot.revision, /^[a-f0-9]{64}$/);

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
