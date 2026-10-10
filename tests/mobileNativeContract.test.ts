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
