import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateAndroidRelease } from '../scripts/validate-android-release.mjs';

const publicEnvironment = {
  VITE_FIREBASE_API_KEY: 'TEST_PUBLIC_WEB_KEY_NOT_A_REAL_CREDENTIAL',
  VITE_FIREBASE_AUTH_DOMAIN: 'voiceofprophecy.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'voiceofprophecy',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
};

const googleRegistration = {
  project_info: { project_id: 'voiceofprophecy', project_number: '123456789' },
  client: [{
    client_info: {
      mobilesdk_app_id: '1:123456789:android:abcdef',
      android_client_info: { package_name: 'com.sda.vop' },
    },
    oauth_client: [
      { client_type: 1, android_info: { package_name: 'com.sda.vop', certificate_hash: 'a'.repeat(40) } },
      { client_type: 3, client_id: 'synthetic-web-oauth-id-for-tests' },
    ],
  }],
};

function setUp(root) {
  mkdirSync(join(root, 'android/app'), { recursive: true });
  writeFileSync(join(root, 'android/app/google-services.json'), JSON.stringify(googleRegistration));
  writeFileSync(join(root, 'android/app/build.gradle'), 'namespace = "com.sda.vop"\napplicationId "com.sda.vop"\n');
  writeFileSync(join(root, 'capacitor.config.ts'), "appId: 'com.sda.vop',\n");
  const languages = Array.from({ length: 80 }, (_, index) =>
    String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26));
  const lessonIds = Array.from({ length: 26 }, (_, index) => `lesson-${String(index + 1).padStart(2, '0')}`);
  const lessonDir = join(root, 'public/lessons');
  mkdirSync(lessonDir, { recursive: true });
  writeFileSync(join(lessonDir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, languages, lessonIds, count: 2080, version: 'b'.repeat(64),
  }));
  for (const language of languages) {
    mkdirSync(join(lessonDir, language));
    for (const lesson of lessonIds) writeFileSync(join(lessonDir, language, `${lesson}.json`), '{}');
  }
  return { languages, lessonIds };
}

test('Android release validates registration, configuration and entire packaged lesson matrix', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vop-android-release-'));
  try {
    const { languages, lessonIds } = setUp(root);
    assert.deepEqual(await validateAndroidRelease(root, publicEnvironment), {
      project: 'voiceofprophecy', packageName: 'com.sda.vop', snapshotCount: 2080,
    });
    await assert.rejects(validateAndroidRelease(root, { ...publicEnvironment, VITE_FIREBASE_PROJECT_ID: 'other-project' }),
      /VITE_FIREBASE_PROJECT_ID/);
    await assert.rejects(validateAndroidRelease(root, { ...publicEnvironment, VITE_FIREBASE_APP_ID: '1:987654321:web:wrong' }),
      /Web app ID/);

    const registration = join(root, 'android/app/google-services.json');
    const saved = readFileSync(registration, 'utf8');
    unlinkSync(registration);
    await assert.rejects(validateAndroidRelease(root, publicEnvironment), /missing Firebase Android registration/);
    const mismatch = structuredClone(googleRegistration);
    mismatch.client[0].client_info.android_client_info.package_name = 'com.other.app';
    writeFileSync(registration, JSON.stringify(mismatch));
    await assert.rejects(validateAndroidRelease(root, publicEnvironment), /register Android package/);
    const noFingerprint = structuredClone(googleRegistration);
    noFingerprint.client[0].oauth_client = noFingerprint.client[0].oauth_client.filter(client => client.client_type !== 1);
    writeFileSync(registration, JSON.stringify(noFingerprint));
    await assert.rejects(validateAndroidRelease(root, publicEnvironment), /SHA-1 fingerprint/);
    writeFileSync(registration, saved);

    const missingLesson = join(root, 'public/lessons', languages[0], `${lessonIds[0]}.json`);
    unlinkSync(missingLesson);
    await assert.rejects(validateAndroidRelease(root, publicEnvironment), /snapshot .* is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
