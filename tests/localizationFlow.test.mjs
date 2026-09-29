import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const records = new Map();
const snapshot = path => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path) });
function merge(target, input) {
  for (const [key, value] of Object.entries(input)) {
    const type = value?.constructor?.name;
    if (type === 'DeleteTransform') delete target[key];
    else if (type === 'NumericIncrementTransform') target[key] = Number(target[key] || 0) + value.operand;
    else if (type === 'ServerTimestampTransform') target[key] = '2026-09-28T14:00:00Z';
    else if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge({ ...target[key] }, value);
    else target[key] = value;
  }
  return target;
}
const db = {
  doc(path) { return { path, get: async () => snapshot(path), set: async value => records.set(path, merge({ ...records.get(path) }, value)) }; },
  collection(path) { return { get: async () => ({ docs: [...records.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1).map(snapshot) }) }; },
  async runTransaction(callback) {
    const writes = [];
    await callback({ get: async ref => snapshot(ref.path), set: (ref, value) => writes.push([ref.path, value]), delete: ref => writes.push([ref.path, null]) });
    for (const [path, value] of writes) { if(value===null)records.delete(path); else records.set(path, merge({ ...records.get(path) }, value)); }
  },
};
const ctx = { db, auth: { uid: 'translator' }, isSuperAdmin: false, organizationId:'', tenantType:'platform' };
globalThis.__vopLocaleTestContext = ctx;
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', plugins: [{
  name: 'localization-test-boundaries', enforce: 'pre',
  resolveId(id, importer) {
    if (importer?.endsWith('/api/localization.ts') && id === '../server/tenant.js') return '\0locale-tenant';
    if (importer?.endsWith('/api/localization.ts') && id === '../server/permissions.js') return '\0locale-permissions';
  },
  load(id) {
    if (id === '\0locale-tenant' || id.endsWith('/server/tenant.ts')) return 'export const requireOrgRole=()=>{}; export const canEditCanonicalContent=()=>true; export const enforceQuota=async()=>{}; export const tenantOwnerKey=()=>"test"; export const organizationInHierarchyScope=async()=>true; export const accessibleOrganizationIds=async()=>[]; export const canManageOrganizationContent=async()=>true; export const getAdminDb=()=>globalThis.__vopLocaleTestContext.db; export const authenticateTenant=async()=>globalThis.__vopLocaleTestContext; export const writeTenantAudit=async()=>{};';
    if (id === '\0locale-permissions' || id.endsWith('/server/permissions.ts')) return 'export const requirePermission=async()=>{}; export const resourceForCollection=()=>"curriculum";';
  },
}] });
after(async () => { await server.close(); delete globalThis.__vopLocaleTestContext; });
const { default: handler } = await server.ssrLoadModule('/api/localization.ts');
async function request(method, body = {}, query = {}, headers = {}) {
  const res = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
  await handler({ method, body, query, headers }, res);
  return res;
}
function reset() {
  records.clear();
  records.set('languages/bem', { code: 'bem', name: 'Bemba', enabled: true });
  records.set('languages/eng', { code: 'eng', name: 'English', enabled: true });
  ctx.auth.uid = 'translator'; ctx.isSuperAdmin = true; ctx.organizationId=''; ctx.tenantType='platform';
}

test('bulkSave publishes flat and namespaced translations returned by selected language', async () => {
  reset();
  const saved = await request('POST', { action: 'bulkSave', locale: 'bem', values: { app_title: 'Ishiwi', 'common.save': 'Sunga', 'curriculum.guideRequired': 'Guide translated' }, status: 'published' });
  assert.equal(saved.code, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.count, 3);
  const loaded = await request('GET', {}, { locale: 'bem' });
  assert.deepEqual(loaded.payload.translations, { app_title: 'Ishiwi', 'common.save': 'Sunga', 'curriculum.guideRequired': 'Guide translated' });
});

test('drafting, clearing and deleting a translation cannot resurrect old published text', async () => {
  reset();
  await request('POST', { action: 'bulkSave', locale: 'bem', values: { 'common.save': 'Sunga' }, status: 'published' });
  await request('POST', { action: 'unpublish', locale: 'bem', key: 'common.save' });
  records.get('translations/bem').values['common.save'] = 'stale legacy text';
  assert.deepEqual((await request('GET', {}, { locale: 'bem' })).payload.translations, {});
  await request('POST', { action: 'publish', locale: 'bem', key: 'common.save', value: 'New' });
  await request('POST', { action: 'delete', locale: 'bem', key: 'common.save' });
  assert.deepEqual((await request('GET', {}, { locale: 'bem' })).payload.translations, {});
});

