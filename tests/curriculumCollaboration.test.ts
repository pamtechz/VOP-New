import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadSharedCurriculumSelection,sharedContentChosen} from '../server/sharedCurriculum.ts';

const text=(p:string)=>readFileSync(p,'utf8');

test('owning organisations can hide foreign shared programmes without deleting records',async()=>{
  const calls:string[]=[];
  const db={
    doc:(path:string)=>({path,get:async()=>{
      calls.push(path);
      if(path==='organizations/church-one/settings/sharedCurriculum')return {
        data:()=>({mode:'selected',programIds:['program-a'],guideIds:[],lessonIds:[]}),
      };
      if(path==='programs/program-a')return {
        data:()=>({published:true,sharingScope:'shared',guideIds:['guide-b','guide-c']}),
      };
      throw Error('unexpected db path '+path);
    }}),
    getAll:async(...refs:Array<{get:()=>Promise<unknown>}>)=>Promise.all(refs.map(v=>v.get())),
  } as unknown as Parameters<typeof loadSharedCurriculumSelection>[0];
  const selection=await loadSharedCurriculumSelection(db,'church-one');
  assert.equal(selection.mode,'selected');
  assert.equal(sharedContentChosen(selection,'program','program-a'),true);
  assert.equal(sharedContentChosen(selection,'program','program-hidden'),false);
  assert.equal(sharedContentChosen(selection,'guide','guide-b'),true);
  assert.equal(sharedContentChosen(selection,'guide','guide-c'),true);
  assert.equal(sharedContentChosen(selection,'guide','guide-hidden'),false);
  assert.deepEqual(calls.sort(),[
    'organizations/church-one/settings/sharedCurriculum','programs/program-a'].sort());
});

test('unconfigured tenant continues to see public shared studies',async()=>{
  const db={doc:(_path:string)=>({get:async()=>({data:()=>({})})})} as unknown as Parameters<typeof loadSharedCurriculumSelection>[0];
  const visibility=await loadSharedCurriculumSelection(db,'church-two');
  assert.equal(visibility.mode,'all');
  assert.equal(sharedContentChosen(visibility,'guide','any-shared'),true);
});

test('quota exhaustion cannot prevent public content loading or erase drafts',()=>{
  const cache=text('src/services/storage.ts');
  assert.match(cache,/MAX_GUIDE_CACHE_CHARS/);
  assert.match(cache,/try \{\s*localStorage\.setItem\(scoped, value\)/);
  assert.match(cache,/sessionCache\.set\(scoped, value\)/);
  assert.match(cache,/localStorage\.removeItem\(guideKey\)/);
  assert.doesNotMatch(cache,/localStorage\.clear\(/);
  assert.doesNotMatch(cache,/removeItem\(['"]vop-lesson/);
});

test('canonical programme, guide and lesson editing requires the original record',()=>{
  const program=text('server/programManager.ts');
  const content=text('api_handlers/admin/content.ts');
  assert.match(program,/raw\.expectedExisting===true && !previous\.exists/);
  assert.match(content,/data\.expectedExisting===true && !existing\.exists/g);
  assert.match(content,/data\.originalGuideId/);
  assert.match(content,/originalGuideId: _originalGuideId, \.\.\.publicData/);
  assert.match(text('src/pages/ProgramManager.tsx'),/expectedExisting:originallyEditingId\.current===id/);
  assert.match(text('src/pages/GuideManager.tsx'),/expectedExisting:originallyEditingId\.current===requestedId/);
  assert.match(text('src/pages/CurriculumManager.tsx'),/originallyEditingLessonId\.current===id/);
});

test('foreign shared content is proposed, not directly edited or deleted by tenants',()=>{
  const tenant=text('server/tenant.ts');
  const collab=text('api_handlers/admin/curriculumCollaboration.ts');
  assert.match(tenant,/ownerKey === currentTenant/);
  assert.match(tenant,/isOrgAdminOrOwner\) return true/);
  assert.match(collab,/status:'pending'/);
  assert.match(collab,/!canManage\(ctx,owner\)/);
  assert.match(collab,/sourceVersion/);
  assert.match(collab,/tx\.update\(contentRef/);
  assert.match(collab,/curriculum\.proposal\./);
  assert.match(text('server/programManager.ts'),/sharedContentChosen\(selection,'program',document\.id\)/);
  assert.match(text('api_handlers/admin/content.ts'),/sharedContentChosen\(selection,'guide',document\.id\)/);
  assert.match(text('api/admin.ts'),/'curriculum-collaboration': curriculumCollaboration/);
});

test('Legacy Curriculum Studio exposes owner review and opt-in visibility',()=>{
  const studio=text('src/pages/CurriculumManager.tsx');
  const panel=text('src/components/admin/CurriculumCollaborationPanel.tsx');
  assert.match(studio,/CurriculumCollaborationPanel/);
  assert.match(panel,/setVisibility/);
  assert.match(panel,/SuggestCurriculumEditAction/);
  assert.match(panel,/reviewProposal/);
  assert.match(panel,/getSharedLessons/);
  assert.match(panel,/getCatalog/);
});

test('owner approval applies a revision-guarded canonical edit, not an inert intermediate status',()=>{
  const handler=text('api_handlers/admin/curriculumCollaboration.ts');
  assert.match(handler,/const acceptedStatus=decision==='reject'\?'rejected':'approved'/);
  assert.match(handler,/if\(status!=='pending'\)throw/);
  assert.match(handler,/tx\.update\(contentRef,\{\.\.\.proposalPatch\(request\.changes\)/);
  assert.doesNotMatch(handler,/if\(ctx\.isSuperAdmin\)tx\.update\(contentRef/);
});
test('a selected lesson subset does not hide other selected guides',()=>{
  const handler=text('api_handlers/admin/content.ts');
  assert.match(handler,/some\(id=>id\.startsWith\(selectedGuideId\+':'\)\)/);
  assert.match(handler,/if\(hasLessonSubset &&/);
});
