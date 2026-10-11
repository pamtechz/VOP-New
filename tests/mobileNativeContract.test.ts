import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(file:string)=>readFileSync(file,'utf8');

test('native Android is an independent Flutter app and never a wrapped web view',()=>{
  const pubspec=read('native_android/pubspec.yaml');
  const main=read('native_android/lib/main.dart');
  const nativeApi=read('native_android/lib/core/vop_api.dart');
  const workflow=read('.github/workflows/vop-native-android.yml');
  assert.match(pubspec,/firebase_auth:/);
  assert.match(pubspec,/firebase_core:/);
  assert.match(main,/MaterialApp/);
  assert.doesNotMatch(pubspec,/webview_flutter|flutter_inappwebview|tauri|capacitor/);
  assert.match(nativeApi,/Bearer \$token/);
  assert.match(nativeApi,/followRedirects = false/);
  assert.match(nativeApi,/\/api\/study\/progress/);
  assert.match(nativeApi,/\/api\/mentorship/);
  assert.match(workflow,/flutter build apk --debug/);
  assert.match(workflow,/upload-artifact@v4/);
});

test('authenticated mobile read API is whitelisted and shares the existing Vercel deployment',()=>{
  const source=read('api_handlers/admin/mobile.ts');
  const route=read('api/admin.ts');
  const vercel=JSON.parse(read('vercel.json')) as {
    rewrites:Array<{source:string;destination:string}>;
  };
  assert.match(source,/authenticateTenant\(req,undefined,true\)/);
  assert.match(source,/res\.setHeader\?\.\('Cache-Control','private, no-store, max-age=0'\)/);
  assert.match(source,/where\('published','==',true\)/);
  assert.match(source,/containsPublicQuizAnswer\(page\)/);
  assert.match(source,/normalizeStudyPlateDocument/);
  assert.match(source,/only be returned by the existing/);
  assert.doesNotMatch(source,/correctOptionIndex\s*:/);
  assert.match(route,/mobile': h21/);
  assert.ok(vercel.rewrites.some(v=>v.source==='/api/mobile'&&
    v.destination==='/api/admin?__vopRoute=mobile'));
});


test('native parity shell mirrors web destinations and uses real API-backed screens',()=>{
  const shell=read('native_android/lib/screens/home_shell.dart');
  const styles=read('native_android/lib/theme/vop_theme.dart');
  const ui=read('native_android/lib/widgets/vop_ui.dart');
  const content=read('native_android/lib/screens/content_screen.dart');
  const prayer=read('native_android/lib/screens/prayer_screen.dart');
  const engagement=read('native_android/lib/screens/engagement_screen.dart');
  const notifications=read('native_android/lib/screens/notifications_screen.dart');
  const api=read('native_android/lib/core/vop_api.dart');
  const webNav=read('src/components/layout/BottomNav.tsx');
  for(const label of ['Discover','Lessons','Library','Prayer','Radio']){
    assert.ok(shell.includes("'"+label+"'"),label+' native bottom nav missing');
    assert.match(webNav,new RegExp(label==='Discover'?'discover':label.toLowerCase()));
  }
  assert.match(styles,/0xFF003366/);
  assert.match(styles,/0xFFE69D12/);
  assert.match(ui,/class VopHeroCard/);
  assert.match(ui,/class VopSkeleton/);
  assert.match(content,/widget\.api\.resources\(\)/);
  assert.match(content,/widget\.api\.radio\(\)/);
  assert.match(content,/widget\.api\.events\(\)/);
  assert.match(prayer,/widget\.api\.submitPrayer\(/);
  assert.match(engagement,/duelSoloAnswer/);
  assert.match(engagement,/memoryReview/);
  assert.match(notifications,/markNotificationRead/);
  assert.match(api,/\/api\/admin\/notifications/);
  assert.doesNotMatch(read('native_android/pubspec.yaml'),
    /webview_flutter|flutter_inappwebview|tauri|capacitor/);
});

test('mobile content BFF restricts native cards to tenant-safe published DTOs',()=>{
  const source=read('api_handlers/admin/mobile.ts');
  for(const resource of ['resources','events','radio']){
    assert.ok(source.includes("'"+resource+"'"),resource+' API missing');
  }
  assert.match(source,/hasAccess\(doc\.data\(\),scope\)/);
  assert.match(source,/where\('published','==',true\)/);
  assert.match(source,/isSafeHttpsMediaUrl/);
  assert.doesNotMatch(source,/correctOptionIndex\s*:/);
});
