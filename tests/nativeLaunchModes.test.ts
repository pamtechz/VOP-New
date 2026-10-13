import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const launcher = readFileSync('native_android/run_vop.ps1', 'utf8');
const native = readFileSync('native_android/run_android.ps1', 'utf8');
const docs = readFileSync('native_android/README.md', 'utf8');

test('VOP launcher supports every documented device target', () => {
  for (const mode of ['USB', 'WiFi', 'Emulator', 'Browser', 'Cloud', 'List']) {
    assert.match(launcher, new RegExp('"' + mode + '"'));
    assert.match(docs, new RegExp('\\-Mode ' + mode));
  }
  assert.match(launcher, /Select-Target/);
  assert.match(launcher, /Get-AndroidDevices/);
  assert.match(launcher, /flutter devices --machine/);
  assert.match(launcher, /Start-Native/);
});

test('wireless mode uses interactive Android 11+ ADB pairing with separate ports', () => {
  assert.match(launcher, /& \$adb pair \$pair/);
  assert.match(launcher, /& \$adb connect \$connect/);
  assert.match(launcher, /Assert-WirelessAddress/);
  assert.match(launcher, /Read-Host "Device IP:port/);
  assert.doesNotMatch(launcher, /pairingCode\s*=|password\s*=/i);
});

test('native emulator and web preview are not conflated', () => {
  assert.match(launcher, /flutter emulators --launch \$target/);
  assert.match(launcher, /https:\/\/vopafrica\.vercel\.app/);
  assert.match(launcher, /not the Android APK/);
  assert.match(launcher, /https:\/\/appetize\.io\/upload/);
  assert.match(launcher, /https:\/\/www\.browserstack\.com\/app-live/);
});

test('cloud builds the Android APK through the existing Firebase-aware script', () => {
  assert.match(launcher, /-BuildApk -EnvFile \$EnvFile/);
  assert.match(native, /\[switch\]\$BuildApk/);
  assert.match(native, /\$flutterArgs = @\("build", "apk", "--debug"\) \+ \$defines/);
  assert.match(native, /Do not pass -DeviceId when building an APK/);
});
