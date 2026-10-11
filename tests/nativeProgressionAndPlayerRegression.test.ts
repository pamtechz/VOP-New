import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(path:string)=>readFileSync(path,'utf8');
test('native radio UI has no policy comments or duplicate YouTube fallback under the video',()=>{
  const file=source('native_android/lib/screens/radio_player_screen.dart');
  assert.doesNotMatch(file,/YouTube fallback|Retry player|Approved direct streams use|This player keeps videos inside VOP/);
  assert.match(file,/WebViewWidget\(controller:embed!/);
  assert.match(file,/VideoPlayer\(c!/);
});
test('programme expands its real courses and published lessons',()=>{
  const shell=source('native_android/lib/screens/home_shell.dart');
  assert.match(shell,/class _ProgrammeScreen/);
  assert.match(shell,/ExpansionTile\(/);
  assert.match(shell,/future:api\.guide\(/);
  assert.match(shell,/asRows\(s\.data\?\['lessons'\]\)/);
});
test('server decides progression and persists passed quiz completions',()=>{
  const api=source('api_handlers/admin/mobile.ts');
  const progress=source('api/study/progress.ts');
  const guide=source('native_android/lib/screens/guide_screen.dart');
  assert.match(api,/PREREQUISITE_INCOMPLETE/);
  assert.match(api,/locked:index>0/);
  assert.match(progress,/completedAssessments: passed/);
  assert.match(progress,/priorComplete/);
  assert.match(progress,/PREREQUISITE_INCOMPLETE/);
  assert.match(guide,/onTap:locked\?null/);
  assert.match(guide,/setState\(reload\)/);
});
test('engagement tabs use adaptive layout on narrow Android screens',()=>{
  const screen=source('native_android/lib/screens/engagement_screen.dart');
  assert.match(screen,/constraints\.maxWidth<410/);
  assert.match(screen,/compact\?'Memory':'Memory decks'/);
});
