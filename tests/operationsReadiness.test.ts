import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');

test('operational readiness is embedded only inside Super Admin Services',()=>{
  const admin=read('src/pages/AdminPage.tsx');
  assert.match(admin,/const OperationsReadinessPanel=React\.lazy/);
  assert.match(admin,/isSuperAdmin && settingsSubtab === 'services'/);
  assert.match(admin,/<OperationsReadinessPanel\/>/);
  assert.match(admin,/<React\.Suspense fallback=\{<AdminPanelLoading\/>\}>/);
  assert.doesNotMatch(admin,/\|\s*'operations'\s*\|/);
});

test('readiness panel uses authenticated live server data and preserves degraded status',()=>{
  const panel=read('src/pages/OperationsReadinessPanel.tsx');
  assert.match(panel,/auth\?\.currentUser/);
  assert.match(panel,/signedIn\.getIdToken\(\)/);
  assert.match(panel,/fetch\('\/api\/health\?detail=1'/);
  assert.match(panel,/Authorization:'Bearer '\+token/);
  assert.match(panel,/cache:'no-store'/);
  assert.match(panel,/AbortController/);
  assert.match(panel,/if\(!response\.ok\|\|!payload/);
  assert.doesNotMatch(panel,/if\(!payload\.ok\)/);
  assert.match(panel,/health\?\.backup\.status==='ok'/);
  assert.match(panel,/health\?\.maintenance\.status==='ok'/);
  assert.match(panel,/health\.backup\.lastCompletedAt/);
  assert.match(panel,/health\.deployment\.sha/);
  assert.match(panel,/getTranslation\(/);
  assert.doesNotMatch(panel,/VITE_FIREBASE_ADMIN|FIREBASE_ADMIN_PRIVATE_KEY|CRON_SECRET/);
});

test('detailed health remains Super Admin-only and clears successful timeout',()=>{
  const server=read('api_handlers/admin/health.ts');
  assert.match(server,/authenticateTenant\(req,undefined,true\)/);
  assert.match(server,/if\(!ctx\.isSuperAdmin\)return res\.status\(403\)/);
  assert.match(server,/clearTimeout\(timeout\)/);
  assert.match(server,/status\(503\)/);
  assert.match(server,/getAdminDb\(\)/);
});
