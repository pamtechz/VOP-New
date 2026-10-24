import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');

test('offline study uses protected account scoped encrypted storage with limits',()=>{
  const file=source('native_android/lib/core/offline_study.dart');
  assert.match(file,/flutter_secure_storage/);
  assert.match(file,/String _userKey/);
  assert.match(file,/base64UrlEncode/);
  assert.match(file,/maxCompressedBytes/);
  assert.match(file,/expiresAt/);
  assert.match(file,/maxRecords/);
  assert.match(file,/await _storage\.delete/);
});
test('offline completion, quiz and resume replay only through authenticated API',()=>{
  const api=source('native_android/lib/core/vop_api.dart');
  const screen=source('native_android/lib/screens/quiz_screen.dart');
  assert.match(api,/syncPending\(\)/);
  assert.match(api,/Connectivity\(\)\.onConnectivityChanged/);
  assert.match(api,/action\('\/api\/study\/progress'/);
  assert.match(api,/action=='submitQuiz'&&expiresAt==null/);
  assert.match(api,/await _offline\.enqueue/);
  assert.match(api,/DateTime\.tryParse/);
  assert.match(screen,/data\['queued'\]==true/);
  assert.match(screen,/Answers saved offline/);
  assert.doesNotMatch(screen,/result\['score'\]\s*=\s*/);
});
test('the Android language pack uses canonical published web locales',()=>{
  const code=source('native_android/lib/core/vop_i18n.dart');
  const api=source('native_android/lib/core/vop_api.dart');
  const shell=source('native_android/lib/screens/home_shell.dart');
  assert.match(api,/\/api\/localization/);
  assert.match(shell,/navigation\.discover/);
  assert.match(shell,/navigation\.lessons/);
  assert.match(shell,/navigation\.library/);
  // The authenticated root owns language restoration; learner shell must not
  // fetch the same localization pack again during its first frame.
  const root=source('native_android/lib/main.dart');
  assert.match(root,/VopI18n\.apply/);
  assert.match(root,/api\.languagePack\(locale\)/);
  assert.doesNotMatch(shell,/VopI18n\.apply/);
  assert.match(code,/translations\[key\]/);
  assert.match(source('native_android/lib/main.dart'),/VopI18n\.revision/);
});
test('download manager contains explicit queued sync and per-user deletion controls',()=>{
  const manager=source('native_android/lib/screens/offline_studies_screen.dart');
  const account=source('native_android/lib/screens/account_settings_screen.dart');
  assert.match(manager,/Sync now/);
  assert.match(manager,/removeOfflineStudy/);
  assert.match(account,/clearOfflineStudies/);
  assert.match(account,/OfflineStudiesScreen/);
});
