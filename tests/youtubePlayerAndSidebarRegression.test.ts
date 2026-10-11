import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');

test('learner sidebar assigns noncolliding keys and exposes one admin navigation group',()=>{
  const source=read('src/components/layout/LearnerSidebar.tsx');
  assert.match(source,/group\.items\.map\(\(item,itemIndex\)=>/);
  assert.ok(source.includes("group.name}:"));
  assert.ok(source.includes("item.adminTab||'base'"));
  assert.ok(source.includes("itemIndex"));
  assert.doesNotMatch(source,/navigation\.admin','Admin panel'/);
  assert.match(source,/adminTab: 'dashboard'/);
  assert.match(source,/adminTab: 'curriculum'/);
});

test('native YouTube player supplies WebView client identity instead of bare embed navigation',()=>{
  const source=read('native_android/lib/screens/radio_player_screen.dart');
  assert.match(source,/vopYoutubeClientOrigin='https:\/\/com\.sda\.vop'/);
  assert.match(source,/loadHtmlString\(youtubeEmbedHtml\(source\.url!\)/);
  assert.match(source,/baseUrl:'\$vopYoutubeClientOrigin\/'/);
  assert.match(source,/referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(source,/origin':vopYoutubeClientOrigin/);
  assert.match(source,/request\.isMainFrame/);
  assert.doesNotMatch(source,/YouTube fallback|Retry player|Approved direct streams use/);
});

test('website identifies YouTube embed errors and Android enables modern back navigation',()=>{
  const radio=read('src/pages/RadioPage.tsx');
  assert.match(radio,/origin: window\.location\.origin/);
  assert.match(radio,/onError: event =>/);
  assert.match(radio,/code===153/);
  const manifest=read('native_android/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest,/android:enableOnBackInvokedCallback="true"/);
});
