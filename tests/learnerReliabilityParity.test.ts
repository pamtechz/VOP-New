import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the prayer author can edit and mark answered but cannot alter ownership',()=>{
  const server=read('api/prayer.ts');
  const page=read('src/pages/PrayerPage.tsx');
  assert.match(server,/action==='edit'\|\|action==='markAnswered'/);
  assert.match(server,/data\.candidateId/);
  assert.match(server,/prayer\.answered/);
  assert.match(server,/prayer\.edit/);
  assert.match(server,/ref\.update\(changes\)/);
  assert.match(page,/prayerApi\('markAnswered'/);
  assert.match(page,/editingId\?'edit':'create'/);
});

test('theme preference is persisted only on explicit changes, not by async hydration effects',()=>{
  const app=read('src/App.tsx');
  const native=read('native_android/lib/screens/account_settings_screen.dart');
  assert.match(app,/themeChangeSequence/);
  assert.match(app,/startingThemeSequence!==themeChangeSequence\.current/);
  assert.match(app,/onToggleDarkMode=\{toggleTheme\}/);
  assert.match(app,/void savePersonalSettings\(\{theme:next\}\)/);
  assert.match(native,/if\(key=='theme'&&preferencesReady\)/);
});

test('only assigned portal roles are selectable and switching never writes a server role',()=>{
  const app=read('src/App.tsx');
  const portal=read('src/services/portalAccess.ts');
  const admin=read('src/pages/AdminPage.tsx');
  assert.match(portal,/export function assignedPortalChoices/);
  assert.match(portal,/if\(hasAdminPortalAccess\(user\)\)/);
  assert.match(portal,/if\(hasMentorPortalAccess\(user\)\)/);
  assert.match(app,/assignedPortalChoices\(profile\)/);
  assert.match(app,/canAccessPortalRoute\(currentUser,choice\.route\)/);
  assert.match(admin,/onNavigate\('home'\)/);
  assert.doesNotMatch(portal,/updateDoc|updateUserRole/);
});

test('mentorship and Scripture challenge panels preserve primary response when optional features are unavailable',()=>{
  const engagement=read('src/pages/EngagementPage.tsx');
  const server=read('api/mentorship.ts');
  const native=read('native_android/lib/screens/engagement_screen.dart');
  assert.match(engagement,/applyDuelOverview\(overview\)/);
  assert.match(engagement,/engagement\(\{action:'duelLeaderboard'\}\)\.then/);
  assert.match(server,/'program','module','chapter','guide'/);
  assert.match(native,/challengesLoaded/);
  assert.match(native,/if\(tab==1&&!challengesLoaded\)reload\(\)/);
});

test('Android biometric verification augments, but never replaces, Firebase identity checks',()=>{
  const native=read('native_android/lib/screens/account_settings_screen.dart');
  const manifest=read('native_android/android/app/src/main/AndroidManifest.xml');
  const settings=read('native_android/pubspec.yaml');
  assert.match(native,/LocalAuthentication\(\)/);
  assert.match(native,/_confirmDeviceIdentity/);
  assert.match(native,/widget\.api\.revokeAllSessions\(\)/);
  assert.match(native,/widget\.api\.requestAccountDeletion\(text\)/);
  assert.match(settings,/local_auth: \^2\.3\.0/);
  assert.match(manifest,/USE_BIOMETRIC/);
});

test('Android share plugin uses the built-in Kotlin compatible release and current share API',()=>{
  const pubspec=read('native_android/pubspec.yaml');
  const account=read('native_android/lib/screens/account_settings_screen.dart');
  assert.match(pubspec,/share_plus: \^13\.3\.1/);
  assert.match(pubspec,/sdk: ">=3\.10\.0 <4\.0\.0"/);
  assert.match(account,/SharePlus\.instance\.share\(ShareParams\(/);
  assert.doesNotMatch(account,/Share\.shareXFiles/);
});

test('security activity uses an owner-filtered, bounded query when the composite index is unavailable',()=>{
  const activity=read('server/accountSecurityActivity.ts');
  assert.match(activity,/where\('uid','==',owner\)/);
  assert.match(activity,/orderBy\('occurredAt','desc'\)/);
  assert.match(activity,/owned\.limit\(150\)\.get\(\)/);
  assert.match(activity,/entries\.slice\(0,size\)/);
});
