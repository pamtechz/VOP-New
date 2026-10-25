import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=(name:string)=>readFileSync(name,'utf8');

test('shared curriculum visibility is tenant scoped and non-destructive',()=>{
  const src=file('server/sharedCurriculumVisibility.ts');
  assert.match(src,/organizations\/\'\+organizationId\+\'\/settings\/sharedCurriculum/);
  assert.match(src,/organizations\/\'\+orgId\+\'\/settings\/sharedCurriculum/);
  assert.match(src,/hiddenPrograms:string\[\]/);
  assert.match(src,/hiddenGuides:string\[\]/);
  assert.match(src,/hiddenLessons:string\[\]/);
  assert.match(src,/if\(!viewerOrgId\|\|ownerOrgId===viewerOrgId\)return true/);
  assert.match(src,/db\.runTransaction\(/);
  assert.match(src,/if\(ids\.size>500\)/);
});

test('suggest edit cannot mutate foreign content until original owner approves',()=>{
  const api=file('server/sharedCurriculumActions.ts');
  assert.match(api,/if\(action==='proposeEdit'\)/);
  assert.match(api,/data\.sharingScope!=='shared'/);
  assert.match(api,/ownerOrg===ctx\.organizationId/);
  assert.match(api,/status:'pending'/);
  assert.match(api,/if\(action==='reviewEditProposal'\)/);
  assert.match(api,/String\(request\.ownerOrganizationId\|\|''\)!==ctx\.organizationId/);
  assert.match(api,/canEditCanonicalContent\(ctx,data\)/);
  assert.match(api,/tx\.update\(target,\{/);
  assert.match(api,/tx\.update\(proposalRef,\{/);
  assert.match(api,/createNotification\(/);
});

test('legacy and Flutter learner paths honor shared selections',()=>{
  const api=file('api_handlers/admin/mobile.ts');
  const legacy=file('src/services/firestoreData.ts');
  const server=file('server/programManager.ts');
  const studio=file('src/pages/CurriculumManager.tsx');
  assert.match(api,/sharedItemVisible\(/);
  assert.match(api,/show\('programs'/);
  assert.match(api,/show\('guides'/);
  assert.match(api,/show\('lessons'/);
  assert.match(api,/resource==='sharedVisibility'/);
  assert.match(legacy,/hiddenGuides\.has\(item\.id\)/);
  assert.match(legacy,/hiddenLessons\.has\(entry\.guide\.id\+':'+item\.id\)/);
  assert.match(server,/sharedItemVisible\(hidden,'programs',document\.id/);
  assert.match(studio,/SharedCurriculumControls/);
});

test('unowned content has no destructive organisation actions',()=>{
  const content=file('api_handlers/admin/content.ts');
  const policy=file('server/sharedCurriculumActions.ts');
  assert.match(content,/canEditCanonicalContent\(ctx,row\)/);
  assert.match(policy,/requireOrgRole\(ctx,\['owner','admin'\]\)/);
  assert.match(policy,/Only the owning organisation or VOP Super Admin/);
  assert.doesNotMatch(policy,/tx\.delete\(target\)/);
});
