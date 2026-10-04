import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

const vite=await createServer({
  configFile:false,
  server:{middlewareMode:true,hmr:false},
  appType:'custom',
  logLevel:'error',
});
after(async()=>vite.close());

const {
  hasAdminPortalAccess,
  isOrganizationPortalAccount,
  hasMentorPortalAccess,
  hasLocalizationPortalAccess,
  canAccessPortalRoute,
  defaultPortalRoute,
}=await vite.ssrLoadModule('/src/services/portalAccess.ts') as typeof import('../src/services/portalAccess.ts');

const user=(patch:Record<string,unknown>={})=>({
  uid:'user-1',
  displayName:'Test User',
  email:'test@example.test',
  information:{enrollmentDate:'',graduating:false,graduated:false,baptismCandidate:false,baptized:false},
  privileges:{admin:false,guardian:false,editor:false,manager:false,developer:false},
  progress:{discoverProgress:0,completedGuidesCount:0,totalGuidesCount:0,guideScores:{},completedLessons:[]},
  ...patch,
});

test('portal routing sends each account to its authorized primary workspace',()=>{
  const superAdmin=user({role:'super_admin'});
  assert.equal(hasAdminPortalAccess(superAdmin),true);
  assert.equal(defaultPortalRoute(superAdmin),'admin');

  for(const organizationRole of ['owner','admin','editor','teacher']){
    const organizationAdmin=user({role:'student',organizationId:'org-1',organizationRole});
    assert.equal(hasAdminPortalAccess(organizationAdmin),true,organizationRole);
    assert.equal(isOrganizationPortalAccount(organizationAdmin),true,organizationRole);
    assert.equal(defaultPortalRoute(organizationAdmin),'admin',organizationRole);
  }

  const mentor=user({role:'mentor',organizationId:'org-1',organizationRole:'mentor'});
  assert.equal(hasMentorPortalAccess(mentor),true);
  assert.equal(hasAdminPortalAccess(mentor),false);
  assert.equal(canAccessPortalRoute(mentor,'admin'),false);
  assert.equal(canAccessPortalRoute(mentor,'mentor'),true);
  assert.equal(defaultPortalRoute(mentor),'mentor');

  const translator=user({role:'student',localizationAccess:{status:'active'}});
  assert.equal(hasLocalizationPortalAccess(translator),true);
  assert.equal(defaultPortalRoute(translator),'localization');

  const learner=user({role:'student'});
  assert.equal(defaultPortalRoute(learner),'home');
});

test('stale tenant role metadata cannot create portal access without a tenant identity',()=>{
  const staleAdmin=user({role:'student',organizationRole:'admin',organizationId:''});
  const staleMentor=user({role:'student',organizationRole:'mentor',organizationId:''});
  const staleTopLevelMentor=user({role:'mentor',organizationRole:'',organizationId:''});
  assert.equal(hasAdminPortalAccess(staleAdmin),false);
  assert.equal(isOrganizationPortalAccount(staleAdmin),false);
  assert.equal(hasMentorPortalAccess(staleMentor),false);
  assert.equal(hasMentorPortalAccess(staleTopLevelMentor),false);
  assert.equal(canAccessPortalRoute(staleAdmin,'admin'),false);
  assert.equal(canAccessPortalRoute(staleMentor,'mentor'),false);
  assert.equal(canAccessPortalRoute(staleTopLevelMentor,'mentor'),false);
});

test('admin, mentor and localization workspaces remain distinct',()=>{
  const admin=user({role:'student',organizationId:'org-1',organizationRole:'admin'});
  const mentor=user({role:'student',organizationId:'org-1',organizationRole:'mentor'});
  const translator=user({role:'student',localizationAccess:{status:'invited'}});

  assert.equal(canAccessPortalRoute(admin,'admin'),true);
  assert.equal(canAccessPortalRoute(admin,'mentor'),false);
  assert.equal(canAccessPortalRoute(mentor,'mentor'),true);
  assert.equal(canAccessPortalRoute(mentor,'admin'),false);
  assert.equal(canAccessPortalRoute(translator,'localization'),true);
  assert.equal(canAccessPortalRoute(translator,'admin'),false);
});
