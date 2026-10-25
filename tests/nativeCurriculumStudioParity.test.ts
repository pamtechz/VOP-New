import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
const studio=read('native_android/lib/screens/curriculum_studio_screen.dart');
const shared=read('native_android/lib/screens/shared_curriculum_screen.dart');
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
  assert.match(studio,/workspace\['isSuperAdmin'\] == true/);
  assert.match(studio,/workspace\['tenantType'\] == 'hierarchy'/);
  assert.match(studio,/recordMap\(workspace\['options'\]\)\['organizations'\]/);
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
  assert.match(studio,/\.map\(\(id\) => id\.toString\(\)\)\.toList\(\)/);
  assert.match(studio,/if \(byId\.containsKey\(id\)\)/);
  assert.match(studio,/onTap: \(\) => _openGuide\(id,\s*programId: program\['id'\]\.toString\(\)\)/);
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
  assert.match(studio,/collection != 'quizzes'/);
  assert.match(studio,/'attachmentType': 'guide'/);
  assert.match(server,/questions',label:'Questions'/);
  assert.match(api,/collection == 'quizzes' \? action\('\/api\/quizzes'/);
  assert.doesNotMatch(lessons,/'questions':data\['questions'\]/);
});

test('Flutter web and Android provide the same shared curriculum collaboration workflow',()=>{
  assert.match(studio,/SharedCurriculumScreen\(/);
  assert.match(shared,/adminContent\('curriculum',action:action,payload:payload\)/);
  for(const action of ['getSharedVisibility','setSharedVisibility','proposeEdit',
    'listSuggestedEdits','reviewSuggestedEdit']) {
    assert.ok(shared.includes("'"+action+"'"),action);
  }
  assert.match(shared,/_guideRequest/);
  assert.match(shared,/request==_guideRequest/);
  assert.match(shared,/nextCursor/);
  assert.match(shared,/loadMore\(\)async/);
  assert.match(shared,/SingleChildScrollView\(/);
});


test('Flutter Android and Classic web lesson authoring uses responsive Legacy-schema pages',()=>{
  const form=read('native_android/lib/screens/workspace_records_screen.dart');
  const plate=read('native_android/lib/widgets/plate_document_editor.dart');
  assert.match(lessons,/lessonMode:true/);
  assert.match(form,/lessonTab='details'/);
  for(const tab of ['details','chapters','preview','media','references','settings']){
    assert.ok(form.includes("'"+tab+"'"),tab);
  }
  assert.match(form,/PlatePageView\(page:section\)/);
  assert.match(form,/constraints\.maxWidth>=960/);
  assert.match(form,/SingleChildScrollView\(scrollDirection:Axis\.horizontal/);
  assert.match(form,/SafeArea\(top:false/);
  assert.match(form,/PageStorageKey\('node\.'/);
  assert.match(form,/rows\.length>1/);
  assert.match(form,/if\(saveInFlight\)return/);
  assert.match(lessons,/contentPages=recordRows\(initial\['contentPages'\]\)/);
  assert.match(lessons,/initial\['chapters'\]=\[/);
  assert.match(lessons,/if\(lesson!=null\)'expectedExisting':true/);
  assert.match(lessons,/if\(lesson!=null\)'originalGuideId'/);
  assert.match(lessons,/if\(actions\.contains\('publish'\)\)/);
  assert.match(plate,/void emit\(\)/);
  assert.match(plate,/jsonDecode\(jsonEncode\(nodes\)\)/);
  assert.match(plate,/int sequence=0/);
});

test('Flutter links are inserted inside a content paragraph, never as invalid top-level nodes',()=>{
  const plate=read('native_android/lib/widgets/plate_document_editor.dart');
  const normalizer=read('shared/studyPlateDocument.ts');
  assert.ok(plate.includes("if(type=='link')return {'type':'p'"));
  assert.ok(plate.includes("'type':'a','url':''"));
  assert.ok(plate.includes("'link':'Link'}.entries"));
  assert.ok(normalizer.includes("if(top&&['li','lic','a','tr','th','td'].includes(type))"));
});
