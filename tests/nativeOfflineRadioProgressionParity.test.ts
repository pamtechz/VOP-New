import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

test('Android offline packages are encrypted, user scoped and require server grading',()=>{
  const store=source('native_android/lib/core/offline_study.dart');
  const quiz=source('native_android/lib/screens/quiz_screen.dart');
  assert.match(store,/FlutterSecureStorage/);
  assert.match(store,/FirebaseAuth\.instance\.currentUser/);
  assert.match(store,/await api\.completeLesson/);
  assert.match(store,/await api\.submitQuiz/);
  assert.match(store,/Future<void> saveQuiz/);
  assert.match(store,/expiresAt/);
  assert.doesNotMatch(store,/score:\s*[0-9]/);
  assert.match(quiz,/pendingOffline/);
  assert.match(quiz,/Awaiting verification/);
  assert.match(quiz,/OfflineStudy\.instance\.queue/);
});

test('Android programme/guide progression uses actual published guides and completion keys',()=>{
  const shell=source('native_android/lib/screens/home_shell.dart');
  const guide=source('native_android/lib/screens/guide_screen.dart');
  assert.match(shell,/p\['guideIds'\]/);
  assert.match(shell,/widget\.api\.guide/);
  assert.match(shell,/canOpen\(int index\)/);
  assert.match(shell,/Complete the previous course first/);
  assert.match(guide,/completedLessons/);
  assert.match(guide,/firstIncomplete/);
  assert.match(guide,/locked\?null:/);
  assert.match(guide,/Download lesson/);
});

test('native translated navigation and account preferences read published keys',()=>{
  const locale=source('native_android/lib/core/vop_i18n.dart');
  const shell=source('native_android/lib/screens/home_shell.dart');
  const account=source('native_android/lib/screens/account_settings_screen.dart');
  assert.match(locale,/api\.translations\(locale\)/);
  assert.match(locale,/restoreLastKnown/);
  assert.match(shell,/navigation\.discover/);
  assert.match(shell,/locale\.text\(labelKeys/);
  assert.match(account,/await VopI18n\.load/);
});

test('AudioVerse in-app playback requires independently licensed public audio',()=>{
  const api=source('api_handlers/admin/radio.ts');
  const mobile=source('api_handlers/admin/mobile.ts');
  const player=source('native_android/lib/screens/radio_player_screen.dart');
  assert.match(api,/incoming\.hasPlaybackRights!==true/);
  assert.match(api,/permitted\.kind!=='direct-audio'/);
  assert.match(api,/playbackRightsConfirmedBy/);
  assert.match(mobile,/data\.hasPlaybackRights===true/);
  assert.match(player,/RadioMediaKind\.external/);
  assert.match(player,/licensedAudioUrl/);
  assert.doesNotMatch(player,/YouTube fallback|Retry player|This player keeps videos inside VOP/);
});
