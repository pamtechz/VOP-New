import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('release clients use the same registered Firebase project with distinct platform app IDs',()=>{
  const android=JSON.parse(readFileSync('native_android/config/google-services.json','utf8'));
  const web=JSON.parse(readFileSync('native_android/config/web-public.json','utf8'));
  const clients=android.client.filter((client:{client_info:{android_client_info:{package_name:string}}})=>client.client_info.android_client_info.package_name==='com.sda.vop');
  assert.equal(clients.length,1);
  assert.equal(web.VOP_FIREBASE_PROJECT_ID,android.project_info.project_id);
  assert.equal(web.VOP_FIREBASE_SENDER_ID,android.project_info.project_number);
  assert.match(web.VOP_FIREBASE_WEB_APP_ID,/^1:[0-9]+:web:[a-f0-9]+$/i);
  assert.match(clients[0].client_info.mobilesdk_app_id,/^1:[0-9]+:android:/);
  assert.notEqual(web.VOP_FIREBASE_WEB_APP_ID,clients[0].client_info.mobilesdk_app_id);
  assert.equal(new URL(web.VOP_API_BASE_URL).protocol,'https:');
  const allowed=new Set(['VOP_API_BASE_URL','VOP_FIREBASE_API_KEY','VOP_FIREBASE_WEB_APP_ID','VOP_FIREBASE_WEB_AUTH_DOMAIN','VOP_FIREBASE_SENDER_ID','VOP_FIREBASE_PROJECT_ID']);
  assert.ok(Object.keys(web).every(key=>allowed.has(key)));
  assert.doesNotMatch(JSON.stringify({android,web}),/private_key|client_secret|refresh_token|service_account/);
  assert.ok(Object.values(web).every(value=>typeof value==='string'&&value.length>0&&!value.includes('placeholder')));
});
