import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');

test('legacy guide snapshot cache is optional, bounded and survives full localStorage',()=>{
  const storage=read('src/services/storage.ts');
  assert.match(storage,/MAX_GUIDE_CACHE_CHARACTERS/);
  assert.match(storage,/isGuideSnapshot && value\.length > MAX_GUIDE_CACHE_CHARACTERS/);
  assert.match(storage,/volatileCache\.set\(name, value\)/);
  assert.match(storage,/storage\.setItem\(name, value\)/);
  assert.match(storage,/evictGuideSnapshots\(storage\)/);
  assert.match(storage,/\/\^vop:\[\^:\]\+:vop_discover_guides\$\//);
  assert.match(storage,/try \{/);
  assert.match(storage,/catch \{/);
  assert.doesNotMatch(storage,/localStorage\.setItem\(scopedStorageKey\(key\), value\)/);
});

test('programme and guide save attempts reserve one canonical document ID before network',()=>{
  for(const filename of ['src/pages/ProgramManager.tsx','src/pages/GuideManager.tsx']){
    const src=read(filename);
    assert.match(src,/savingLock=useRef\(false\)/);
    assert.match(src,/pendingCanonicalId=useRef\(''\)/);
    assert.match(src,/savingLock\.current=true/);
    assert.match(src,/savingLock\.current=false/);
    assert.match(src,/pendingCanonicalId\.current\|\|/);
    assert.match(src,/pendingCanonicalId\.current='';/);
  }
});

test('tenant admin may edit own canonical records, but not another tenant assets',()=>{
  const server=read('server/tenant.ts');
  const program=read('server/programManager.ts');
  const stewardship=read('shared/platformStewardship.js');
  assert.match(server,/sameTenant && \(isOrgAdminOrOwner \|\| isHierarchyAdmin/);
  assert.match(server,/organizationId === ctx\.organizationId/);
  assert.match(program,/if\(previous\.exists\)/);
  assert.match(program,/if\(!\(await mayEdit\(ctx,current\)\)\)/);
  assert.match(steward,/!ownerOrganizationId/);
  assert.match(steward,/data\.scope === 'platform'/);
});
