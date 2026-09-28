import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
function source(path) { return readFileSync(new URL(path, root), 'utf8'); }
function sourceFiles(dir) {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(dir + '/' + entry.name) : /\.(?:ts|js|mjs)$/.test(entry.name) ? [dir + '/' + entry.name] : []);
}

test('Vercel Hobby API entrypoint count stays within the 12-function limit', () => {
  const functions = sourceFiles('api');
  assert.ok(functions.length <= 12, 'Found ' + functions.length + ' Vercel entrypoints: ' + functions.join(', '));
});

test('every relocated administrative handler is registered by the single gateway', () => {
  const modules = sourceFiles('api_handlers/admin');
  const gateway = source('api/admin.ts');
  assert.ok(modules.length > 0);
  for (const path of modules) {
    const name = path.slice('api_handlers/admin/'.length).replace(/\.ts$/, '');
    assert.ok(gateway.includes(`'../api_handlers/admin/${name}.js'`), name + ' must be imported');
    assert.ok(gateway.includes(`'${name}':`), name + ' must be routed');
  }
  assert.match(gateway, /hasOwnProperty\.call\(routes, route\)/);
  assert.match(gateway, /routes\[route\]/);
});

test('API rewrites keep URLs and scheduled mentorship intact', () => {
  const config = JSON.parse(source('vercel.json'));
  assert.ok(config.rewrites.some(rule => rule.source === '/api/admin/:route*' && rule.destination === '/api/admin?__vopRoute=:route*'));
  assert.ok(config.crons.some(job => job.path === '/api/mentorship-cron'));
  assert.match(source('vite.config.ts'), /api_handlers/);
});
