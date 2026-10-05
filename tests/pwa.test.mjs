import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('PWA manifest is installable and scoped to VOP', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'VOP App');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test('service worker has versioned cache lifecycle and excludes API authority', () => {
  const source = read('public/sw.js');
  assert.match(source, /const CACHE_NAME = 'vop-shell-v1'/);
  assert.match(source, /skipWaiting\(\)/);
  assert.match(source, /clients\.claim\(\)/);
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /caches\.keys\(\)/);
  assert.match(source, /caches\.match\(request\)/);
});

test('production entry reconciles service worker registration with platform PWA policy', () => {
  const source = read('src/main.tsx');
  assert.match(source, /import\.meta\.env\.PROD/);
  assert.match(source, /\/api\/admin\/auth\?action=policy/);
  assert.match(source, /policy\.pwa\?\.enabled === true/);
  assert.match(source, /navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(source, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(source, /registration => registration\.unregister\(\)/);
});
