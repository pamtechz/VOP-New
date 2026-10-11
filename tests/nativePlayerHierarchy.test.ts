import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');
test('radio player has no instructional or duplicate fallback controls',()=>{
 const source=read('native_android/lib/screens/radio_player_screen.dart');
 assert.doesNotMatch(source,/Retry player|YouTube fallback|This player keeps videos inside VOP/);
 assert.doesNotMatch(source,/Approved direct streams use the native player/);
 assert.match(source,/WebViewWidget\(controller:embed!/);
 assert.match(source,/VideoPlayer\(c!/);
});
test('published programme courses include nested server-fetched lessons',()=>{
 const source=read('native_android/lib/screens/home_shell.dart');
 assert.match(source,/future:api.guide\(/);
 assert.match(source,/final lessons=asRows\(snapshot.data\?\['lessons'\]\)/);
});
test('native lesson locks are set and enforced by mobile BFF',()=>{
 const source=read('api_handlers/admin/mobile.ts');
 assert.match(source,/code:'LESSON_LOCKED'/);
 assert.match(source,/locked:index>0/);
 const ui=read('native_android/lib/screens/guide_screen.dart');
 assert.match(ui,/onTap:locked\?null:/);
});
test('memory challenge tabs use compact styles',()=>{
 const source=read('native_android/lib/screens/engagement_screen.dart');
 assert.match(source,/visualDensity:VisualDensity.compact/);
 assert.match(source,/LayoutBuilder/);
});
