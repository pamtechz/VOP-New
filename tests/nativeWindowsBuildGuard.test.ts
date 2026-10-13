import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(path, 'utf8');

test('Windows launcher verifies missing share_plus Kotlin classes before device build', () => {
  const script = source('native_android/run_android.ps1');
  assert.match(script, /ShareSuccessManager\.kt/);
  assert.match(script, /SharePlusPendingIntent\.kt/);
  assert.match(script, /Get-MissingShareSources/);
  assert.match(script, /RepairSharePlus/);
  assert.match(script, /Refusing to remove a share_plus source outside/);
  assert.match(script, /flutter pub get/);
  assert.match(script, /flutter clean/);
  assert.doesNotMatch(script, /pub cache clean/);
});

test('native Android release requires real signing credentials and protects biometrics', () => {
  const build = source('native_android/android/app/build.gradle.kts');
  const android = source('native_android/android/app/src/main/kotlin/com/sda/vop/MainActivity.kt');
  const manifest = source('native_android/android/app/src/main/AndroidManifest.xml');
  const ignored = source('native_android/.gitignore');
  assert.match(build, /releaseKeyPropertiesFile/);
  assert.match(build, /requestedRelease/);
  assert.match(build, /release keystore/);
  assert.doesNotMatch(build, /signingConfigs\.getByName\("debug"\)/);
  assert.match(android, /FlutterFragmentActivity/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(ignored, /android\/key\.properties/);
});
