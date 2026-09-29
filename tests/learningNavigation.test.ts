import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=(path:string)=>readFileSync(root+path,'utf8');

test('Library is materials-only; the learning tools have independent application routes',()=>{
  const library=source('src/pages/ResourcesPage.tsx');
  const app=source('src/App.tsx');
  const routes=source('src/types/index.ts');
  assert.doesNotMatch(library,/portfolioGet|memoryDecks|duelOverview|setTab\(/);
  for(const [route,mode] of [
    ['master-guide','master-guide'],['scripture-memory','memory'],['iron-duels','duels'],
  ]) {
    assert.match(routes,new RegExp("'"+route+"'"));
    assert.ok(app.includes('currentRoute === \' '+route+'\'' ) === false);
    assert.ok(app.includes('currentRoute === \' '+route)); 
  }
  assert.match(app,/currentRoute === 'lessons'/);
  assert.match(source('src/pages/EngagementPage.tsx'),/action:'duelFinish'/);
  assert.match(source('src/pages/EngagementPage.tsx'),/action:'portfolioGet'/);
  assert.match(source('src/pages/EngagementPage.tsx'),/action:'memoryDue'/);
});

test('mobile bottom nav contains five learning destinations, while account actions stay in sidebar',()=>{
  const bottom=source('src/components/layout/BottomNav.tsx');
  const drawer=source('src/components/layout/MenuDrawer.tsx');
  for(const route of ['home','lessons','resources','prayer','radio']){
    assert.ok(bottom.includes("route:'"+route+"'"),route);
  }
  assert.doesNotMatch(bottom,/route:'profile'|route:'admin'/);
  for(const route of ['profile','personal-settings','admin','master-guide','scripture-memory','iron-duels']){
    assert.ok(drawer.includes("navigate('"+route+"')"),route);
  }
});

test('small-screen admin sidebar has an explicit control, visible list and supported backdrop',()=>{
  const page=source('src/pages/AdminPage.tsx');
  const css=source('src/pages/admin-mobile.css');
  assert.match(page,/aria-controls="vop-admin-navigation"/);
  assert.match(page,/id="vop-admin-navigation"/);
  assert.match(page,/vop-sidebar-backdrop open/);
  assert.match(css,/vop-sidebar\.open/);
  assert.match(css,/vop-nav-item span/);
  assert.match(css,/display:grid!important/);
  assert.match(css,/overflow-y:auto/);
});

test('learning workspace has mobile, tablet and accessible bottom nav breakpoints',()=>{
  const css=source('src/pages/learning.css');
  assert.match(css,/@media\(max-width:767px\)/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/vop-radio-docked-player/);
});
