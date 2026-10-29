import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('standalone Flutter Web routes API through a fixed same-origin Vercel rewrite',()=>{
  const config=JSON.parse(load('native_android/vercel.json')) as {
    rewrites:Array<{source:string;destination:string}>;
    headers:Array<{source:string;headers:Array<{key:string;value:string}>}>;
  };
  assert.deepEqual(config.rewrites[0],{
    source:'/api/:path*',
    destination:'https://vopafrica.vercel.app/api/:path*',
  });
  assert.match(config.rewrites[1].source,/api/,'SPA fallback must exclude API requests');
  const cache=config.headers.find(h=>h.source==='/api/:path*');
  assert.equal(cache?.headers.find(h=>h.key==='Cache-Control')?.value,'no-store, max-age=0');
  const native=load('native_android/lib/core/config.dart');
  assert.match(native,/if \(isWeb && page\.scheme == 'https' && page\.host\.isNotEmpty\)/);
  assert.match(native,/return page\.origin/);
  assert.match(native,/return configured/);
});

test('protected preview checks manifest before registration and retains PWA on permitted origins',()=>{
  const html=load('native_android/web/index.html');
  assert.doesNotMatch(html,/<link[^>]+rel="manifest"/);
  assert.match(html,/location\.hostname\.endsWith\('\.vercel\.app'\)/);
  assert.match(html,/credentials: 'include', redirect: 'manual'/);
  assert.match(html,/response\.type === 'basic' && response\.ok/);
  assert.match(html,/link\.crossOrigin = 'use-credentials'/);
  assert.match(html,/link\.rel = 'manifest'/);
  const manifest=JSON.parse(load('native_android/web/manifest.json')) as {name:string;icons:unknown[]};
  assert.equal(manifest.name,'Voice of Prophecy');
  assert.ok(manifest.icons.length>=2);
});
