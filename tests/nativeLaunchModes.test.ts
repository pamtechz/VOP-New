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
  assert.match(launcher, /& flutter devices/);
  assert.match(launcher, /& flutter emulators/);
  assert.match(launcher, /ConvertFrom-FlutterDeviceText/);
  assert.match(launcher, /ConvertFrom-FlutterEmulatorText/);
  assert.doesNotMatch(launcher, /flutter (devices|emulators) --machine/);
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

test('USB and Wi-Fi device selectors distinguish Android secure ADB mDNS targets', () => {
  assert.match(launcher, /function Test-WirelessDeviceId/);
  assert.match(launcher, /adb-tls-connect/);
  assert.match(launcher, /Test-WirelessDeviceId \(\[string\]\$_\.id\)/);
  assert.match(launcher, /!\(Test-WirelessDeviceId \(\[string\]\$_\.id\)\)/);
});

test('AVD launcher selects the requested emulator, never another running emulator', () => {
  assert.match(launcher, /\$_\.emulatorId -eq \$EmulatorId/);
  assert.match(launcher, /\$_\.emulatorId -eq \$target/);
  assert.doesNotMatch(launcher, /\$previousIds -notcontains \[string\]\$_\.id/);
  assert.match(launcher, /AVD \$target did not boot/);
  assert.match(launcher, /Select-Target \$selectedRunning \$DeviceId/);
});

test('explicit Android emulator works without parsing Flutter AVD table', () => {
  assert.match(launcher, /if \(\$EmulatorId\) \{/);
  assert.match(launcher, /\$target = \$EmulatorId/);
  assert.match(launcher, /Resolve-AndroidEmulatorExecutable/);
  assert.match(launcher, /& \$emulatorExecutable -list-avds/);
  assert.match(launcher, /shell getprop sys\.boot_completed/);
  assert.match(launcher, /Cold Boot/);
});

test('Vercel import is opt-in and never puts web Firebase app ID in native config', () => {
  const config = readFileSync('native_android/tool/vercel_public_config.ps1', 'utf8');
  const example = readFileSync('native_android/Vop_Android_Config.example.env', 'utf8');
  assert.match(launcher, /\[switch\]\$UseVercelEnv/);
  assert.match(launcher, /VercelEnvironment = \$VercelEnvironment/);
  assert.match(native, /Get-VercelPublicClientSettings/);
  assert.match(native, /VITE_FIREBASE_PROJECT_ID/);
  assert.match(native, /VOP_FIREBASE_ANDROID_API_KEY/);
  assert.match(native, /The web VITE_FIREBASE_APP_ID is deliberately NEVER used for Android/);
  assert.match(config, /Remove-Item -LiteralPath \$tempFile -Force/);
  assert.match(config, /ConvertFrom-VercelClientEnvironmentLines/);
  assert.match(native, /The Vercel \$androidKey does not match/);
  assert.match(native, /app ID and sender ID do not belong to the same project number/);
  assert.doesNotMatch(example, /VOP_FIREBASE_PROJECT_ID=voiceofprophecy/);
  assert.doesNotMatch(example, /VOP_API_BASE_URL=https:\/\//);
});

test('emulator launch reports fatal Flutter exit before waiting or loading Vercel environment', () => {
  assert.match(launcher, /\$launchCode = \$LASTEXITCODE/);
  assert.match(launcher, /if \(\$launchCode -ne 0\) \{/);
  assert.match(launcher, /failed to start \(exit code \$launchCode\)/);
  assert.match(launcher, /not Firebase/);
  assert.match(launcher, /\[switch\]\$ColdBoot/);
  assert.match(launcher, /\[switch\]\$SoftwareGraphics/);
  assert.match(launcher, /"-no-snapshot-load"/);
  assert.match(launcher, /"-gpu", "software"/);
  assert.match(launcher, /Start-Process -FilePath \$emulatorExecutable/);
  assert.match(launcher, /shell getprop sys\.boot_completed/);
  assert.match(launcher, /Write-Host "Android \$target is booted and ready."/);
});
