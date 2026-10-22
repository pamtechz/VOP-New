import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read=(path:string)=>readFileSync(path,'utf8');
test('Legacy and Classic share one Vercel project without altering existing API routes',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.buildCommand,'npm run build && bash scripts/build-unified-web.sh');
  assert.equal(config.outputDirectory,'dist');
  assert.ok(config.redirects.some((r:{source:string;destination:string})=>
    r.source==='/classic'&&r.destination==='/classic/'));
  assert.ok(config.rewrites.some((r:{source:string;destination:string})=>
    r.source==='/classic/'&&r.destination==='/classic/index.html'));
  const catchall=config.rewrites.find((r:{destination:string})=>r.destination==='/index.html');
  assert.ok(catchall);
  const classic=config.rewrites.find((r:{source:string;destination:string})=>
    r.source.startsWith('/classic/((')&&r.destination==='/classic/index.html');
  assert.ok(classic);
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
test('the two UIs offer a shared-origin mode switch without external redirects',()=>{
  const legacy=read('src/components/layout/ExperienceSwitcher.tsx');
  const main=read('src/main.tsx');
  const classic=read('native_android/lib/main.dart');
  const classicWeb=read('native_android/web/index.html');
  assert.match(legacy,/href="\/classic\/"/);
  assert.match(main,/<ExperienceSwitcher \/>/);
  assert.match(classicWeb,/<a href="\/" aria-label="Switch to Legacy web">Legacy<\/a>/);
  assert.match(classicWeb,/<nav id="vop-experience-switch" aria-label="Choose VOP experience" hidden>/);
  assert.doesNotMatch(classic,/legacyNavigation|Text\('Legacy'\)/,
    'Do not mount the web switch above Navigator: view focus can arrive before layout');
  const config=read('native_android/lib/core/config.dart');
  assert.match(config,/if \(isWeb && page\.path\.startsWith\('\/classic\/'\)\) return page\.origin/);
  assert.match(config,/isWeb: kIsWeb/);
  assert.match(config,/page: Uri\.base/);
  assert.match(config,/String\.fromEnvironment\('VOP_API_BASE_URL'\)/);
});
test('Classic shell switch appears on nested Classic routes and stays hidden on standalone paths',()=>{
  const shell=read('native_android/web/index.html');
  const script=/<script id="vop-experience-init">([\s\S]*?)<\/script>/.exec(shell)?.[1];
  assert.ok(script);
  for(const [pathname,visible] of [
    ['/classic/',true],['/classic/programmes',true],
    ['/classic/guide/one',true],['/',false],['/classic-other/',false],
  ] as const){
    const control={hidden:true};
    vm.runInNewContext(script,{
      document:{getElementById:(id:string)=>{
        assert.equal(id,'vop-experience-switch');
        return control;
      }},
      window:{location:{pathname}},
    });
    assert.equal(control.hidden,!visible,pathname);
  }
});
test('the old app service worker never returns the Legacy shell for Flutter Classic routes',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/url\.pathname\.startsWith\('\/classic\/'\)/);
});
