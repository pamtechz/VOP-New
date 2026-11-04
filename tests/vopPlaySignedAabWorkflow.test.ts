import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
const release=read('.github/workflows/vop-play-signed-aab.yml');
const pubspec=read('native_android/pubspec.yaml');
const gradle=read('native_android/android/app/build.gradle.kts');

test('Play signing is manual, main-only and never publishes or exposes signing to PR code',()=>{
  assert.match(release,/^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(release,/^  (?:pull_request|pull_request_target|push|workflow_run):/m);
  assert.match(release,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(release,/runs-on: \[self-hosted, Windows\]/);
  assert.match(release,/name: Verify KASAINSTITUTE runner identity/);
  assert.match(release,/VOP_ACTUAL_RUNNER: \$\{\{ runner\.name \}\}/);
  assert.match(release,/persist-credentials: false/);
  assert.match(release,/permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(release,/play_(?:commit|publish)_release|google-play-publish|androidpublisher\.edits\.commit/);
  assert.match(release,/Remove-Item -LiteralPath \$path -Force/);
});

test('a real release AAB needs a Play-approved upload certificate and no private key in Git',()=>{
  for(const key of ['VOP_RELEASE_KEYSTORE_BASE64','VOP_RELEASE_KEY_ALIAS',
    'VOP_RELEASE_STORE_PASSWORD','VOP_RELEASE_KEY_PASSWORD',
    'VOP_RELEASE_UPLOAD_CERT_SHA256']){
    assert.ok(release.includes('secrets.'+key),key+' must be configured as a secret');
  }
  assert.match(release,/Get-FileHash \$certificate -Algorithm SHA256/);
  assert.match(release,/if \(\$actual -ne \$expected\)/);
  assert.match(release,/git restore --source=HEAD -- native_android\/android\/app\/build\.gradle\.kts/);
  assert.match(gradle,/requestedRelease && !releaseKeyPropertiesFile\.isFile/);
  assert.match(gradle,/getByName\("release"\)/);
  assert.match(gradle,/isMinifyEnabled = true/);
  assert.match(gradle,/isShrinkResources = true/);
  assert.match(release,/flutter build appbundle --release/);
  assert.match(release,/--obfuscate --split-debug-info=\$symbols --tree-shake-icons/);
  assert.match(release,/VOP_RELEASE_SYMBOLS_DIR/);
  assert.match(release,/Get-ChildItem -Path \$symbols -File/);
  assert.match(release,/\$limitBytes = 8 \* 1000 \* 1000/);
  assert.match(release,/if \(\$bytes -gt \$limitBytes\)/);
  assert.doesNotMatch(release,/path:.*(?:\.symbols|vop-obfuscation)/);
  assert.match(release,/jarsigner -verify \$aab/);
  assert.match(release,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(release,/flutter build apk --debug/);
});

test('next VOP Play versionCode is newer than every verified existing track',()=>{
  const match=pubspec.match(/^version: ([\w.]+)\+(\d+)$/m);
  assert.ok(match,'Flutter pubspec must declare release name and version code');
  assert.ok(Number(match![2])>2,'new versionCode must exceed existing production 1 and beta 2');
  assert.equal(match![1], '2.2.0', 'release must use the requested 2.2 version');
});

test('both release formats are verified and retain separate private crash maps',()=>{
  assert.match(release,/flutter build apk --release --no-pub --obfuscate/);
  assert.match(release,/apksigner verify --verbose --print-certs \$apk/);
  assert.match(release,/if \(\$actual -ne \$expected\) \{ throw 'APK signer differs/);
  assert.match(release,/\$signers\.Count -ne 1/);
  assert.match(release,/\$aapt dump badging \$apk/);
  assert.match(release,/APK package or version differs/);
  assert.match(release,/targetSdkVersion:'36'/);
  for (const kind of ['aab','apk']) {
    assert.ok(release.includes("build/app/outputs/vop-obfuscation/"+kind));
    assert.ok(release.includes("$env:GITHUB_SHA) '"+kind+"'"));
  }
  assert.equal((release.match(/R8 mapping file was not generated/g)??[]).length, 2);
  assert.match(release,/name: vop-signed-release-apk/);
  assert.match(release,/native_android\/build\/app\/outputs\/SHA256SUMS\.txt/);
  assert.match(release,/Get-FileHash -LiteralPath \$path -Algorithm SHA256/);
});
