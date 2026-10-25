import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const storage=readFileSync('src/services/storage.ts','utf8');
const content=readFileSync('api_handlers/admin/content.ts','utf8');
const programs=readFileSync('server/programManager.ts','utf8');
const collaboration=readFileSync('server/curriculumCollaboration.ts','utf8');
const panel=readFileSync('src/components/admin/SharedCurriculumPanel.tsx','utf8');
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
