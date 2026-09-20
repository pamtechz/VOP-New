import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateAndroidRelease } from '../scripts/validate-android-release.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deploymentPolicy = {
  schemaVersion: 1,
  firebaseProjectId: 'voiceofprophecy',
  androidPackageName: 'com.sda.vop',
};
const publicEnvironment = {
  VITE_FIREBASE_API_KEY: 'TEST_PUBLIC_WEB_KEY_NOT_A_REAL_CREDENTIAL',
  VITE_FIREBASE_AUTH_DOMAIN: 'voiceofprophecy.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: deploymentPolicy.firebaseProjectId,
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
};

const googleRegistration = {
  project_info: { project_id: deploymentPolicy.firebaseProjectId, project_number: '123456789' },
  client: [{
    client_info: {
      mobilesdk_app_id: '1:123456789:android:abcdef',
      android_client_info: { package_name: deploymentPolicy.androidPackageName },
    },
    oauth_client: [
      { client_type: 1, android_info: { package_name: deploymentPolicy.androidPackageName, certificate_hash: 'a'.repeat(40) } },
      { client_type: 3, client_id: 'synthetic-web-oauth-id-for-tests' },
    ],
  }],
};

function setUp(root) {
  mkdirSync(join(root, 'android/app'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });
  const deploymentPath = join(root, 'config/deployment-policy.json');
  const policyPath = join(root, 'config/curriculum-policy.json');
  writeFileSync(deploymentPath, JSON.stringify(deploymentPolicy));
  writeFileSync(policyPath, JSON.stringify({ schemaVersion: 1, expectedLanguageCount: 80, expectedLessonCount: 26 }));
  writeFileSync(join(root, 'android/app/google-services.json'), JSON.stringify(googleRegistration));
  writeFileSync(join(root, 'android/app/build.gradle'), `namespace = "${deploymentPolicy.androidPackageName}"\napplicationId "${deploymentPolicy.androidPackageName}"\n`);
  writeFileSync(join(root, 'capacitor.config.ts'), `appId: '${deploymentPolicy.androidPackageName}',\n`);
  const languages = Array.from({ length: 80 }, (_, index) =>
    String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26));
  const lessonIds = Array.from({ length: 26 }, (_, index) => `lesson-${String(index + 1).padStart(2, '0')}`);
  const lessonDir = join(root, 'public/lessons');
  mkdirSync(lessonDir, { recursive: true });
  const pages = Array.from({ length: 20 }, (_, index) => ({
    pageNumber: index + 1, title: `Reading page ${index + 1}`, content: `Substantive approved test fixture page ${index + 1}.`,
  }));
  const quiz = Array.from({ length: 5 }, (_, index) => ({
    id: `q${index + 1}`, prompt: `Question ${index + 1}`, options: ['Option one', 'Option two'], correctOptionIndex: 0,
  }));
  const revisions = [];
  const titles = [];
  for (const language of languages) {
    mkdirSync(join(lessonDir, language));
    const row = [];
    for (const lesson of lessonIds) {
      const title = `${language} ${lesson}`;
      const payload = { schemaVersion: 1, language, lessonId: lesson, title, pages, quiz };
      const revision = digest(payload);
      writeFileSync(join(lessonDir, language, `${lesson}.json`), JSON.stringify({ ...payload, revision }));
      row.push(title);
      revisions.push([`${language}/${lesson}`, revision]);
    }
    titles.push(row);
  }
  const manifestPath = join(lessonDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1, languages, lessonIds, titles, count: languages.length * lessonIds.length,
    version: digest(revisions.sort()),
  }));
  return { languages, lessonIds, manifestPath, policyPath, deploymentPath };
}

