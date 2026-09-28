import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const walk=path=>readdirSync(new URL(path,root),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path+'/'+entry.name):/\.(?:ts|js|mjs)$/.test(entry.name)?[path+'/'+entry.name]:[]);
test('Vercel functions remain below Hobby limit',()=>assert.ok(walk('api').length<=12));
test('Every consolidated admin route remains mapped',()=>{const gateway=read('api/admin.ts');for(const file of walk('api_handlers/admin')){const name=file.split('/').pop().replace(/\.ts$/,'');assert.ok(gateway.includes('../api_handlers/admin/'+name+'.js'),name);assert.ok(gateway.includes("'"+name+"':"),name);}});
test('The public API and scheduled cron keep their original paths',()=>{const config=JSON.parse(read('vercel.json'));assert.ok(config.rewrites.some(x=>x.source==='/api/admin/:route*'&&x.destination==='/api/admin?__vopRoute=:route*'));assert.ok(config.crons.some(x=>x.path==='/api/mentorship-cron'));assert.match(read('vite.config.ts'),/api_handlers/);});
