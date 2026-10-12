import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('native passkeys are server-verified and linked to Firebase authentication',()=>{
  const service=read('native_android/lib/core/vop_passkeys.dart');
  const auth=read('native_android/lib/screens/auth_screen.dart');
  const settings=read('native_android/lib/screens/account_settings_screen.dart');
  const plugin=read('native_android/pubspec.yaml');
  const backend=read('server/passkeys.ts');
  assert.match(plugin,/passkeys: \^2\.23\.1/);
  assert.match(service,/PasskeyAuthenticator\(\)/);
  assert.match(service,/finishAuthentication/);
  assert.match(service,/signInWithCustomToken/);
  assert.match(service,/finishRegistration/);
  assert.match(service,/clientDataJSON/);
  assert.match(auth,/VopPasskeys\(\)\.signIn\(\)/);
  assert.match(settings,/VopPasskeys\(\)\.register\(\)/);
  assert.match(settings,/VopPasskeys\(\)\.delete\(/);
  assert.match(backend,/PASSKEY_ANDROID_SHA256_FINGERPRINTS/);
  assert.match(backend,/android:apk-key-hash:/);
});

test('Android asset links enable credential access only for pinned application certificates',()=>{
  const entries=JSON.parse(read('public/.well-known/assetlinks.json')) as Array<{
    relation:string[];target:{package_name:string;sha256_cert_fingerprints:string[]}
  }>;
  assert.ok(entries.some(entry=>
    entry.relation.includes('delegate_permission/common.get_login_creds') &&
    entry.target.package_name==='com.sda.vop' &&
    entry.target.sha256_cert_fingerprints.some(value=>/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value))
  ));
});
