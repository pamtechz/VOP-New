import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMutableTenantResource, platformStewardedResource } from '../shared/platformStewardship.js';

test('platform-owned and ownerless shared records remain under platform stewardship', () => {
  assert.equal(platformStewardedResource({sharingScope:'shared',published:true}),true);
  assert.equal(platformStewardedResource({scope:'platform'}),true);
  assert.equal(platformStewardedResource({scope:'platform',ownerOrganizationId:'org-a',published:false,sharingScope:'organization'}),false);
  assert.equal(platformStewardedResource({scope:'platform',ownerOrganizationId:'org-a',published:true,sharingScope:'shared'}),false);
  assert.equal(platformStewardedResource({sharingScope:'shared',published:true,organizationId:'org-a'}),false);
  assert.equal(platformStewardedResource({adoptedByPlatform:true,ownerOrganizationId:'org-a'}),true);
  assert.equal(platformStewardedResource({platformOwned:true,ownerOrganizationId:'org-a'}),true);
  assert.equal(platformStewardedResource({sharingScope:'organization',published:true}),false);
  assert.equal(platformStewardedResource({sharingScope:'shared',published:false}),false);
});
test('only canonical tenant-owned content escapes platform stewardship checks',()=>{
  for(const operation of ['edit','archive','delete'] as const){
    assert.throws(()=>assertMutableTenantResource(false,{sharingScope:'shared',published:true},operation),/platform stewardship/);
    assert.throws(()=>assertMutableTenantResource(false,{adoptedByPlatform:true,ownerOrganizationId:'org-a'},operation),/platform stewardship/);
    assert.doesNotThrow(()=>assertMutableTenantResource(false,{ownerOrganizationId:'org-a',sharingScope:'shared',published:true},operation));
    assert.doesNotThrow(()=>assertMutableTenantResource(true,{sharingScope:'shared',published:true},operation));
    assert.doesNotThrow(()=>assertMutableTenantResource(false,{sharingScope:'organization',published:true},operation));
    assert.doesNotThrow(()=>assertMutableTenantResource(false,undefined,operation));
  }
});
