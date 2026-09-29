import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

test('learner account consumes the same scoped guides, settings and locale as the app', () => {
  const app = read('src/App.tsx');
  const menu = read('src/components/layout/MenuDrawer.tsx');
  for (const binding of ['guides={guides}', 'settings={settings}', 'activeLanguage={activeLanguage}', 'currentRoute={currentRoute}']) {
    assert.ok(app.includes(binding), binding);
  }
  assert.match(menu, /calculateCurriculumProgress\(guides, currentUser, settings\.quizPassThreshold, activeLanguage\)/);
  assert.doesNotMatch(menu, /getStoredGuides\(/);
  assert.match(menu, /progress\.totalGuides > 0/);
  assert.match(menu, /No certificate-eligible guides are available/);
});

test('desktop menu groups the learner routes without exposing admin to learners', () => {
  const menu = read('src/components/layout/MenuDrawer.tsx');
  for (const route of ['lessons','resources','master-guide','scripture-memory','iron-duels','prayer','radio','events','announcements','profile','personal-settings','certificates','about']) {
    assert.ok(menu.includes("route: '" + route + "'"), route);
  }
  assert.match(menu, /\.\.\.\(isAdmin \? \[\{ route: 'admin'/);
  assert.match(menu, /currentRoute === item\.route/);
  assert.match(menu, /onNavigate\(route\)/);
  assert.doesNotMatch(menu, /onLogout\(\)/);
  assert.match(read('src/components/layout/Header.tsx'), /onLogout\(\)/);
});

test('account menu handles escape, focus, tab cycling and body scroll recovery', () => {
  const menu = read('src/components/layout/MenuDrawer.tsx');
  assert.match(menu, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(menu, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(menu, /event\.key === 'Escape'/);
  assert.match(menu, /event\.key !== 'Tab'/);
  assert.match(menu, /aria-modal="true"/);
  assert.match(menu, /aria-labelledby="vop-account-title"/);
  assert.match(menu, /closeRef\.current\?\.focus\(\)/);
  assert.match(menu, /focusedBeforeOpen\?\.focus\(\)/);
});

test('desktop account is split into account overview and navigation; mobile remains single-column', () => {
  const css = read('src/components/layout/menu-drawer.css');
  assert.match(css, /grid-template-columns:minmax\(275px,0\.85fr\) minmax\(0,1\.35fr\)/);
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /:focus-visible/);
});
