import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file:string)=>readFileSync(file,'utf8');

test('radio studio is present for org admins but write guard remains on server',()=>{
  const admin=read('src/pages/AdminPage.tsx');
  const server=read('api_handlers/admin/radio.ts');
  assert.match(admin,/item\.id!=='radio'/);
  assert.match(admin,/radio:'radio'/);
  assert.match(server,/requirePermission\(ctx, 'radio', 'create'\)/);
  assert.match(server,/requirePermission\(ctx, 'radio', 'delete'\)/);
  assert.match(server,/canEditCanonicalContent\(ctx, existing\.data\(\)\)/);
  assert.match(server,/enforceQuota\(ctx, 'radioBroadcasts', 'maxRadioItems'\)/);
  assert.match(server,/isSafeHttpsMediaUrl/);
  assert.match(server,/organizationId: String\(existing\.data\(\)\?\.organizationId\|\|organizationId\)/);
  assert.doesNotMatch(server,/organizationId: '',/);
});

test('native radio never launches a media URL outside the app',()=>{
  const source=read('native_android/lib/screens/radio_player_screen.dart');
  const catalog=read('native_android/lib/screens/content_screen.dart');
  assert.match(source,/VideoPlayerController\.networkUrl/);
  assert.match(source,/WebViewWidget/);
  assert.match(source,/safeRadioHttps/);
  assert.match(source,/onNavigationRequest/);
  assert.match(source,/LaunchMode\.inAppBrowserView/);
  assert.match(source,/RefreshIndicator/);
  assert.match(source,/More from VOP/);
  assert.match(catalog,/RadioPlayerScreen\(item:row,api:widget\.api,related:related\)/);
});

test('native personal settings use authoritative web profile/settings actions',()=>{
  const api=read('native_android/lib/core/vop_api.dart');
  const profile=read('native_android/lib/screens/account_settings_screen.dart');
  assert.match(api,/action':'updateOwnProfile/);
  assert.match(api,/action':'personalSettings/);
  assert.match(api,/notificationCapabilities\(\)/);
  assert.match(api,/action':'capabilities/);
  assert.match(profile,/notificationStatusLoaded/);
  assert.match(profile,/Email delivery is currently unavailable/);
  assert.match(api,/exportOwnAccount\(\)/);
  assert.match(api,/'action':'export'/);
  assert.match(profile,/widget\.api\.exportOwnAccount\(\)/);
  assert.match(profile,/Share\.shareXFiles/);
  assert.match(profile,/Export your VOP account data/);
  assert.match(read('native_android/pubspec.yaml'),/share_plus: \^10\.1\.4/);
  assert.match(profile,/widget\.api\.savePersonalSettings\(preferences\)/);
  assert.match(profile,/widget\.api\.saveProfile/);
  assert.match(profile,/sendPasswordResetEmail/);
  assert.match(profile,/VopAppearance\.apply/);
  assert.match(read('api_handlers/admin/mobile.ts'),/resource==='languages'/);
  assert.match(read('api_handlers/admin/users.ts'),/displayName: String\(existing\.displayName\|\|''\)\.trim\(\) \|\| decoded\.name/);
});
