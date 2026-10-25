import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync('native_android/lib/screens/' + name, 'utf8');

test('Scripture Memory and Challenges have adaptive desktop navigation and mobile controls', () => {
  const source = read('engagement_screen.dart');
  assert.match(source, /layout\.maxWidth>=1080/);
  assert.match(source, /NavigationRail\(/);
  assert.match(source, /onDestinationSelected:_chooseArea/);
  assert.match(source, /if\(!desktop\) Padding/);
  assert.match(source, /SegmentedButton<int>\(/);
  assert.match(source, /Expanded\(child:tab==0\?_decks\(\):_challenges\(\)\)/);
  assert.match(source, /if\(tab==1&&!challengesLoaded\)reload\(\)/);
});

test('Other learner destinations are readable on desktop without changing mobile behavior', () => {
  for (const name of [
    'certificates_screen.dart',
    'offline_studies_screen.dart',
    'notifications_screen.dart',
    'prayer_screen.dart',
  ]) {
    const source = read(name);
    assert.match(source, /import '\.\.\/widgets\/vop_desktop_layout\.dart';/, name);
    assert.match(source, /VopDesktopContent\(maxWidth:/, name);
  }
  const layout = readFileSync('native_android/lib/widgets/vop_desktop_layout.dart', 'utf8');
  assert.match(layout, /MediaQuery\.sizeOf\(context\)\.width < 1000/);
  assert.match(layout, /if \(MediaQuery\.sizeOf\(context\)\.width < 1000\) return child/);
});

test('Notification inbox builds only visible messages and retains existing protected actions', () => {
  const source = read('notifications_screen.dart');
  assert.match(source, /ListView\.builder\(/);
  assert.match(source, /itemCount:notifications\.length\+1/);
  assert.match(source, /final item=notifications\[index-1\]/);
  assert.match(source, /widget\.api\.markNotificationRead\(/);
  assert.match(source, /widget\.api\.deleteNotification\(/);
  assert.doesNotMatch(source, /\.\.\.notifications\.map/);
});

test('Offline and prayer screens preserve their critical workflows', () => {
  const offline = read('offline_studies_screen.dart');
  const prayer = read('prayer_screen.dart');
  assert.match(offline, /widget\.api\.downloadedStudies\(\)/);
  assert.match(offline, /widget\.api\.pendingOfflineChanges\(\)/);
  assert.match(offline, /onPressed:syncing\?null:_sync/);
  assert.match(offline, /onPressed:\(\)=>_delete\(item\)/);
  assert.match(prayer, /return widget\.embedded\?body:Scaffold/);
  assert.match(prayer, /onPressed:\(\)=>_compose\(item\)/);
  assert.match(prayer, /onPressed:\(\)=>_markAnswered\(item\)/);
});
