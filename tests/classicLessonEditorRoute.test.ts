import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseClassicLessonLink} from '../src/services/classicLessonLink.ts';

const dart=readFileSync('native_android/lib/screens/curriculum_lesson_editor_screen.dart','utf8');
const manager=readFileSync('src/pages/CurriculumManager.tsx','utf8');
const plate=readFileSync('src/components/admin/PlateCurriculumAuthoringReview.tsx','utf8');
const admin=readFileSync('src/pages/AdminPage.tsx','utf8');
const rewrites=JSON.parse(readFileSync('vercel.json','utf8')).rewrites as Array<{source:string;destination:string}>;

test('Classic Web resolves to the exact Legacy editor, not a second editor implementation',()=>{
  const editorRoute=rewrites.findIndex(row=>row.source==='/classic/editor');
  const flutterRoute=rewrites.findIndex(row=>row.source==='/classic/');
  assert.ok(editorRoute>=0&&flutterRoute>editorRoute);
  assert.equal(rewrites[editorRoute].destination,'/index.html');
  assert.equal(rewrites[flutterRoute].destination,'/classic/index.html');
  assert.match(dart,/Uri\.base\.path=='\/classic\/'/);
  assert.match(dart,/Uri\.base\.replace\(path:'\/classic\/editor'/);
  assert.match(dart,/if\(await openUnifiedWebEditor\(lesson\)\)return;/);
  assert.match(dart,/if\(!kIsWeb/);
  assert.match(manager,/PlateCurriculumAuthoringReview/);
  assert.match(admin,/params\.get\('vopClassicEditor'\)==='1' && params\.get\('admin'\)==='curriculum'/);
  assert.match(plate,/StudyPlatePageEditor/);
  assert.match(plate,/jumpToSection/);
});

test('Deep-linked lesson IDs and create modes are validated, not inferred or copied',()=>{
  assert.deepEqual(parseClassicLessonLink(
    '?route=admin&admin=curriculum&vopClassicEditor=1&vopGuideId=ukusanga&vopLessonId=lesson_01'),
    {guideId:'ukusanga',lessonId:'lesson_01',create:false});
  assert.deepEqual(parseClassicLessonLink(
    '?vopClassicEditor=1&vopGuideId=ukusanga&vopNewLesson=1'),
    {guideId:'ukusanga',lessonId:'',create:true});
  for(const search of [
    '',
    '?vopGuideId=ukusanga&vopLessonId=one',
    '?vopClassicEditor=1&vopGuideId=ukusanga',
    '?vopClassicEditor=1&vopGuideId=../foreign&vopLessonId=one',
    '?vopClassicEditor=1&vopGuideId=ukusanga&vopLessonId=one/two',
    '?vopClassicEditor=1&vopGuideId=ukusanga&vopLessonId=one&vopNewLesson=1',
    '?vopClassicEditor=1&vopGuideId='+('a'.repeat(121))+'&vopLessonId=one',
  ])assert.equal(parseClassicLessonLink(search),null,search);
});

test('The bridge waits for authorized records, then preserves original save and ownership policy',()=>{
  assert.match(manager,/selectedGuideId!==classicLessonLink\.guideId/);
  assert.match(manager,/openedClassicLessonLink\.current=true/);
  assert.match(manager,/found\.canEdit===false/);
  assert.match(manager,/openModuleLesson\(found\)/);
  assert.match(manager,/openNewLesson\(classicLessonLink\.guideId\)/);
  assert.match(manager,/if\(classicLessonLink\)window\.location\.assign\('\/classic\/'\)/);
  assert.match(manager,/await adminContent\('upsertLesson', 'curriculum', id, payload, targetOrganizationId\)/);
  assert.match(manager,/expectedExisting:Boolean\(editor\.originalGuideId\)/);
  assert.match(manager,/url\.searchParams\.delete\('vopNewLesson'\)/);
  assert.match(manager,/url\.searchParams\.set\('vopLessonId',id\)/);
  assert.match(dart,/actions\.contains\('update'\) && lesson\['canEdit'\]==true/);
});
