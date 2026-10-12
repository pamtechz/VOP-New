import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('account security activity is server-owned, bounded and shown only to the owner',()=>{
  const activity=read('server/accountSecurityActivity.ts');
  const account=read('api_handlers/admin/account.ts');
  const rules=read('firestore.rules');
  const indexes=JSON.parse(read('firestore.indexes.json'));
  assert.match(activity,/where\('uid','==',owner\)/);
  assert.match(activity,/orderBy\('occurredAt','desc'\)/);
  assert.match(activity,/Math\.min\(50/);
  assert.match(activity,/batch\.create\(event/);
  assert.match(activity,/batch\.create\(notice/);
  assert.match(account,/action==='security-activity'/);
  assert.match(account,/recentAccountSecurityEvents\(ctx\.db,ctx\.auth\.uid\)/);
  assert.match(rules,/match \/accountSecurityEvents\/\{eventId\} \{\s*allow read, write: if false;/);
  assert.ok(indexes.indexes.some((idx:{collectionGroup:string})=>idx.collectionGroup==='accountSecurityEvents'));
});

test('recorded account security events are exported and deleted with the user',()=>{
  const lifecycle=read('server/accountLifecycle.ts');
  const account=read('api_handlers/admin/account.ts');
  const passkeys=read('api_handlers/admin/passkeys.ts');
  assert.match(lifecycle,/securityActivity:collection\(securityActivity\)/);
  assert.match(lifecycle,/\['accountSecurityEvents','uid','=='\]/);
  for(const event of ['sessions_revoked','account_exported','deletion_requested','deletion_cancelled']){
    assert.ok(account.includes('recordAccountSecurityEvent(ctx.db,ctx.auth.uid,\''+event+'\')'));
  }
  for(const event of ['passkey_sign_in','passkey_added','passkey_removed']){
    assert.ok(passkeys.includes('\''+event+'\''));
  }
});

test('personal account security history is available on both web and native Android',()=>{
  const web=read('src/pages/PersonalSettingsPage.tsx');
  const native=read('native_android/lib/screens/account_settings_screen.dart');
  const api=read('native_android/lib/core/vop_api.dart');
  assert.match(web,/loadAccountSecurityActivity\(\)/);
  assert.match(web,/Recent security activity/);
  assert.match(native,/widget\.api\.accountSecurityActivity\(\)/);
  assert.match(native,/Recorded account and passkey events/);
  assert.match(api,/'action':'security-activity'/);
});
