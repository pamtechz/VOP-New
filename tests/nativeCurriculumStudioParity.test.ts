import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
const studio=read('native_android/lib/screens/curriculum_studio_screen.dart');
const lessons=read('native_android/lib/screens/curriculum_lesson_editor_screen.dart');
const api=read('native_android/lib/core/vop_api.dart');
const navigation=read('native_android/lib/screens/workspace_navigation.dart');
const server=read('server/mobileWorkspace.ts');

test('Flutter Curriculum Studio exposes seven Legacy-equivalent authoring areas',()=>{
  for(const name of ['programs','guides','lessons','quizzes','paths','topics','seasons']){
    assert.match(studio,new RegExp("_StudioArea\\('"+name+"'"));
  }
  for(const collection of ['programs','guides','quizzes','learningPaths','bibleTopics','seasons']){
    assert.match(server,new RegExp(collection+'\\s*:\\s*\\{title:'));
  }
  assert.match(studio,/ChoiceChip\(/);
  assert.match(studio,/LayoutBuilder\(/);
  assert.match(studio,/SafeArea\(/);
  assert.match(navigation,/CurriculumStudioScreen\(api:widget\.api\)/);
});

test('Curriculum Studio is tenant scoped and server permission aware',()=>{
  assert.match(studio,/workspace\['organizationId'\]/);
  assert.match(studio,/workspace\['isSuperAdmin'\] != true/);
  assert.match(studio,/workspace\['schemas'\]/);
  assert.match(studio,/schema\['actions'\]/);
  assert.match(studio,/record\['canEdit'\] != false/);
  assert.match(studio,/widget\.api\.recordList\(collection, payload: _scope\)/);
  assert.match(studio,/widget\.api\.saveRecord\(collection, id, data, payload: _scope\)/);
  assert.match(studio,/widget\.api\.deleteRecord\(collection, record\['id'\]\.toString\(\), payload: _scope\)/);
  assert.match(studio,/choices\[source\] = \[/);
  assert.match(studio,/await _list\(source\)/);
  assert.doesNotMatch(studio,/FirebaseFirestore\.instance/);
});

test('Programme relationships open canonical guides without cloning records',()=>{
  assert.match(studio,/program\['guideIds'\]/);
  assert.match(studio,/_openGuide\(id\.toString\(\)/);
  assert.match(studio,/final id = \(original\['id'\] \?\? newRecordId\(\)\)\.toString\(\)/);
  assert.match(studio,/final initial = <String, dynamic>\{\.\.\.seed, \.\.\.original\}/);
  assert.match(studio,/widget\.api\.adminContent\(/);
  assert.match(studio,/action: 'listGuideLessons'/);
  assert.match(api,/action: collection == 'guides' \? 'listGuides' : 'list'/);
  assert.match(api,/'upsertGuide' : 'upsert'/);
});

test('Flutter lesson authoring is a deep-linked, permission checked full page editor',()=>{
  assert.match(studio,/initialLessonId: lessonId, createOnOpen: create/);
  assert.match(lessons,/this\.initialLessonId='',this\.createOnOpen=false/);
  assert.match(lessons,/edit\(widget\.createOnOpen\?null:target\.first\)/);
  assert.match(lessons,/type':'plate'/);
  assert.match(lessons,/key':'chapters'/);
  assert.match(lessons,/key':'sections'/);
  assert.match(lessons,/action:'upsertLesson'/);
  assert.match(lessons,/final stableLessonId=\(lesson\?\['id'\]\?\?newRecordId\(\)\)/);
  assert.match(lessons,/actions\.contains\('publish'\)/);
  assert.match(lessons,/actions\.contains\('delete'\)/);
  assert.match(lessons,/item\['canEdit'\]==true/);
});

test('Assessments stay in the protected quiz library, not the learner-readable lesson payload',()=>{
  assert.match(studio,/collection == 'quizzes'/);
  assert.match(studio,/'attachmentType': 'guide'/);
  assert.match(server,/questions',label:'Questions'/);
  assert.match(api,/collection == 'quizzes' \? action\('\/api\/quizzes'/);
  assert.doesNotMatch(lessons,/'questions':data\['questions'\]/);
});
