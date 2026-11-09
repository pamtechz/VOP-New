import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const website=readFileSync('.github/workflows/vop-website-release-apk.yml','utf8');
const play=readFileSync('.github/workflows/vop-play-signed-aab.yml','utf8');
test('website APK signing is manual, main-only, pinned and independent of Play approval',()=>{
  assert.match(website,/if: github\.ref == 'refs\/heads\/main'/);
  assert.match(website,/^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(website,/^  (?:push|pull_request|pull_request_target|workflow_run):/m);
  assert.match(website,/VOP_WEBSITE_CERT_SHA256: [A-F0-9]{64}/);
  assert.doesNotMatch(website,/VOP_RELEASE_UPLOAD_CERT_SHA256|flutter build appbundle|play_commit|androidpublisher/);
  assert.match(play,/secrets.VOP_RELEASE_UPLOAD_CERT_SHA256/);
  assert.match(website,/apksigner verify --verbose --print-certs \$apk/);
  assert.match(website,/if \(\$actual -ne \$expected\)/);
  assert.match(website,/Get-FileHash \$certificate -Algorithm SHA256/);
  assert.match(website,/--split-per-abi/);
  assert.match(website,/--android-project-arg=vopCompressNativeLibraries=true/);
  assert.match(play,/--android-project-arg=vopCompressNativeLibraries=true/);
  assert.match(website,/apk_size_report\.py build\/app\/outputs\/flutter-apk --require-compressed-native/);
});
test('final-APK compression gate accepts DEFLATE and rejects stored native libraries',()=>{
  const result=spawnSync('python',['tests/apk_size_report_test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr || result.stdout);
});
test('website rejects oversized downloads but retains size evidence and private crash maps',()=>{
  assert.match(website,/withinBudget=\(\$apkBytes -le 8000000\)/);
  assert.match(website,/if \(@\(\$sizeResults \| Where-Object/);
  assert.match(website,/name: Upload size diagnostics even when the budget fails\s+if: always\(\)/);
  assert.match(website,/name: Delete temporary release keystore[\s\S]+if: always\(\)/);
  assert.match(website,/VOP_RELEASE_SYMBOLS_DIR/);
  assert.doesNotMatch(website,/continue-on-error:/);
  assert.doesNotMatch(website,/path:.*(?:key\.properties|\.jks|\.symbols)/);
});
