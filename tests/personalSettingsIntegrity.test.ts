import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('web personal settings cannot overwrite remote state after a failed initial read',()=>{
  const view=read('src/pages/PersonalSettingsPage.tsx');
  assert.match(view,/setSavedSettings\(null\)/);
  assert.match(view,/setSettingsLoadError/);
  assert.match(view,/Retry loading settings/);
  assert.match(view,/if\(saving\|\|!savedSettings\|\|!settingsDirty\)return/);
  assert.match(view,/disabled=\{saving\|\|!savedSettings\|\|!settingsDirty\}/);
  assert.match(view,/savePersonalSettings\(changed\)/);
  assert.doesNotMatch(view,/savePersonalSettings\(settings\)/);
});

test('web and native save only fields edited within a preference group',()=>{
  const web=read('src/pages/PersonalSettingsPage.tsx');
  const native=read('native_android/lib/screens/account_settings_screen.dart');
  const service=read('src/services/personalSettings.ts');
  assert.match(web,/Object\.keys\(value\)/);
  assert.match(web,/Object\.keys\(settings\)/);
  assert.match(native,/final changes=_settingsDelta\(\)/);
  assert.match(native,/widget\.api\.savePersonalSettings\(changes\)/);
  assert.match(native,/jsonEncode\(entry\.value\)!=jsonEncode\(previous\[field\]\)/);
  assert.match(service,/settings\.studyPreferences\.preferredStudyTime!==undefined/);
});

test('server applies partial study changes without wiping previously stored timezone or time',()=>{
  const source=read('api_handlers/admin/users.ts');
  assert.match(source,/normalized\.studyPreferences=changes/);
  assert.match(source,/if\(study\.preferredStudyTime!==undefined\)/);
  assert.match(source,/if\(study\.timezone!==undefined\)/);
  assert.match(source,/if\(typeof study\.preferredStudyTime!=='string'\)/);
  assert.match(source,/if\(typeof study\.timezone!=='string'\)/);
});
