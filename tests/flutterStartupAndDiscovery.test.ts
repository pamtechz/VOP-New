import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const text = (path: string) => readFileSync(path, 'utf8');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('Flutter paints the startup route before the Firebase network initialization completes', () => {
  const source = text('native_android/lib/main.dart');
  assert.match(source, /runApp\(VopAndroidApp\(initialization: initialization\)\)/);
  assert.doesNotMatch(source, /await Firebase\.initializeApp/);
  assert.match(source, /FutureBuilder<String\?>/);
  assert.match(source, /class _StartupScreen extends StatelessWidget/);
  assert.match(source, /_authStream \?\?= FirebaseAuth\.instance\.authStateChanges\(\)/);
});

test('the published catalogue does not block display on local offline snapshot writes', () => {
  const api = text('native_android/lib/core/vop_api.dart');
  assert.match(api, /_queueSnapshot\(owner,kind,id,response\)/);
  assert.match(api, /_snapshotWrites = _snapshotWrites\.then/);
  assert.doesNotMatch(api, /await _offline\.save\(/);
});

test('Flutter and Legacy study browsing use non-dropdown, bounded results', () => {
  const flutter = text('native_android/lib/screens/public_entry_screen.dart');
  const learner = text('native_android/lib/screens/home_shell.dart');
  const legacy = text('src/components/home/PublicStudyCatalogue.tsx');
  assert.match(flutter, /ChoiceChip\(/);
  assert.match(flutter, /_searchDebounce/);
  assert.match(flutter, /guides\.take\(_visibleLimit\)/);
  assert.doesNotMatch(flutter, /DropdownButtonFormField/);
  assert.match(learner, /selectedStudyProgram/);
  assert.match(learner, /visible\.take\(visibleGuideCount\)/);
  assert.match(legacy, /vop-catalogue-pathway/);
  assert.match(legacy, /aria-pressed=\{programme===program\.id\}/);
  assert.doesNotMatch(legacy, /<select/);
  const signedIn = text('src/components/home/HomeDashboard.tsx');
  assert.match(signedIn, /vop-home-language-paths/);
  assert.match(signedIn, /aria-pressed=\{languageFilter===language.code\}/);
  assert.doesNotMatch(signedIn, /<select/);
});

test('installed VOP branding icons are included in both Flutter platforms', () => {
  const manifest = JSON.parse(text('native_android/web/manifest.json'));
  assert.equal(manifest.name, 'Voice of Prophecy');
  assert.ok(manifest.icons.length >= 2);
  const names = ['native_android/web/favicon.png',
    ...manifest.icons.map((icon: {src: string}) => 'native_android/web/' + icon.src),
    ...['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'].map(
      scale => 'native_android/android/app/src/main/res/mipmap-' + scale + '/ic_launcher.png')];
  for (const name of names) {
    assert.ok(existsSync(name), name + ' must be included in the app source');
    assert.ok(readFileSync(name).subarray(0,8).equals(pngSignature), name + ' must be a real PNG');
  }
  assert.ok(existsSync('native_android/assets/brand/vop_logo.png'));
  const packageConfig = text('native_android/pubspec.yaml');
  assert.match(packageConfig, /assets\/brand\/vop_logo\.png/);
  const entry = text('native_android/lib/screens/public_entry_screen.dart');
  assert.match(entry, /Image\.asset\('assets\/brand\/vop_logo\.png'/);
  const android = text('native_android/android/app/src/main/AndroidManifest.xml');
  assert.match(android, /android:icon="@mipmap\/ic_launcher"/);
  const html = text('native_android/web/index.html');
  assert.match(html, /href="favicon\.png"/);
  assert.match(html, /flutter-first-frame/);
  assert.match(html, /flutter_bootstrap\.js/);
});
