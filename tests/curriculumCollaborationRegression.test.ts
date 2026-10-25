import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const storage=readFileSync('src/services/storage.ts','utf8');
const content=readFileSync('api_handlers/admin/content.ts','utf8');
const programs=readFileSync('server/programManager.ts','utf8');
const collaboration=readFileSync('server/curriculumCollaboration.ts','utf8');
const panel=readFileSync('src/components/admin/SharedCurriculumPanel.tsx','utf8');
const learner=readFileSync('src/services/firestoreData.ts','utf8');
const mobile=readFileSync('api_handlers/admin/mobile.ts','utf8');
const studio=readFileSync('src/pages/CurriculumManager.tsx','utf8');

test('public curriculum loading never throws because the large legacy guide cache exhausts localStorage',()=>{
  assert.match(storage,/MAX_LOCAL_CACHE_CHARS = 250_000/);
  assert.match(storage,/volatileCache\.set\(scoped, value\)/);
  assert.match(storage,/if \(value\.length > MAX_LOCAL_CACHE_CHARS\)/);
  assert.match(storage,/try \{\s*localStorage\.setItem\(scoped, value\)/);
  assert.match(storage,/catch \(error\)/);
  assert.match(storage,/function readStorage\(/);
  assert.match(storage,/if \(volatileCache\.has\(scoped\)\)/);
});
test('upsertGuide updates canonical requested document ID instead of silently forking existing guide',()=>{
  assert.match(content,/const requestId = body\.id \? safeId\(body\.id\) : ''/);
  assert.match(content,/if \(requestId && dataId && requestId !== dataId\)/);
  assert.match(content,/const id = requestId \|\| dataId \|\| safeId/);
});
test('shared curriculum visibility is tenant-selected and never changes canonical content',()=>{
  assert.match(collaboration,/organizations\/'\+organizationId\+'\/settings\/sharedCurriculum/);
  assert.match(collaboration,/hiddenProgramIds/);
  assert.match(collaboration,/hiddenGuideIds/);
  assert.match(collaboration,/hiddenLessonKeys/);
  assert.match(collaboration,/if\(!targetSnap\.exists\|\|!shared\(targetData\)\)/);
  assert.match(content,/hidden\.guides\.has\(document\.id\)/);
  assert.match(content,/hidden\.lessons\.has\(d\.id\+'\/'\+lesson\.id\)/);
  assert.match(programs,/hidden\.programs\.has\(document\.id\)/);
  assert.match(programs,/hidden\.guides\.has\(value\)/);
});
test('shared edit suggestions are separate from canonical records until owner approval',()=>{
  assert.match(collaboration,/curriculumEditSuggestions/);
  assert.match(collaboration,/status:'pending'/);
  assert.match(collaboration,/Only the content owner or platform administrator/);
  assert.match(collaboration,/if\(data\.status!=='pending'\)/);
  assert.match(collaboration,/if\(String\(value\[key\]\?\?''\)!==String/);
  assert.match(collaboration,/tx\.update\(ref,\{\.\.\.changes,updatedAt:/);
  assert.match(collaboration,/const changeFields=\['title','description'\]/);
  assert.match(panel,/reviewSuggestedEdit/);
  assert.match(panel,/setSharedVisibility/);
  assert.match(panel,/proposeEdit/);
  assert.match(studio,/SharedCurriculumPanel platformMode=\{isSuperAdmin\}/);
});

test('learner catalogue receives shared visibility from authenticated organization settings',()=>{
  assert.ok(learner.includes("action:'getSharedVisibility'"));
  assert.ok(learner.includes('sharedVisibility.guides.has(candidateId)'));
  assert.ok(learner.includes("sharedVisibility.lessons.has(entry.guide.id+'/'+item.id)"));
  assert.ok(learner.includes('sharedVisibility.unavailable'));
});
test('review permission and pagination prevent unauthorized approvals and hidden older proposals',()=>{
  assert.ok(collaboration.includes("requirePermission(ctx,'curriculum','update')"));
  assert.ok(collaboration.includes("requirePermission(ctx,'curriculum','publish')"));
  assert.ok(collaboration.includes('nextCursor:'));
  assert.ok(collaboration.includes('startAfter(cursor)'));
  assert.ok(panel.includes('loadMore=async()'));
  assert.ok(panel.includes('guideRequest.current'));
});
test('programme and lesson save reject contradictory identities',()=>{
  assert.ok(content.includes('requestedLessonId !== nestedLessonId'));
  assert.ok(programs.includes('String(body.id)!==String(raw.id)'));
});
test('review authorization is invalidated by ownership changes inside the transaction',()=>{
  assert.ok(collaboration.includes("['ownerTenantId','ownerOrganizationId','organizationId','ownerUid']"));
  assert.ok(collaboration.includes("String(value[key]??'')!==String(record.data()?.[key]??'')"));
  assert.ok(collaboration.includes('Content ownership changed. Reload the suggestion'));
});
test('failed suggestions retain the draft and mutation requests cannot overlap',()=>{
  assert.ok(panel.includes('if(mutationPending.current)return false'));
  assert.ok(panel.includes("if(saved){"));
  assert.ok(panel.includes("setReason(value=>value===reason?'':value)"));
});

test('Flutter Android and Classic web enforce hidden shared studies on every mobile study route',()=>{
  assert.match(mobile,/loadSharedCurriculumVisibility\(ctx\)/);
  assert.match(mobile,/hidden\.programs\.has\(key\)/);
  assert.match(mobile,/hidden\.guides\.has\(key\)/);
  assert.match(mobile,/hidden\.lessons\.has\(guideKey\+'\/'\+key\)/);
  assert.match(mobile,/\.filter\(doc=>permittedGuide\(doc\.id,doc\.data\(\)\)\)/);
  assert.match(mobile,/\.filter\(doc=>permittedProgram\(doc\.id,doc\.data\(\)\)\)/);
  assert.match(mobile,/!permittedProgram\(snap\.id,snap\.data\(\)\|\|\{\}\)/);
  assert.match(mobile,/!permittedGuide\(guideId,guideSnap\.data\(\)\|\|\{\}\)/);
  assert.match(mobile,/permittedLesson\(\s*doc\.id,doc\.data\(\),guideId,guide\)/);
});
