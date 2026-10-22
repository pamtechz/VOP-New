import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('public study discovery is a GET-only metadata endpoint with explicit publication and scope filters',()=>{
  const handler=readFileSync('api_handlers/admin/publicCatalog.ts','utf8');
  const dispatcher=readFileSync('api/admin.ts','utf8');
  const routing=readFileSync('vercel.json','utf8');
  assert.match(handler,/req\.method!=='GET'/);
  assert.match(handler,/row\.published===true/);
  assert.match(handler,/row\.archived!==true/);
  assert.match(handler,/row\.sharingScope==='shared'/);
  assert.match(handler,/row\.sharingScope==='private'/);
  assert.match(handler,/lessons'.*where\('published','==',true\)/s);
  assert.doesNotMatch(handler,/\b(?:quizAnswers|correctAnswers|contentPages|pageBlocks|scriptureQuote|correctOption|assessmentBank)\s*:/);
  assert.match(handler,/publicLessonMetadata/);
  assert.match(dispatcher,/'public-catalog': publicCatalog/);
  assert.match(routing,/"source": "\/api\/public-catalog"/);
});

test('public discovery stays consistent on old web, Flutter web and Android before sign in',()=>{
  const home=readFileSync('src/pages/PublicHome.tsx','utf8');
  const catalogue=readFileSync('src/components/home/PublicStudyCatalogue.tsx','utf8');
  const app=readFileSync('native_android/lib/main.dart','utf8');
  const publicEntry=readFileSync('native_android/lib/screens/public_entry_screen.dart','utf8');
  const nativeApi=readFileSync('native_android/lib/core/vop_api.dart','utf8');
  assert.match(home,/PublicStudyCatalogue onSignIn/);
  assert.match(catalogue,/fetch\('\/api\/public-catalog'/);
  assert.match(catalogue,/Sign in to open this course/);
  assert.match(publicEntry,/_api\.publicCatalog\(\)/);
  assert.match(publicEntry,/Sign in to study this course/);
  assert.match(publicEntry,/constraints\.maxWidth >= 1020/);
  assert.match(app,/if \(!snapshot\.hasData\) return const PublicEntryScreen\(\);/);
  assert.match(nativeApi,/anonymous: true/);
  assert.match(nativeApi,/'\/api\/public-catalog'/);
});

test('Flutter has an expanded desktop navigation without changing the phone bottom bar',()=>{
  const shell=readFileSync('native_android/lib/screens/home_shell.dart','utf8');
  assert.match(shell,/_desktopSidebar\(labels,icons\)/);
  assert.match(shell,/final desktop=MediaQuery\.sizeOf\(context\)\.width>=1120/);
  assert.match(shell,/bottomNavigationBar:wide\?null:NavigationBar/);
});
