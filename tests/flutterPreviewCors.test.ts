import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cors=readFileSync('server/flutterPreviewCors.ts','utf8');
const handlers=['admin','engagement','mentorship','prayer','certificates','share','localization','study/progress'];

test('browser preview CORS requires an explicit exact-origin environment allowlist',()=>{
  assert.match(cors,/VOP_FLUTTER_WEB_ALLOWED_ORIGINS/);
  assert.match(cors,/configuration\.split\(','\)\.some/);
  assert.match(cors,/normalizedOrigin\(entry\.trim\(\)\)===normalized/);
  assert.match(cors,/uri\.origin!==value/);
  assert.match(cors,/uri\.username \|\| uri\.password/);
  assert.match(cors,/uri\.protocol==='https:'/);
  assert.match(cors,/uri\.hostname==='127\.0\.0\.1'/);
  assert.match(cors,/setHeader\?\.\('Access-Control-Allow-Origin',origin\)/);
  assert.doesNotMatch(cors,/setHeader\?\.\('Access-Control-Allow-Origin','\*'\)/);
  assert.doesNotMatch(cors,/setHeader\?\.\('Access-Control-Allow-Credentials'/);
});

test('preflight runs before authentication on every Flutter learner API endpoint',()=>{
  for(const handler of handlers){
    const file=readFileSync('api/'+handler+'.ts','utf8');
    const index=file.indexOf('export default async function handler(');
    const corsPosition=file.indexOf('if (applyFlutterPreviewCors(req, res)) return;',index);
    assert.ok(corsPosition>index,handler+' missing CORS request guard');
    const preceding=file.slice(index,corsPosition);
    assert.doesNotMatch(preceding,/authenticateTenant|verifyIdToken|req\.method\s*!==\s*'POST'/,
      handler+' performs protected work before CORS preflight');
  }
});
