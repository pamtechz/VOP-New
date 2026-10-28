import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(path,'utf8');
test('Legacy and Classic share one Vercel project without altering existing API routes',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.buildCommand,'npm run build && bash scripts/build-unified-web.sh');
  assert.equal(config.outputDirectory,'dist');
  assert.ok(config.redirects.some((r:{source:string;destination:string})=>
    r.source==='/classic'&&r.destination==='/classic/'));
  assert.ok(config.rewrites.some((r:{source:string;destination:string})=>
    r.source==='/classic/'&&r.destination==='/classic/index.html'));
  const catchall=config.rewrites.find((r:{source:string;destination:string})=>
    r.source.startsWith('/((?!api')&&r.destination==='/index.html');
  assert.ok(catchall,'The legacy SPA catch-all must remain configured');
  const classic=config.rewrites.find((r:{source:string;destination:string})=>
    r.source.startsWith('/classic/((')&&r.destination==='/classic/index.html');
  assert.ok(classic);
  const legacyEditor=config.rewrites.find((r:{source:string;destination:string})=>
    r.source==='/classic/editor'&&r.destination==='/index.html');
  assert.ok(legacyEditor,'Classic lesson editing must open the existing Legacy editor');
  assert.ok(config.rewrites.indexOf(legacyEditor)<config.rewrites.indexOf(classic),
    'The explicit Legacy editor bridge must precede the Classic SPA fallback');
  assert.ok(config.rewrites.indexOf(classic)<config.rewrites.indexOf(catchall),
    'Classic routing must precede the legacy catch-all');
  for(const target of ['/api/admin?__vopRoute=public-catalog','/api/admin?__vopRoute=mobile']){
    assert.ok(config.rewrites.some((r:{destination:string})=>r.destination===target));
  }
});
test('Vercel build includes Flutter under /classic and keeps locked dependencies and pinned SDK',()=>{
  const builder=read('scripts/build-unified-web.sh');
  const flutter=read('native_android/tool/vercel-build-web.sh');
  assert.match(builder,/VOP_FLUTTER_WEB_BASE_HREF=\/classic\//);
  assert.match(builder,/cp -R native_android\/build\/web\/\. dist\/classic\//);
  assert.match(builder,/grep -q '<base href="\/classic\/"\>'/);
  assert.match(flutter,/--base-href "\$\{VOP_FLUTTER_WEB_BASE_HREF:-\/\}"/);
  assert.match(flutter,/flutter pub get --enforce-lockfile/);
  assert.match(flutter,/flutter_sha=/);
});
test('web experience switch is confined to landing pages and account settings',()=>{
  const legacy=read('src/components/layout/ExperienceSwitcher.tsx');
  const main=read('src/main.tsx');
  const landing=read('src/pages/PublicHome.tsx');
  const settings=read('src/pages/PersonalSettingsPage.tsx');
  const classicLanding=read('native_android/lib/screens/public_entry_screen.dart');
  const classicSettings=read('native_android/lib/screens/account_settings_screen.dart');
  const classicWeb=read('native_android/web/index.html');
  const classicMain=read('native_android/lib/main.dart');
  assert.match(legacy,/href="\/classic\/"/);
  assert.doesNotMatch(main,/<ExperienceSwitcher \/>/);
  assert.match(landing,/<ExperienceSwitcher \/>/);
  assert.match(settings,/<ExperienceSwitcher inline \/>/);
  assert.doesNotMatch(classicWeb,/id="vop-experience-switch"/);
  assert.match(classicLanding,/kIsWeb/);
  assert.match(classicLanding,/launchUrl\(Uri\.base\.resolve\('\/'\)/);
  assert.match(classicSettings,/kIsWeb/);
  assert.match(classicSettings,/launchUrl\(Uri\.base\.resolve\('\/'\)/);
  assert.doesNotMatch(classicMain,/legacyNavigation|Text\('Legacy'\)/);
  const config=read('native_android/lib/core/config.dart');
  assert.match(config,/if \(isWeb && page\.path\.startsWith\('\/classic\/'\)\) return page\.origin/);
  assert.match(config,/isWeb: kIsWeb/);
  assert.match(config,/page: Uri\.base/);
  assert.match(config,/String\.fromEnvironment\('VOP_API_BASE_URL'\)/);
});
test('the old app service worker never returns the Legacy shell for Flutter Classic routes',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/url\.pathname\.startsWith\('\/classic\/'\)/);
});
