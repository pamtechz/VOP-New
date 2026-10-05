import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('personal accessibility preferences have session-wide runtime effects',()=>{
  const service=read('src/services/personalSettings.ts');
  const app=read('src/App.tsx');
  const css=read('src/index.css');
  assert.match(service,/dataset\.vopReducedMotion/);
  assert.match(service,/dataset\.vopLargeText/);
  assert.match(service,/dataset\.vopHighContrast/);
  assert.match(app,/loadPersonalSettings\(\)/);
  assert.match(app,/applyAccessibilityPreferences\(personal\.accessibility\)/);
  assert.match(css,/data-vop-reduced-motion="true"/);
  assert.match(css,/data-vop-large-text="true"/);
  assert.match(css,/data-vop-high-contrast="true"/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});

test('global focus visibility remains explicit for keyboard users',()=>{
  const css=read('src/index.css');
  assert.match(css,/:focus-visible/);
  assert.match(css,/outline-offset/);
});

test('unsupported exact-time study reminder controls are not exposed as fake settings',()=>{
  const page=read('src/pages/PersonalSettingsPage.tsx');
  assert.doesNotMatch(page,/Preferred study time/);
  assert.doesNotMatch(page,/Study reminders/);
});

test('email preference surface reports provider readiness instead of implying guaranteed delivery',()=>{
  const page=read('src/pages/PersonalSettingsPage.tsx');
  const service=read('src/services/personalSettings.ts');
  assert.match(service,/action=capabilities/);
  assert.match(page,/Email delivery is not currently available/);
});
