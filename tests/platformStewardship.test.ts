import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMutableTenantResource, platformStewardedResource } from '../shared/platformStewardship.js';

test('only actual platform-owned resources are platform stewarded', () => {
  assert.equal(platformStewardedResource({scope:'platform'}),true);
  assert.equal(platformStewardedResource({platformOwned:true}),true);
  assert.equal(platformStewardedResource({adoptedByPlatform:true}),true);
  assert.equal(platformStewardedResource({scope:'organization',ownerOrganizationId:'org-a',sharingScope:'shared',published:true}),false);
  assert.equal(platformStewardedResource({scope:'organization',ownerOrganizationId:'org-a',adoptedByPlatform:true,published:true}),false);
  assert.equal(platformStewardedResource({scope:'platform',ownerOrganizationId:'org-a',published:false}),false);
  assert.equal(platformStewardedResource({sharingScope:'shared',published:true}),false);
});
test('tenant write permission remains enforced separately from platform stewardship', () => {
  for (const operation of ['edit','archive','delete'] as const) {
    assert.throws(() => assertMutableTenantResource(false,{scope:'platform'},operation),/platform stewardship/);
    assert.doesNotThrow(() => assertMutableTenantResource(true,{scope:'platform'},operation));
    assert.doesNotThrow(() => assertMutableTenantResource(false,{ownerOrganizationId:'org-a',sharingScope:'shared',published:true},operation));
  }
});
