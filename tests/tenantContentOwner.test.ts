import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import type { TenantContext } from '../server/tenant.ts';

const tenantModule=(async()=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    return await vite.ssrLoadModule('/server/tenant.ts') as typeof import('../server/tenant.ts');
  }finally{
    await vite.close();
  }
})();

function subject(uid: string, organizationId = 'church-one', membershipRole = 'admin', platformRole = 'student'): TenantContext {
  return {
    auth:{uid},
    isSuperAdmin:platformRole === 'super_admin',
    tenantType:'organization',tenantId:organizationId,organizationId,
    profile:{role:platformRole},
    membership:{role:membershipRole},
  } as unknown as TenantContext;
}
const contribution = {ownerTenantId:'church-one',ownerOrganizationId:'church-one',organizationId:'church-one',ownerUid:'author'};

test('peer administrators cannot edit another author\'s contribution',async()=>{
  const {canEditCanonicalContent}=await tenantModule;
  assert.equal(canEditCanonicalContent(subject('author'),contribution),true);
  assert.equal(canEditCanonicalContent(subject('peer'),contribution),false);
  assert.equal(canEditCanonicalContent(subject('author','church-two'),contribution),false);
  assert.equal(canEditCanonicalContent(subject('author'),{...contribution,ownerUid:''}),false);
});
test('teacher may edit only own authored content when tenant matches',async()=>{
  const {canEditCanonicalContent}=await tenantModule;
  assert.equal(canEditCanonicalContent(subject('teacher','church-one','teacher'),{...contribution,ownerUid:'teacher'}),true);
  assert.equal(canEditCanonicalContent(subject('teacher','church-one','teacher'),contribution),false);
  assert.equal(canEditCanonicalContent(subject('unprivileged','church-one','learner'),{...contribution,ownerUid:'unprivileged'}),false);
});
test('Super Admin retains platform override without organization selection',async()=>{
  const {canEditCanonicalContent}=await tenantModule;
  const superAdmin=subject('super','','platform','super_admin');
  superAdmin.tenantType='platform';
  assert.equal(canEditCanonicalContent(superAdmin,contribution),true);
});
test('hierarchy tenant cannot inherit authorship from another hierarchy',async()=>{
  const {canEditCanonicalContent}=await tenantModule;
  const hierarchy=subject('union-user','','union_admin','union_admin');
  hierarchy.tenantType='hierarchy';
  hierarchy.tenantId='union_admin:union-one';
  assert.equal(canEditCanonicalContent(hierarchy,{ownerUid:'union-user',ownerTenantId:'union_admin:union-one'}),true);
  assert.equal(canEditCanonicalContent(hierarchy,{ownerUid:'union-user',ownerTenantId:'union_admin:union-two'}),false);
});
