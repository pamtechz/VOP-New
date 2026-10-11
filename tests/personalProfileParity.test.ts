import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('web account and learner profile share the server-owned profile mutation',()=>{
  const settings=read('src/pages/PersonalSettingsPage.tsx');
  const learner=read('src/pages/ReferenceProfilePage.tsx');
  const staff=read('src/pages/OrganizationAccountProfilePage.tsx');
  const service=read('src/services/accountProfile.ts');
  assert.match(settings,/loadOwnProfile\(\)/);
  assert.match(settings,/saveOwnProfile\(changes\)/);
  assert.match(settings,/photoURL/);
  assert.match(settings,/profileDirty/);
  assert.match(learner,/await saveOwnProfile\(/);
  assert.match(staff,/await saveOwnProfile\(/);
  assert.match(service,/action:'?updateOwnProfile'?|profileAction\('updateOwnProfile'/);
  assert.match(service,/vop_profile_updated/);
  assert.doesNotMatch(settings,/onChange=.*updateUser\(/);
});

test('server whitelists editable fields and protects profile authorization',()=>{
  const server=read('api_handlers/admin/users.ts');
  const snippet=server.slice(server.indexOf("if (action === 'updateOwnProfile')"),server.indexOf("if (action === 'personalSettings')"));
  for(const field of ['displayName','phoneNumber','whatsappNumber','address','bio','photoURL']){
    assert.ok(snippet.includes(field));
  }
  assert.match(snippet,/allowedProfileFields/);
  assert.match(snippet,/isSafeHttpsMediaUrl/);
  assert.match(snippet,/decoded.uid/);
  assert.match(server,/photoURL: existing.photoURL \?\? decoded.picture/);
  for(const forbidden of ["role","organizationId","privileges","email"]){
    assert.ok(!snippet.includes("'"+forbidden+"'"),forbidden);
  }
});

test('native account permits same personal fields with responsive controls',()=>{
  const native=read('native_android/lib/screens/account_settings_screen.dart');
  assert.match(native,/widget.api.saveProfile/);
  assert.match(native,/widget.api.savePersonalSettings\(changes\)/);
  assert.match(native,/bio.text.trim\(\)/);
  assert.match(native,/photoUrl.text.trim\(\)/);
  assert.match(native,/constraints.maxWidth<410/);
  assert.match(native,/widget.api.supportedLanguages\(\).catchError/);
});
