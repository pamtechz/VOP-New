import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

test('tenant staff who retain a student role are never counted as learner enrollments',async()=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'error'});
  try{
    const {isLearnerProfile}=await vite.ssrLoadModule('/shared/learnerProfiles.ts');
    const {roleForPermission}=await vite.ssrLoadModule('/shared/permissions.ts');
    for(const organizationRole of ['owner','admin','editor','teacher','mentor','staff']){
      assert.equal(isLearnerProfile({role:'student',organizationRole}),false,organizationRole);
      assert.equal(roleForPermission({role:'student',organizationRole}),organizationRole);
    }
    assert.equal(isLearnerProfile({role:'student',organizationRole:'learner'}),true);
    assert.equal(isLearnerProfile({role:'student',organizationRole:''}),true);
    assert.equal(isLearnerProfile({role:'super_admin'}),false);
    assert.equal(isLearnerProfile({role:'student',adminNodeId:'church'}),false);
  }finally{await vite.close();}
});
