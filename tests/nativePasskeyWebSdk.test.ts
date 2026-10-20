import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

test('pinned web passkey bundle exposes a callable authenticator initializer', () => {
  const bundle = readFileSync('native_android/web/passkeys-bundle.js', 'utf8');
  const context: Record<string,unknown> = {};
  runInNewContext(bundle, context, { timeout: 3000 });
  const sdk = context.PasskeyAuthenticator as {
    init?: () => void; register?: (options: string) => unknown;
    login?: (options: string) => unknown;
  } | undefined;
  assert.ok(sdk, 'PasskeyAuthenticator must exist on the browser global object');
  assert.equal(typeof sdk.init, 'function');
  assert.equal(typeof sdk.register, 'function');
  assert.equal(typeof sdk.login, 'function');
  assert.doesNotThrow(() => sdk.init?.(),
    'web plugin registration invokes PasskeyAuthenticator.init before runApp');
});

test('vendored passkey SDK matches the exact reviewed Corbado 2.4.0 git blob',()=>{
  const bundle=readFileSync('native_android/web/passkeys-bundle.js');
  const gitBlob=createHash('sha1')
    .update('blob '+bundle.length+'\0')
    .update(bundle)
    .digest('hex');
  assert.equal(gitBlob,'fbec4a7969a50b52e12e452ce8032cd3a126dc31',
    'unexpected modifications to the upstream 2.4.0 browser SDK require review and a new checksum');
});

test('web loader loads SDK synchronously BEFORE async Flutter bootstrap', () => {
  const index = readFileSync('native_android/web/index.html', 'utf8');
  const sdk = index.indexOf('<script src="passkeys-bundle.js" type="application/javascript"></script>');
  const bootstrap = index.indexOf('<script src="flutter_bootstrap.js" async></script>');
  assert.ok(sdk > 0, 'a local first-party copy of the pinned SDK must load');
  assert.ok(bootstrap > sdk, 'plugin registration must not race the JS SDK');
  assert.doesNotMatch(index.slice(sdk, bootstrap), /async|defer/);
  assert.ok(!index.includes('releases/download') &&
    !index.includes('cdn.jsdelivr.net') &&
    !index.includes('unpkg.com'), 'app initialization must not depend on remote passkey CDN');
});

test('Android WebAuthn integration remains present', () => {
  const passkeys = readFileSync('native_android/lib/core/vop_passkeys.dart', 'utf8');
  assert.match(passkeys, /PasskeyAuthenticator\(/);
  assert.match(passkeys, /signInWithCustomToken/);
  assert.match(passkeys, /clientPlatform.*android/);
});
