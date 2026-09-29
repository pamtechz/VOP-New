import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMutableTenantResource, platformStewardedResource } from '../shared/platformStewardship.ts';

test('published shared or adopted records are platform stewarded', () => {
  assert.equal(platformStewardedResource({sharingScope:'shared',published:true}),true);
  assert.equal(platformStewardedResource({scope:'platform'}),true);
  assert.equal(platformStewardedResource({adoptedByPlatform:true}),true);
  assert.equal(platformStewardedResource({sharingScope:'organization',published:true}),false);
  assert.equal(platformStewardedResource({sharingScope:'shared',published:false}),false);
});
test('organizational administrators cannot edit, archive or delete shared published material',()=>{
  for(const operation of ['edit','archive','delete'] as const){
    assert.throws(()=>assertMutableTenantResource(false,{sharingScope:'shared',published:true},operation),/platform stewardship/);
    assert.doesNotThrow(()=>assertMutableTenantResource(true,{sharingScope:'shared',published:true},operation));
    assert.doesNotThrow(()=>assertMutableTenantResource(false,{sharingScope:'organization',published:true},operation));
    assert.doesNotThrow(()=>assertMutableTenantResource(false,undefined,operation));
  }
});