test('only Super Admin may modify canonical translations, preserving provenance', async () => {
  reset();
  await request('POST', { action: 'bulkSave', locale: 'bem', values: { 'common.save': 'Original' } });
  ctx.auth.uid = 'translator'; ctx.isSuperAdmin = false;
  assert.equal((await request('POST', { action: 'bulkSave', locale: 'bem', values: { 'common.save': 'Changed' } })).code, 403);
  ctx.auth.uid = 'other';
  assert.equal((await request('POST', { action: 'bulkSave', locale: 'bem', values: { 'common.save': 'Changed' } })).code, 403);
  assert.equal(records.get('translations/bem').values['common.save'], 'Original');
  ctx.isSuperAdmin = true;
  assert.equal((await request('POST', { action: 'bulkSave', locale: 'bem', values: { 'common.save': 'Reviewed' } })).code, 200);
  assert.equal(records.get('translations/bem').ownerUid, 'translator');
});

test('English destinations, invalid keys and excessive writes are rejected atomically', async () => {
  reset();
  for (const locale of ['en', 'ENG', 'en-US', 'eng-GB']) {
    assert.equal((await request('POST', { action: 'bulkSave', locale, values: { 'common.save': 'Save' } })).code, 400);
  }
  assert.equal(records.has('translations/eng'), false);
  assert.equal((await request('POST', { action: 'bulkSave', locale: 'bem', values: { 'common.save': 'Valid', 'bad/path': 'Invalid' } })).code, 400);
  assert.equal(records.has('translations/bem'), false);
  const values = Object.fromEntries(Array.from({length:351}, (_, i) => ['key_' + i, 'value']));
  assert.equal((await request('POST', { action: 'bulkSave', locale: 'bem', values })).code, 400);
  assert.equal(records.has('translations/bem'), false);
});

test('organization translations never alter canonical text or another organization', async()=>{
  reset();
  ctx.isSuperAdmin=false;ctx.organizationId='org-a';ctx.tenantType='organization';
  const orgLanguage='organizations/org-a/languages/bem';
  records.set(orgLanguage,{code:'bem',enabled:true,organizationId:'org-a',ownerUid:'translator'});
  const save=await request('POST',{action:'tenantbulksave',locale:'bem',values:{'common.save':'Sunga (Org A)'}});
  assert.equal(save.code,200,JSON.stringify(save.payload));
  assert.equal(records.has('translations/bem'),false);
  assert.equal(records.has('locales/bem/translations/common.save'),false);
  assert.deepEqual((await request('GET',{}, {locale:'bem'})).payload.translations,{});
  const owned=await request('GET',{}, {locale:'bem'},{authorization:'Bearer mock'});
  assert.equal(owned.payload.translations['common.save'],'Sunga (Org A)');
  ctx.organizationId='org-b';ctx.auth.uid='other';
  assert.deepEqual((await request('GET',{}, {locale:'bem'},{authorization:'Bearer mock'})).payload.translations,{});
  const foreignList=await request('POST',{action:'tenantlist',locale:'bem'});
  assert.deepEqual(foreignList.payload.items,[]);
  ctx.organizationId='org-a';ctx.auth.uid='other';
  assert.equal((await request('POST',{action:'tenantsave',locale:'bem',key:'common.save',value:'Takeover'})).code,403);
  assert.equal(records.get('organizations/org-a/locales/bem/translations/common.save').value,'Sunga (Org A)');
  ctx.auth.uid='translator';
  assert.equal((await request('POST',{action:'tenantdelete',locale:'bem',key:'common.save'})).code,200);
  assert.equal(records.has('organizations/org-a/locales/bem/translations/common.save'),false);
});

test('tenant locale registry is visible only after authenticated tenant selection',async()=>{
  reset();
  ctx.isSuperAdmin=false;ctx.organizationId='org-a';ctx.tenantType='organization';
  records.set('organizations/org-a/languages/gzz',{code:'gzz',enabled:true,name:'Local language',ownerUid:'translator'});
  const publicList=await request('GET');
  assert.equal(publicList.payload.items.some(item=>item.code==='gzz'),false);
  const privateList=await request('GET',{}, {},{authorization:'Bearer mock'});
  assert.equal(privateList.payload.items.some(item=>item.code==='gzz'),true);
  ctx.organizationId='org-b';
  const other=await request('GET',{}, {},{authorization:'Bearer mock'});
  assert.equal(other.payload.items.some(item=>item.code==='gzz'),false);
});

