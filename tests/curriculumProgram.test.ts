import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
after(async()=>vite.close());
const {normalizeProgramDraft}=await vite.ssrLoadModule('/shared/programModel.ts');
const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');
const valid={title:'Biblical Foundations',description:'A Bible study program',
  coverImageUrl:'https://example.org/cover.jpg',
  entryMode:'sections',guideIds:['guide-one','guide-two'],
  published:true,sharingScope:'organization',archived:false};

test('program schema maintains explicit navigation and ordered references',()=>{
  const result=normalizeProgramDraft(valid);
  assert.deepEqual(result.guideIds,['guide-one','guide-two']);
  assert.equal(result.entryMode,'sections');
  assert.equal(result.title,'Biblical Foundations');
  assert.equal(result.published,true);
  assert.equal(normalizeProgramDraft({...valid,entryMode:'lessons'}).entryMode,'lessons');
});
test('program schema rejects duplicate assignments and unsafe cover images',()=>{
  assert.throws(()=>normalizeProgramDraft({...valid,guideIds:['duplicate','duplicate']}),/same guide/);
  for(const coverImageUrl of ['javascript:alert(1)','http://example.org/img','https://localhost/secret']){
    assert.throws(()=>normalizeProgramDraft({...valid,coverImageUrl}),/safe public HTTPS/);
  }
  assert.throws(()=>normalizeProgramDraft({...valid,entryMode:'unknown'}),/lessons or sections/);
  assert.throws(()=>normalizeProgramDraft({...valid,guideIds:Array(101).fill('guide')}),/at most 100/);
});
test('program UI links canonical guides and passes section-first entry mode to the existing reader',()=>{
  const admin=read('src/pages/CurriculumManager.tsx');
  const manager=read('src/pages/ProgramManager.tsx');
  const learner=read('src/pages/LessonsPage.tsx');
  const loader=read('src/services/firestoreData.ts');
  const reader=read('src/components/guide/DiscoverGuideView.tsx');
  assert.match(admin,/tab === 'programs'/);
  assert.match(admin,/<ProgramManager organizationId=\{scopeOrganizationId\}/);
  assert.match(manager,/guideIds:/);
  assert.match(manager,/onOpenGuide\(id,\{programId:selected\.id,programTitle:selected\.title,entryMode:selected\.entryMode\}\)/);
  assert.match(admin,/programContext\?\.entryMode==='sections'/);
  assert.match(admin,/vop-admin-direct-section/);
  assert.match(admin,/openModuleLesson\(entry\.item,entry\.section\.id\)/);
  assert.match(learner,/onOpenGuide\(\{\.\.\.guide,learnerEntryMode:activeProgram\.entryMode\}\)/);
  assert.match(learner,/assignedGuideIds/);
  assert.match(learner,/Standalone study items/);
  assert.match(loader,/loadFirestorePrograms/);
  assert.match(reader,/guide\.learnerEntryMode==='sections'/);
  assert.match(reader,/vop-section-study-card/);
  assert.match(reader,/onSelectLesson\(lesson,actualIndex\)/);
});
test('programme selection never opens an empty page because guides have zero published lessons',()=>{
  const learner=read('src/pages/LessonsPage.tsx');
  const loader=read('src/services/firestoreData.ts');
  const flutter=read('native_android/lib/screens/home_shell.dart');
  const mobile=read('api_handlers/admin/mobile.ts');
  assert.match(learner,/const availablePrograms=programs;/);
  assert.match(learner,/const activeProgram=programs\.find\(program=>program\.id===selectedProgramId\)/);
  assert.match(learner,/filter\(id=>guides\.some\(guide=>guide\.id===id\)\)/);
  assert.match(learner,/No accessible published courses are currently linked to this programme/);
  assert.doesNotMatch(loader,/\.filter\(guide => guide\.lessons\.length > 0\)/);
  assert.match(loader,/const id = legacy \? String\(data\.id \|\| item\.id\)\.trim\(\) : item\.id/);
  assert.match(mobile,/const missingIds=\[\.\.\.new Set\(programs\.flatMap\(program=>program\.guideIds\)\)\]/);
  assert.match(mobile,/!doc\.exists\|\|!hasAccess\(doc\.data\(\)\|\|\{\},scope\)/);
  assert.match(mobile,/guideIds:program\.guideIds\.filter\(id=>knownGuideIds\.has\(id\)\)/);
  assert.ok(flutter.includes('push(_ProgrammeScreen('));
  assert.ok(flutter.includes("programId:(p['id']??'').toString()"));
  assert.ok(flutter.includes('widget.api.programme(widget.programId)'));
  assert.ok(flutter.includes("final guides=asRows(s.data?['guides']);"));
  const api=read('native_android/lib/core/vop_api.dart');
  assert.ok(api.includes("read('program', {'programId': programId})"));
  assert.ok(mobile.includes("if(resource==='program')"));
  assert.ok(mobile.includes('!snap.exists||!hasAccess(snap.data()||{},scope)'));
  assert.ok(flutter.includes('No accessible courses are published under this programme.'));
});
test('saving preserves canonical IDs and programme association does not clone guides',()=>{
  const programmes=read('src/pages/ProgramManager.tsx');
  const guides=read('src/pages/GuideManager.tsx');
  const lesson=read('src/pages/CurriculumManager.tsx');
  const native=read('native_android/lib/screens/curriculum_lesson_editor_screen.dart');
  const backend=read('server/programManager.ts');
  assert.ok(programmes.includes("editing.id||'program-'+crypto.randomUUID()"));
  assert.ok(programmes.includes("programApi('upsert',organizationId,id,{...editing,id})"));
  assert.ok(guides.includes("editing.id||'guide-'+crypto.randomUUID()"));
  assert.ok(guides.includes("guideAdmin('attachGuide'"));
  assert.doesNotMatch(guides,/guideAdmin\('upsert',[\s\S]{0,80}\.\.\.targetProg/);
  assert.ok(lesson.includes('pendingLessonId.current'));
  assert.ok(lesson.includes('published: publish || editor.published'));
  assert.doesNotMatch(lesson,/if \(publish\) await adminContent\('publishLesson'/);
  assert.ok(native.includes('final stableLessonId='));
  assert.ok(native.includes("'id':stableLessonId"));
  const nativeRecords=read('native_android/lib/screens/workspace_records_screen.dart');
  assert.ok(nativeRecords.includes('final draftId=newRecordId();'));
  assert.ok(nativeRecords.includes("widget.collection:draftId"));
  assert.ok(backend.includes("if(action==='attachGuide')"));
  assert.ok(backend.includes('transaction.update(programRef,{guideIds,'));
  const content=read('api_handlers/admin/content.ts');
  assert.ok(content.includes("if(data.published===true)await requirePermission(ctx,'curriculum','publish')"));
  assert.ok(content.includes('publishedAt:FieldValue.serverTimestamp()'));
  assert.ok(backend.includes('if(ids.includes(guideId))return'));
  assert.ok(backend.includes("const isSharedGuide=value.published===true&&value.sharingScope==='shared'"));
});
test('Super Admin curriculum changes retain canonical guide ownership',()=>{
  const handler=read('api_handlers/admin/content.ts');
  const tenant=read('server/tenant.ts');
  const programManager=read('server/programManager.ts');
  const studio=read('src/pages/CurriculumManager.tsx');
  assert.match(tenant,/hierarchyAdmin && !isSuperAdmin/);
  assert.match(handler,/const guideOrganizationId = ctx.isSuperAdmin && existing.exists/);
  assert.match(handler,/organizationId: guideOrganizationId/);
  assert.match(programManager,/const programOrganizationId=ctx.isSuperAdmin&&previous.exists/);
  assert.match(programManager,/organizationId:programOrganizationId/);
  assert.match(handler,/const lessonOrganizationId = ctx.isSuperAdmin \? guideOrgId : effectiveOrganizationId/);
  assert.match(handler,/organizationId: lessonOrganizationId/);
  assert.match(studio,/const targetOrganizationId = isSuperAdmin/);
  assert.match(handler,/code:status===401\?'UNAUTHENTICATED':status===403\?'PERMISSION_DENIED':'INVALID_REQUEST'/);
});
test('private instructor notes cannot be persisted in the learner-readable lesson record',()=>{
  const handler=read('api_handlers/admin/content.ts');
  const rules=read('firestore.rules');
  const migration=read('scripts/migrate-lesson-instructor-notes.mjs');
  assert.match(handler,/teacherNotes:FieldValue\.delete\(\)/);
  assert.match(handler,/ref\.collection\('private'\)\.doc\('instructorNotes'\)/);
  assert.match(handler,/await batch\.commit\(\)/);
  assert.match(rules,/match \/private\/\{privateId\}/);
  assert.match(rules,/allow read, write: if false/);
  assert.match(migration,/--confirm-project/);
  assert.match(migration,/DRY RUN/);
});