test('Android release validates configured deployment identity and every complete snapshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vop-android-release-'));
  try {
    const { languages, lessonIds, manifestPath, policyPath, deploymentPath } = setUp(root);
    const validate = () => validateAndroidRelease(root, publicEnvironment);
    assert.deepEqual(await validate(), {
      project: deploymentPolicy.firebaseProjectId,
      packageName: deploymentPolicy.androidPackageName,
      snapshotCount: 2080,
    });
    await assert.rejects(validateAndroidRelease(root, { ...publicEnvironment, VITE_FIREBASE_PROJECT_ID: 'other-project' }),
      /VITE_FIREBASE_PROJECT_ID/);
    await assert.rejects(validateAndroidRelease(root, { ...publicEnvironment, VITE_FIREBASE_APP_ID: '1:987654321:web:wrong' }),
      /Web app ID/);

    const approvedDeployment = readFileSync(deploymentPath, 'utf8');
    unlinkSync(deploymentPath);
    await assert.rejects(validate(), /missing VOP deployment policy/);
    writeFileSync(deploymentPath, JSON.stringify({ ...deploymentPolicy, firebaseProjectId: 'different-project' }));
    await assert.rejects(validate(), /google-services.json must belong to Firebase project different-project/);
    writeFileSync(deploymentPath, JSON.stringify({ ...deploymentPolicy, androidPackageName: 'invalid package' }));
    await assert.rejects(validate(), /deployment policy has invalid/);
    writeFileSync(deploymentPath, approvedDeployment);

    const registration = join(root, 'android/app/google-services.json');
    const saved = readFileSync(registration, 'utf8');
    unlinkSync(registration);
    await assert.rejects(validate(), /missing Firebase Android registration/);
    const mismatch = structuredClone(googleRegistration);
    mismatch.client[0].client_info.android_client_info.package_name = 'com.other.app';
    writeFileSync(registration, JSON.stringify(mismatch));
    await assert.rejects(validate(), /register Android package/);
    const noFingerprint = structuredClone(googleRegistration);
    noFingerprint.client[0].oauth_client = noFingerprint.client[0].oauth_client.filter(client => client.client_type !== 1);
    writeFileSync(registration, JSON.stringify(noFingerprint));
    await assert.rejects(validate(), /SHA-1 fingerprint/);
    writeFileSync(registration, saved);

    const approvedPolicy = readFileSync(policyPath, 'utf8');
    unlinkSync(policyPath);
    await assert.rejects(validate(), /missing approved curriculum release policy/);
    writeFileSync(policyPath, JSON.stringify({ schemaVersion: 1, expectedLanguageCount: 79, expectedLessonCount: 26 }));
    await assert.rejects(validate(), /exactly 79 languages, 26 lessons/);
    writeFileSync(policyPath, approvedPolicy);

    const first = join(root, 'public/lessons', languages[0], `${lessonIds[0]}.json`);
    const original = readFileSync(first, 'utf8');
    unlinkSync(first);
    await assert.rejects(validate(), /missing snapshot .*json/);
    writeFileSync(first, '{}');
    await assert.rejects(validate(), /invalid schema or identity/);
    writeFileSync(first, '{broken json');
    await assert.rejects(validate(), /invalid JSON in snapshot/);
    const tampered = JSON.parse(original);
    tampered.pages[0].content = 'Changed after approval';
    writeFileSync(first, JSON.stringify(tampered));
    await assert.rejects(validate(), /does not match its revision hash/);
    writeFileSync(first, original);

    const originalManifest = readFileSync(manifestPath, 'utf8');
    const noTitles = JSON.parse(originalManifest);
    delete noTitles.titles;
    writeFileSync(manifestPath, JSON.stringify(noTitles));
    await assert.rejects(validate(), /complete localized titles/);
    const changedTitles = JSON.parse(originalManifest);
    changedTitles.titles[0][0] = 'Unapproved replacement title';
    writeFileSync(manifestPath, JSON.stringify(changedTitles));
    await assert.rejects(validate(), /title does not match the approved localized catalog/);
    const changedManifest = JSON.parse(originalManifest);
    changedManifest.version = 'b'.repeat(64);
    writeFileSync(manifestPath, JSON.stringify(changedManifest));
    await assert.rejects(validate(), /manifest integrity check failed/);
    writeFileSync(manifestPath, originalManifest);
    assert.equal((await validate()).snapshotCount, 2080);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
