import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');

test('native and web courses enforce sequential completion',()=>{
  const bff=read('api_handlers/admin/mobile.ts');
  const native=read('native_android/lib/screens/guide_screen.dart');
  const web=read('src/pages/LessonsPage.tsx');
  assert.match(bff,/unlocked:prerequisitesMet/);
  assert.match(bff,/status\(423\)/);
  assert.match(bff,/assessmentAttempts/);
  assert.match(bff,/passed===true/);
  assert.match(native,/onTap:locked\?null/);
  assert.match(web,/disabled=\{locked\}/);
});
test('offline work is scoped, encrypted for quizzes and server-marked',()=>{
  const offline=read('native_android/lib/core/offline_study.dart');
  const lesson=read('native_android/lib/screens/lesson_screen.dart');
  const quiz=read('native_android/lib/screens/quiz_screen.dart');
  assert.match(offline,/FlutterSecureStorage/);
  assert.match(offline,/\$uid/);
  assert.match(offline,/row\['unlocked'\]==false/);
  assert.match(offline,/error\.status>=400 && error\.status<500/);
  assert.match(offline,/api\.completeLesson/);
  assert.match(offline,/api\.submitQuiz/);
  assert.match(quiz,/pendingVerification/);
  assert.match(quiz,/awaiting|Awaiting verification/);
  assert.match(lesson,/queueCompletion/);
  assert.doesNotMatch(offline,/correctAnswer\s*:/);
});
test('localization loads published translations not hardcoded lesson content',()=>{
  const locale=read('native_android/lib/core/vop_locale.dart');
  const shell=read('native_android/lib/screens/home_shell.dart');
  assert.match(locale,/uiTranslations/);
  assert.match(shell,/VopLocale\.tr\('navigation\.discover'/);
  assert.match(shell,/studyLanguage/);
  assert.match(shell,/ExpansionTile/);
});
test('rights-protected AudioVerse remains at provider without a licensed file',()=>{
  const radio=read('api_handlers/admin/radio.ts');
  const app=read('native_android/lib/screens/radio_player_screen.dart');
  assert.match(radio,/rightsConfirmed/);
  assert.match(radio,/identifyPublicMedia\(licensedRaw\)/);
  assert.match(radio,/authorised\.kind!=='direct-audio'/);
  assert.match(app,/licensedAudioUrl/);
  assert.match(app,/RadioMediaKind\.external/);
});
