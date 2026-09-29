import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>readFileSync(root+path,'utf8');
const applySharedPreference=()=>read('src/components/layout/sidebarPreference.ts');

test('visitors see the public homepage before signing in',()=>{
  const rootView=read('src/Root.tsx');
  const page=read('src/pages/PublicHome.tsx');
  assert.match(rootView,/if \(!account\)/);
  assert.match(rootView,/authView === 'home'/);
  assert.match(rootView,/<PublicHome onSignIn=/);
  assert.match(rootView,/<SignInPage initialMode=/);
  assert.ok(rootView.indexOf('if (portfolioToken)') < rootView.indexOf("if (!account)"),'portfolio verification must stay public');
  assert.match(page,/One Digital Platform\. One Connected Ministry\./);
  assert.match(page,/id="features"/);
  assert.match(page,/id="how-it-works"/);
  assert.match(page,/id="organizations"/);
  assert.match(page,/configurationMissing/);
});

test('desktop has permanent collapsible learner sidebar with account actions guarded',()=>{
  const app=read('src/App.tsx');
  const sidebar=read('src/components/layout/LearnerSidebar.tsx');
  const css=read('src/components/layout/sidebar-system.css');
  assert.match(app,/currentRoute !== 'admin' && !isMobileShell && <LearnerSidebar/);
  assert.match(sidebar,/collapsed:boolean/);
  assert.match(app,/readSidebarCollapsed/);
  assert.match(app,/persistSidebarCollapsed/);
  assert.match(sidebar,/onClick=\{onToggle\}/);
  assert.match(sidebar,/isAdmin\?\[\{route:'admin'/);
  assert.match(sidebar,/aria-current=\{currentRoute===item\.route\?'page':undefined\}/);
  assert.match(sidebar,/aria-controls="vop-learner-sidebar-links"/);
  assert.match(css,/\.vop-learner-sidebar\.is-collapsed/);
  assert.match(css,/@media\(max-width:1023px\)/);
  assert.match(css,/\.vop-learner-sidebar\{display:none!important\}/);
});

test('admin persists its collapse state while preserving the accessible mobile drawer',()=>{
  const page=read('src/pages/AdminPage.tsx');
  const css=read('src/components/layout/sidebar-system.css');
  assert.match(page,/sidebarCollapsed: boolean/);
  assert.match(page,/onToggleSidebar: \(\) => void/);
  assert.match(applySharedPreference(),/vop:sidebar-collapsed/);
  assert.match(page,/vop-admin-sidebar-collapse/);
  assert.match(page,/aria-label=\{sidebarCollapsed \? 'Expand administration sidebar'/);
  assert.match(page,/vop-sidebar-backdrop open/);
  assert.match(css,/@media\(max-width:900px\)\{\.vop-admin-sidebar-collapse\{display:none!important\}\}/);
  assert.match(css,/grid-template-columns:var\(--vop-rail-expanded\) minmax\(0,1fr\)/);
  assert.match(css,/\.vop-admin \.vop-shell\{display:contents!important\}/);
  assert.match(css,/grid-column:1;grid-row:1 \/ span 2/);
  assert.match(page,/vop-admin-sidebar-footer/);
  assert.match(page,/vop-admin-sidebar-logout/);
});
