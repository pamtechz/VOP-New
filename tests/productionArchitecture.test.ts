import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root=process.cwd();
const read=path=>readFileSync(join(root,path),'utf8');

test('development and production builds never mutate tracked source',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.prebuild,undefined);
  assert.doesNotMatch(pkg.scripts.dev,/repair-admin-records-panel/);
  assert.doesNotMatch(pkg.scripts.build,/repair-admin-records-panel/);
  assert.equal(existsSync(join(root,'scripts/repair-admin-records-panel.mjs')),false);
});

test('maintained application code is covered by the primary lint gate',()=>{
  const pkg=JSON.parse(read('package.json'));
  for(const target of ['src','api','api_handlers','server','scripts','tests']){
    assert.match(pkg.scripts.lint,new RegExp('(?:^|\\s)'+target+'(?:\\s|$)'));
  }
});

test('Settings does not duplicate the dedicated Translation Studio workflow',()=>{
  const settings=read('src/pages/AdminPage.tsx');
  const participation=read('src/components/localization/LocalizationParticipation.tsx');
  const studio=read('src/components/localization/LocalizationTranslationStudio.tsx');
  assert.doesNotMatch(settings,/Translation Studio/);
  assert.doesNotMatch(settings,/Platform translations/);
  assert.match(participation,/LocalizationTranslationStudio/);
  assert.match(studio,/Translation Studio/);
  assert.match(studio,/Platform translations/);
});

test('Android release binaries are never source-controlled again',()=>{
  const ignore=read('.gitignore');
  assert.match(ignore,/\*\.apk/);
  assert.match(ignore,/\*\.aab/);
  assert.equal(existsSync(join(root,'VOP App.apk')),false);
  assert.equal(existsSync(join(root,'VOP App New.apk')),false);
});
