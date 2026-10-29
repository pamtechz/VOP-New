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

test('local API mirrors consolidated Vercel payment rewrites', async () => {
  const loaded=[];
  const received=[];
  const middleware=createLocalApiMiddleware({
    ssrLoadModule:async path=>{
      loaded.push(path);
      return {default(req,res){received.push(req);res.status(200).json({ok:true});}};
    },
  });
  for(const path of ['/api/payments/history','/api/payments/catalog']){
    const res={headersSent:false,writableEnded:false,setHeader(){},end(){this.writableEnded=true;}};
    await middleware({method:'GET',url:path,headers:{}},res,()=>assert.fail('Payment request fell through'));
  }
  assert.deepEqual(loaded,['/api/payments.ts','/api/payments.ts']);
  assert.equal(received[0].query.__vopPaymentRoute,'history');
  assert.equal(received[1].query.__vopPaymentRoute,'catalog');
});

test('local API mirrors consolidated health, catalogue, mobile and account rewrites', async () => {
  const loaded=[];
  const received=[];
  const middleware=createLocalApiMiddleware({ssrLoadModule:async path=>{
    loaded.push(path);
    return {default(req,res){received.push(req);res.status(200).json({ok:true});}};
  }});
  for(const route of ['health','public-catalog','mobile','account','account-lifecycle-cron']){
    const res={headersSent:false,writableEnded:false,setHeader(){},end(){this.writableEnded=true;}};
    await middleware({method:'GET',url:'/api/'+route,headers:{}},res,()=>assert.fail('Route fell through'));
  }
  assert.deepEqual(loaded,Array(5).fill('/api/admin.ts'));
  assert.deepEqual(received.map(req=>req.query.__vopRoute),['health','public-catalog','mobile','account','account']);
  assert.equal(received[4].query.__vopAccountRoute,'lifecycle-cron');
});

test('local API rejects malformed JSON with a client error before invoking the handler', async () => {
  let invoked=false;
  const middleware=createLocalApiMiddleware({ssrLoadModule:async()=>({default(){invoked=true;}})});
  const res={headersSent:false,writableEnded:false,statusCode:200,setHeader(){},end(){this.writableEnded=true;}};
  const req={method:'POST',url:'/api/study/progress',headers:{},async *[Symbol.asyncIterator](){yield Buffer.from('{broken');}};
  await middleware(req,res,()=>assert.fail('Route fell through'));
  assert.equal(res.statusCode,400);
  assert.equal(invoked,false);
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


test('UI language stays usable when storage access or quota fails', async () => {
  const original={localStorage:globalThis.localStorage,fetch:globalThis.fetch,document:globalThis.document};
  globalThis.document={documentElement:{}};
  globalThis.fetch=async()=>({ok:true,json:async()=>({items:[{code:'bem'},{code:'eng',aliases:['en']}],translations:{}})});
  globalThis.localStorage={getItem(){throw new DOMException('Blocked','SecurityError');},setItem(){throw new DOMException('Full','QuotaExceededError');}};
  try{
    const i18n=await server.ssrLoadModule('/src/services/i18n.ts');
    assert.doesNotThrow(()=>i18n.getUiLocale());
    // A stale persisted value must not undo a session change when its write fails.
    globalThis.localStorage.getItem=()=> 'eng';
    assert.doesNotThrow(()=>i18n.setUiLocale('bem'));
    await i18n.loadUiLocale('bem');
    assert.equal(i18n.getUiLocale(),'bem');
    assert.equal(document.documentElement.lang,'bem');
  }finally{Object.assign(globalThis,original);}
});

test('package lock matches supported runtime, Vite, and gRPC dependencies', () => {
  const root=join(dirname(fileURLToPath(import.meta.url)),'..');
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
  assert.equal(pkg.engines.node,'>=22.12 <23');
  assert.equal(pkg.engines.npm,'>=10 <11');
  assert.equal(pkg.packageManager,'npm@10.9.2');
  assert.equal(readFileSync(join(root,'.nvmrc'),'utf8').trim(),'22.16.0');
  assert.equal(readFileSync(join(root,'.node-version'),'utf8').trim(),'22.16.0');
  assert.equal(readFileSync(join(root,'.npmrc'),'utf8').trim(),'engine-strict=true');
  assert.equal(pkg.devDependencies.vite,'8.3.5');
  assert.equal(lock.packages[''].devDependencies.vite,'8.3.5');
  assert.equal(lock.packages[''].engines.node,'>=22.12 <23');
  assert.equal(lock.packages[''].engines.npm,'>=10 <11');
  assert.equal(lock.packages['node_modules/vite'].version,'8.3.5');
  assert.notEqual(lock.packages['node_modules/vite'].peer,true);
  assert.equal(pkg.devDependencies['firebase-tools'],'15.34.1');
  assert.equal(lock.packages[''].devDependencies['firebase-tools'],'15.34.1');
  assert.equal(lock.packages['node_modules/firebase-tools'].version,'15.34.1');
  assert.equal(pkg.overrides['@grpc/grpc-js'],'1.14.5');
  assert.equal(lock.packages['node_modules/@grpc/grpc-js'].version,'1.14.5');
  assert.equal(lock.packages['node_modules/@grpc/grpc-js/node_modules/@grpc/proto-loader'].version,'0.8.1');
});
