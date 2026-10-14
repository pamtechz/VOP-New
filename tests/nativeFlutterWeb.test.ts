import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(file:string)=>readFileSync(file,'utf8');
const runner=read('native_android/run_web.ps1');
const root=read('run_web.ps1');
const config=read('native_android/lib/core/config.dart');
const api=read('native_android/lib/core/vop_api.dart');
const settings=read('native_android/lib/screens/account_settings_screen.dart');
const auth=read('native_android/lib/screens/auth_screen.dart');
const media=read('native_android/lib/screens/radio_player_screen.dart');

test('VOP Flutter browser launcher defaults to stable web-server and supports inspected Chrome',()=>{
  assert.match(runner,/WebPort = 7357/);
  assert.match(runner,/"run", "-d", "web-server"/);
  assert.match(runner,/"--web-hostname", \$bindAddress/);
  assert.match(runner,/"0\.0\.0\.0"/);
  assert.match(runner,/if \(\$ShareOnNetwork -and \$ChromeInspector\)/);
  assert.match(runner,/"run", "-d", "chrome"/);
  assert.match(runner,/Get-VopWebClientConfiguration/);
  assert.match(root,/native_android\\run_web\.ps1/);
  assert.match(root,/& \$launcher @PSBoundParameters/);
});

test('web Firebase app ID stays distinct from Android app ID and admin credentials',()=>{
  assert.match(config,/VOP_FIREBASE_WEB_APP_ID/);
  assert.match(config,/VOP_FIREBASE_WEB_AUTH_DOMAIN/);
  assert.match(config,/kIsWeb \? webAppId : appId/);
  assert.match(config,/authDomain: kIsWeb \? webAuthDomain : null/);
  const publicOnly=read('native_android/tool/vercel_web_config.ps1');
  assert.match(publicOnly,/VITE_FIREBASE_APP_ID/);
  assert.match(publicOnly,/ConvertFrom-VopWebEnvLines/);
  assert.match(publicOnly,/Remove-Item -LiteralPath \$temporary -Force/);
  assert.doesNotMatch(publicOnly,/FIREBASE_ADMIN_PRIVATE_KEY/);
});

test('browser web compilation avoids native dart io on API and offline cache code paths',()=>{
  assert.match(api,/offline_study_web\.dart' if \(dart\.library\.io\) 'offline_study\.dart'/);
  assert.match(api,/network_error_web\.dart' if \(dart\.library\.io\) 'network_error_io\.dart'/);
  assert.doesNotMatch(api,/import 'dart:io'/);
  assert.match(read('native_android/lib/core/offline_study_web.dart'),/Offline changes cannot be queued securely/);
  assert.match(read('native_android/lib/core/offline_study.dart'),/flutter_secure_storage/);
});

test('browser uses Firebase popup sign-in and provider-approved iframe, not Android WebView',()=>{
  assert.match(auth,/FirebaseAuth\.instance\.signInWithPopup\(provider\)/);
  assert.match(auth,/if \(!kIsWeb\) OutlinedButton\.icon/);
  assert.match(media,/VopWebProviderEmbed/);
  assert.match(media,/dart\.library\.html/);
  assert.match(settings,/if \(!kIsWeb\) _loadNativePasskeys\(\)/);
  assert.match(settings,/if \(kIsWeb\) \{/);
});

test('browser keeps online assessments functional without claiming encrypted offline storage',()=>{
  const browserOffline=read('native_android/lib/core/offline_study_web.dart');
  const home=read('native_android/lib/screens/home_shell.dart');
  const guide=read('native_android/lib/screens/guide_screen.dart');
  assert.match(browserOffline,/Future<void> save\([\s\S]*?\) async \{\}/);
  assert.match(browserOffline,/Offline changes cannot be queued securely/);
  assert.match(home,/if\(!kIsWeb\) _destination\('Offline downloads'/);
  assert.match(settings,/if\(!kIsWeb\) _heading\('Offline study'/);
  assert.match(settings,/if\(!kIsWeb\) _group\(\[/);
  assert.match(guide,/onPressed:kIsWeb\|\|downloading\?null:download/);
});

test('plain-HTTP LAN previews never claim protected API access via localhost CORS',()=>{
  assert.match(runner,/if \(\$ShareOnNetwork\) \{/);
  assert.match(runner,/Phone browsers using LAN HTTP cannot access protected VOP backend APIs/);
  assert.match(runner,/Even a CORS allowlist entry will not enable HTTP LAN access/);
  const cors=read('server/flutterPreviewCors.ts');
  assert.match(cors,/const localhost=uri\.protocol==='http:'/);
  assert.match(cors,/if\(!secure&&!localhost\)return null/);
});
