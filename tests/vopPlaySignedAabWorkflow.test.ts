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
  assert.match(release,/flutter build appbundle --release/);
  assert.match(release,/jarsigner -verify \$aab/);
  assert.match(release,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(release,/flutter build apk --debug/);
});

test('next VOP Play versionCode is newer than every verified existing track',()=>{
  const match=pubspec.match(/^version: ([\w.]+)\+(\d+)$/m);
  assert.ok(match,'Flutter pubspec must declare release name and version code');
  assert.ok(Number(match![2])>2,'new versionCode must exceed existing production 1 and beta 2');
});
