import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('sensitive account controls use Firebase Admin, account ownership, recent sign-in and explicit consent',()=>{
  const account=read('api_handlers/admin/account.ts');
  const client=read('src/services/accountLifecycle.ts');
  assert.match(account,/action==='security-status'/);
  assert.match(account,/action==='revoke-sessions'/);
  assert.match(account,/SIGN OUT ALL DEVICES/);
  assert.match(account,/now-authTime>maxAgeSeconds/);
  assert.match(account,/verifyIdToken\(bearer,true\)/);
  assert.match(account,/action==='export'[\s\S]*requireVerifiedRecentIdentity/);
  assert.match(account,/action==='request-deletion'[\s\S]*requireVerifiedRecentIdentity/);
  assert.match(account,/action==='cancel-deletion'[\s\S]*requireVerifiedIdentity/);

  assert.match(account,/revokeRefreshTokens\(ctx\.auth\.uid\)/);
  assert.match(account,/ctx\.auth\.uid/);
  assert.match(client,/loadAccountSecurityStatus/);
  assert.match(client,/revokeAllSessions/);
  assert.match(client,/SIGN OUT ALL DEVICES/);
  assert.doesNotMatch(account,/signInProviders:[^\n]+passwordHash[^\n]*[.]toString/);
});

test('web security settings surface actionable verification and explicit session revocation, without fake device inventory',()=>{
  const settings=read('src/pages/PersonalSettingsPage.tsx');
  assert.match(settings,/sendEmailVerification\(user\)/);
  assert.match(settings,/loadAccountSecurityStatus\(\)/);
  assert.match(settings,/appConfirm\(/);
  assert.match(settings,/await revokeAllSessions\(\)/);
  assert.match(settings,/await firebaseSignOut\(\)/);
  assert.match(settings,/Revoked sessions may remain active until their access tokens expire/);
});

test('native security flows require deletion phrase and read the real account status',()=>{
  const api=read('native_android/lib/core/vop_api.dart');
  const screen=read('native_android/lib/screens/account_settings_screen.dart');
  assert.match(api,/requestAccountDeletion\(String confirmation/);
  assert.match(api,/'confirmation':confirmation/);
  assert.match(api,/revokeAllSessions\(\)/);
  assert.match(screen,/text!='DELETE MY ACCOUNT'/);
  assert.match(screen,/widget\.api\.requestAccountDeletion\(text\)/);
  assert.match(screen,/widget\.api\.revokeAllSessions\(\)/);
  assert.match(screen,/FirebaseAuth\.instance\.signOut\(\)/);
  assert.match(screen,/sendEmailVerification\(\)/);
  assert.match(screen,/widget\.api\.accountSecurityStatus\(\)/);
  assert.doesNotMatch(screen,/widget\.api\.requestAccountDeletion\(\)/);
});
