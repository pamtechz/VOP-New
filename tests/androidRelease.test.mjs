import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateAndroidRelease } from '../scripts/validate-android-release.mjs';

const sourceGenerator = join(dirname(fileURLToPath(import.meta.url)), '../scripts/generate-snapshots.js');
const deployment = { schemaVersion: 1, firebaseProjectId: 'synthetic-vop-test', androidPackageName: 'org.test.vop' };
const sender = '123456789';
const environment = {
  VITE_FIREBASE_API_KEY: 'SYNTHETIC_WEB_KEY_NOT_FOR_REAL_FIREBASE',
  VITE_FIREBASE_AUTH_DOMAIN: 'synthetic-vop-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: deployment.firebaseProjectId,
  VITE_FIREBASE_APP_ID: `1:${sender}:web:abcdef`,
};
const registration = {
  project_info: { project_id: deployment.firebaseProjectId, project_number: sender },
  client: [{
    client_info: { mobilesdk_app_id: `1:${sender}:android:abcdef`,
      android_client_info: { package_name: deployment.androidPackageName } },
    oauth_client: [
      { client_type: 1, android_info: { package_name: deployment.androidPackageName, certificate_hash: 'a'.repeat(40) } },
      { client_type: 3, client_id: 'SYNTHETIC_WEB_CLIENT' },
    ],
  }],
};

function setUp(root) {
  for (const directory of ['android/app', 'config', 'content/assets', 'scripts']) mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  copyFileSync(sourceGenerator, join(root, 'scripts/generate-snapshots.js'));
  writeFileSync(join(root, 'config/deployment-policy.json'), JSON.stringify(deployment));
  writeFileSync(join(root, 'config/curriculum-policy.json'), JSON.stringify({
    schemaVersion: 1, expectedLanguageCount: 2, expectedLessonCount: 2,
  }));
  writeFileSync(join(root, 'android/app/google-services.json'), JSON.stringify(registration));
  writeFileSync(join(root, 'android/app/build.gradle'), `namespace = "${deployment.androidPackageName}"\napplicationId "${deployment.androidPackageName}"\n`);
  writeFileSync(join(root, 'capacitor.config.ts'), `appId: '${deployment.androidPackageName}',\n`);
  const languages = ['bem', 'toi'];
  const lessonIds = ['lesson-01', 'lesson-02'];
  const image = Buffer.from([255, 216, 255, 217]); // Synthetic JPEG magic bytes; never production content.
  writeFileSync(join(root, 'content/assets/example.jpg'), image);
  const lessons = languages.flatMap(lang => lessonIds.map((lessonId, index) => ({
    lang, lessonId, title: `${lang} ${lessonId}`,
    pages: Array.from({ length: index + 1 }, (_, pageIndex) => ({
      pageNumber: pageIndex + 1, title: `Section ${pageIndex + 1}`,
      blocks: pageIndex === 0 ? [
        { type: 'text', text: 'Synthetic reading text used only for release regression tests.' },
        { type: 'image', src: 'assets/example.jpg', alt: '' },
      ] : [{ type: 'text', text: 'Additional synthetic reading text.' }],
    })),
    quiz: [], attribution: null,
    source: { file: `test/${lang}/${lessonId}.html`, sha256: createHash('sha256').update('synthetic').digest('hex'), reportedLessonNumber: null },
  })));
  writeFileSync(join(root, 'content/lessons.master.json'), JSON.stringify({
    schemaVersion: 2, languages, languageLabels: ['Bemba', 'Tonga'], lessonIds, lessons,
  }));
  const output = spawnSync(process.execPath, ['scripts/generate-snapshots.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  return { languages, lessonIds, manifestPath: join(root, 'public/lessons/manifest.json') };
}

test('Android release verifies deployment identity, actual source sections and hashed image assets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vop-android-release-'));
  try {
    const { languages, lessonIds, manifestPath } = setUp(root);
    const validate = () => validateAndroidRelease(root, environment);
    assert.deepEqual(await validate(), {
      project: deployment.firebaseProjectId,
      packageName: deployment.androidPackageName,
      snapshotCount: 4,
      imageCount: 1,
    });
    await assert.rejects(validateAndroidRelease(root, { ...environment, VITE_FIREBASE_PROJECT_ID: 'other-project' }),
      /Web Firebase configuration/);
    const registrationPath = join(root, 'android/app/google-services.json');
    const savedRegistration = readFileSync(registrationPath, 'utf8');
    unlinkSync(registrationPath);
    await assert.rejects(validate(), /missing Android Firebase registration/);
    writeFileSync(registrationPath, savedRegistration);

    const first = join(root, 'public/lessons', languages[0], `${lessonIds[0]}.json`);
    const original = readFileSync(first, 'utf8');
    const modified = JSON.parse(original);
    modified.pages[0].blocks[0].text = 'Changed after editorial approval';
    writeFileSync(first, JSON.stringify(modified));
    await assert.rejects(validate(), /content hash mismatch/);
    writeFileSync(first, original);
    const corruptedImage = join(root, 'public/lessons/assets/example.jpg');
    writeFileSync(corruptedImage, 'Corrupted');
    await assert.rejects(validate(), /corrupted or tampered bundled image/);
    writeFileSync(corruptedImage, Buffer.from([255, 216, 255, 217]));

    const manifestOriginal = readFileSync(manifestPath, 'utf8');
    const invalid = JSON.parse(manifestOriginal);
    invalid.titles[0][0] = 'Unauthorized translated title';
    writeFileSync(manifestPath, JSON.stringify(invalid));
    await assert.rejects(validate(), /invalid source identity or schema/);
    writeFileSync(manifestPath, manifestOriginal);
    assert.equal((await validate()).snapshotCount, 4);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
