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
