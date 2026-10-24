import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const account=readFileSync('native_android/lib/screens/account_settings_screen.dart','utf8');
const shell=readFileSync('native_android/lib/screens/home_shell.dart','utf8');

test('security history and credential inventory do not wait for profile/settings hydration',()=>{
  const startup=account.slice(account.indexOf('@override void initState()'),account.indexOf('@override void dispose()'));
  assert.match(startup,/_loadSecurityActivity\(\)/);
  assert.match(startup,/_loadNativePasskeys\(\)/);
  assert.match(startup,/_loadAuxiliary\(\)/);
  const load=account.slice(account.indexOf('Future<void> _load()'),account.indexOf('void _loadAuxiliary()'));
  assert.doesNotMatch(load,/_loadSecurityActivity\(\)/);
  assert.doesNotMatch(load,/_loadNativePasskeys\(\)/);
});

test('security activity has distinguishable loading, missing records, failed session and retry states',()=>{
  assert.match(account,/bool securityActivityLoading=false/);
  assert.match(account,/if\(securityActivityLoading\)return/);
  assert.match(account,/e is VopApiException&&e.status==401/);
  assert.match(account,/Retry history/);
  assert.match(account,/LinearProgressIndicator/);
  assert.match(account,/else if\(securityActivity.isEmpty\)/);
  assert.match(account,/MaterialLocalizations.of\(context\)/);
});

test('device verification fails closed, and theme selection saves before slow server requests',()=>{
  assert.doesNotMatch(account,/if\(!await verifier.isDeviceSupported\(\)\)return true/);
  assert.match(account,/if\(!await verifier.isDeviceSupported\(\)\)\{/);
  assert.match(account,/if\(uid!=null\)VopAppearance.persistTheme\(uid,v\)/);
  assert.match(account,/key:ValueKey\('\$section:\$key:\$current'\)/);
  const root=readFileSync('native_android/lib/main.dart','utf8');
  assert.match(root,/VopAppearance\.restoreTheme\(uid\)/);
  assert.match(root,/VopAppearance\.apply\(settings\)/);
  assert.doesNotMatch(shell,/VopAppearance\.restoreTheme\(uid\)/);
});