test('legacy fallback labels use selected locale, exact keys win and missing labels keep original text', async () => {
  const original = { fetch: globalThis.fetch, document: globalThis.document, localStorage: globalThis.localStorage, window: globalThis.window };
  const storage = new Map([['vop_ui_locale', 'bem']]);
  globalThis.window = { addEventListener() {}, dispatchEvent() {} };
  globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value) };
  globalThis.document = { documentElement: {} };
  globalThis.fetch = async url => ({ ok: true, json: async () => url === '/api/localization'
    ? { items: [{code:'bem'}, {code:'eng',aliases:['en']}] }
    : { translations: String(url).endsWith('bem') ? { 'common.save': 'Sunga', app_title: 'Ishiwi', 'common.all': 'Yonse', 'admin.translations_title': 'admin.detected_translation_entries' } : {} } });
  try {
    const i18n = await server.ssrLoadModule('/src/services/i18n.ts');
    const study = await server.ssrLoadModule('/src/services/storage.ts');
    study.setActiveLanguage('eng');
    await i18n.loadUiLocale('bem');
    assert.equal(i18n.getTranslation('common.save', 'Save'), 'Sunga');
    assert.equal(i18n.getTranslation('common.all', 'All'), 'Yonse');
    assert.equal(i18n.getTranslation('common.app_title', 'App title'), 'Ishiwi');
    assert.equal(i18n.getTranslation('common.missing', 'Original text'), 'Original text');
    for (const [key, label] of [['admin.translations_title', 'Translations'], ['admin.select_language', 'Select language'], ['admin.view_schedule', 'View Schedule'], ['admin.detected_translation_entries', 'Detected Translation Entries']]) {
      assert.equal(i18n.getTranslation(key, label), label);
      assert.ok(!i18n.translationSourceLabel(key, key).includes('admin.'));
    }
    assert.equal(study.getActiveLanguage(), 'eng');
    assert.equal(document.documentElement.lang, 'bem');
    const { Header } = await server.ssrLoadModule('/src/components/layout/Header.tsx');
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const markup = renderToStaticMarkup(createElement(Header, {
      currentUser: { displayName:'Test', role:'student' }, settings: { customTranslations:{} },
      activeLanguage:'bem', onChangeLanguage() {}, onToggleDarkMode() {}, onToggleMobileShell() {}, onOpenMenu() {},
    }));
    assert.match(markup, /Ishiwi/);
    assert.equal(study.getActiveLanguage(), 'eng');
  } finally { Object.assign(globalThis, original); }
});


test('Curriculum Studio accepts uppercase guide codes and supports separate modules per language', async () => {
  reset();
  ctx.isSuperAdmin = true;
  const { default: content } = await server.ssrLoadModule('/api_handlers/admin/content.ts');
  const save = async (language, title = 'Discover', id = '') => {
    const res = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
    await content({ method: 'POST', body: { action: 'upsertGuide', collection: 'guides', data: { language, title, id } } }, res);
    return res;
  };
  const created = await save(' BEM ');
  assert.equal(created.code, 200, JSON.stringify(created.payload));
  assert.equal(created.payload.item.language, 'bem');
  const firstId = created.payload.item.id;
  assert.match(firstId, /^guide-[A-Za-z0-9_-]{1,120}$/);
  const second = await save('bem', 'Another module');
  assert.equal(second.code, 200, JSON.stringify(second.payload));
  assert.notEqual(second.payload.item.id, firstId);
  assert.equal([...records.keys()].filter(key => key.startsWith('guides/')).length, 2);
  const edited = await save('bem', 'Updated', firstId);
  assert.equal(edited.code, 200, JSON.stringify(edited.payload));
  assert.equal(records.get('guides/'+firstId).title, 'Updated');
  assert.equal(records.get('guides/'+second.payload.item.id).title, 'Another module');
  const archived = { code: 200, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
  await content({ method: 'POST', body: { action: 'archiveGuide', collection: 'guides', data: { id:firstId, language:'BEM' } } }, archived);
  assert.equal(archived.code, 200, JSON.stringify(archived.payload));
  assert.equal(records.get('guides/'+firstId).archived, true);
  assert.equal(records.get('guides/'+second.payload.item.id).archived, false);
  assert.notEqual((await save('bad/path')).code, 200);
  assert.notEqual((await save('')).code, 200);
});
