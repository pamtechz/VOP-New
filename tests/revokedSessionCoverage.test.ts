import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('authenticated API entry points check Firebase refresh-token revocations',()=>{
  for(const path of [
    'server/tenant.ts',
    'api_handlers/admin/users.ts',
    'api_handlers/admin/passkeys.ts',
    'api_handlers/admin/bootstrap.ts',
    'api_handlers/admin/notifications.ts',
    'api/share.ts',
    'api/certificates.ts',
    'api/engagement.ts',
    'api/mentorship.ts',
    'api/study/progress.ts',
  ]){
    const source=read(path);
    assert.match(source,/verifyIdToken\([^\n;]*,true\)/,
      path+' must check revoked ID tokens');
    assert.doesNotMatch(source,/verifyIdToken\([^\n;]*\.trim\(\)\)/,
      path+' must not use unrevoked verification');
  }
});

test('export and deletion require recent sign-in and passkey removal cannot reuse stale sessions',()=>{
  const account=read('api_handlers/admin/account.ts');
  const passkeys=read('api_handlers/admin/passkeys.ts');
  assert.match(account,/requireVerifiedRecentIdentity\(req,ctx\.auth\.uid\)/);
  assert.match(account,/verifyIdToken\(bearer,true\)/);
  assert.match(passkeys,/if\(action==='deleteCredential'\)\{\s*requireRecentAuthentication\(actor\)/);
  assert.match(passkeys,/verifyIdToken\(authorization\.slice\(7\)\.trim\(\),true\)/);
});

test('passkey assertion counters update atomically and cross-origin ceremony is denied',()=>{
  const passkeys=read('api_handlers/admin/passkeys.ts');
  const validation=read('server/passkeys.ts');
  assert.match(passkeys,/transaction\.get\(credentialRef\)/);
  assert.match(passkeys,/transaction\.update\(credentialRef/);
  assert.match(validation,/client\.crossOrigin===true/);
});
