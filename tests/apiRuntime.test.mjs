import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalApiMiddleware } from '../vite.config.ts';
import { localeAliases } from '../shared/locales.ts';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const response = () => ({ code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } });

test('local API preserves locale, action and repeated query parameters', async () => {
  let received;
  const middleware = createLocalApiMiddleware({ ssrLoadModule: async () => ({ default(req, res) { received = req; res.status(200).json({ ok: true }); } }) });
  const res = { headersSent: false, writableEnded: false, setHeader() {}, end() { this.writableEnded = true; } };
  await middleware({ method: 'GET', url: '/api/localization?locale=bem&action=mine&tag=a&tag=b', headers: {} }, res, () => assert.fail('API request fell through'));
  assert.equal(received.query.locale, 'bem');
  assert.equal(received.query.action, 'mine');
  assert.deepEqual(received.query.tag, ['a', 'b']);
});

test('certificate mine query reaches authentication instead of public verification', async () => {
  const { default: handler } = await server.ssrLoadModule('/api/certificates.ts');
  const res = response();
  await handler({ method: 'GET', query: { action: 'mine' }, headers: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(res.payload.error, 'Sign in first.');
  const verification = response();
  await handler({ method: 'GET', query: {}, headers: {} }, verification);
  assert.equal(verification.code, 400);
  assert.equal(verification.payload.error, 'Enter a certificate number.');
});

test('consolidated admin and localization modules load with the installed SDK', async () => {
  for (const path of ['/api/admin.ts', '/api/localization.ts']) {
    assert.equal(typeof (await server.ssrLoadModule(path)).default, 'function');
  }
  const { default: handler } = await server.ssrLoadModule('/api/admin.ts');
  for (const route of ['users', 'content', 'permissions', 'search', 'notifications']) {
    const res = response();
    await handler({ method: 'POST', query: { __vopRoute: route }, body: { action: 'list', collection: 'curriculum' }, headers: {} }, res);
    assert.ok(res.code >= 400 && res.code < 500, `${route}: ${res.code}`);
    assert.match(res.payload.error, /sign in/i);
  }
});

test('configured language codes resolve standard and administrator aliases', () => {
  assert.deepEqual(localeAliases('eng'), ['eng', 'en']);
  assert.deepEqual(localeAliases('bem'), ['bem']);
  assert.deepEqual(localeAliases('swa', ['sw', 'bad/path']), ['swa', 'sw']);
});

test('loading fallback translations preserves the selected locale and resolves en to eng', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];
  globalThis.document = { documentElement: {} };
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (url === '/api/localization') return { ok: true, json: async () => ({ items: [
      { code: 'eng', aliases: ['en', 'eng'], name: 'English' }, { code: 'bem', name: 'Bemba' },
    ] }) };
    return { ok: true, json: async () => ({ translations: { 'common.save': 'Save' }, fallback: 'en', direction: 'ltr' }) };
  };
  try {
    const { loadUiLocale } = await server.ssrLoadModule('/src/services/i18n.ts');
    await loadUiLocale('bem');
    assert.equal(document.documentElement.lang, 'bem');
    assert.ok(calls.includes('/api/localization?locale=eng'));
    assert.ok(!calls.includes('/api/localization?locale=en'));
    assert.equal(calls.filter(url => url.endsWith('locale=eng')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }
});


test('package lock matches grpc override and Capacitor app dependency', () => {
  const root=join(dirname(fileURLToPath(import.meta.url)),'..');
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
  assert.equal(pkg.engines.node,'>=22.12 <23');
  assert.equal(pkg.dependencies['@capacitor/app'],'8.1.1');
  assert.equal(lock.packages[''].dependencies['@capacitor/app'],'8.1.1');
  assert.equal(pkg.devDependencies.vite,'8.3.0');
  assert.equal(lock.packages[''].devDependencies.vite,'8.3.0');
  assert.equal(lock.packages['node_modules/vite'].version,'8.3.0');
  assert.notEqual(lock.packages['node_modules/vite'].peer,true);
  assert.equal(pkg.overrides['@grpc/grpc-js'],'1.14.5');
  assert.equal(lock.packages['node_modules/@grpc/grpc-js'].version,'1.14.5');
  assert.equal(lock.packages['node_modules/@grpc/grpc-js/node_modules/@grpc/proto-loader'].version,'0.8.1');
});
