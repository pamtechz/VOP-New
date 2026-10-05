import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const walk=path=>readdirSync(new URL(path,root),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path+'/'+entry.name):/\.(?:ts|js|mjs)$/.test(entry.name)?[path+'/'+entry.name]:[]);
test('Vercel functions remain below Hobby limit',()=>assert.ok(walk('api').length<=12));
test('Every consolidated admin route remains mapped',()=>{const gateway=read('api/admin.ts');for(const file of walk('api_handlers/admin')){const name=file.split('/').pop().replace(/\.ts$/,'');assert.ok(gateway.includes('../api_handlers/admin/'+name+'.js'),name);assert.ok(gateway.includes("'"+name+"':"),name);}});
test('The public API and scheduled cron keep their original paths',()=>{const config=JSON.parse(read('vercel.json'));assert.ok(config.rewrites.some(x=>x.source==='/api/admin/:route*'&&x.destination==='/api/admin?__vopRoute=:route*'));assert.ok(config.crons.some(x=>x.path==='/api/mentorship-cron'));assert.ok(config.crons.some(x=>x.path==='/api/payments/reconcile-cron'));assert.ok(config.crons.some(x=>x.path==='/api/account-lifecycle-cron'));assert.ok(config.rewrites.some(x=>x.source==='/api/payments/:route*'&&x.destination==='/api/payments?__vopPaymentRoute=:route*'));assert.ok(config.rewrites.some(x=>x.source==='/api/account'&&x.destination==='/api/admin?__vopRoute=account'));assert.ok(config.rewrites.some(x=>x.source==='/api/account-lifecycle-cron'&&x.destination==='/api/admin?__vopRoute=account&__vopAccountRoute=lifecycle-cron'));assert.match(read('vite.config.ts'),/api_handlers/);assert.match(read('vite.config.ts'),/__vopAccountRoute/);assert.match(read('vite.config.ts'),/__vopRoute='account'/);});

test('generic admin records and settings use the content API, not the language API',()=>{
  const source=read('src/services/adminFirestore.ts');
  const start=source.indexOf('export const saveSettingsToFirestore');
  const records=source.indexOf('export const saveAdminRecord');
  const deletion=source.indexOf('export const deleteAdminRecord');
  assert.ok(start>=0&&records>start&&deletion>records);
  assert.match(source.slice(start,records),/fetch\('\/api\/admin\/content'/);
  assert.match(source.slice(records,deletion),/fetch\('\/api\/admin\/content'/);
  assert.match(source.slice(deletion),/fetch\('\/api\/admin\/content'/);
});
test('ownership scope is distinct from personal and assigned access relationships',()=>{
  const authorization=read('shared/authorization.ts');
  const saas=read('src/types/saas.ts');
  assert.match(authorization,/PermissionScope = 'platform' \| 'hierarchy' \| 'organization'/);
  assert.match(authorization,/AccessRelationship = 'owned' \| 'assigned' \| 'personal' \| 'public'/);
  assert.match(saas,/ResourceScope = 'platform' \| 'hierarchy' \| 'organization'/);
});

test('payments stay consolidated into one public Vercel function',()=>{
  const source=read('api/payments.ts');
  assert.match(source,/name\.startsWith\('webhooks\/'\)/);
  assert.match(source,/provider\.callbackMethods/);
  for(const route of ['checkout','verify','history','receipt','admin/transactions','admin/payable-items','admin/providers','admin/reconcile','admin/refunds']){
    assert.ok(source.includes(route),route);
  }
});
