import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflows = [
  '.github/workflows/apply-vop-review.yml',
  '.github/workflows/prepare-firebase-seeder.yml',
  '.github/workflows/vop-firestore-rules.yml',
  '.github/workflows/vop-native-android.yml',
  '.github/workflows/vop-refresh-lockfile.yml',
  '.github/workflows/vop-seed-editorial.yml',
  '.github/workflows/vop-validate.yml',
  '.github/workflows/vop-verify.yml',
];

test('every VOP GitHub job uses the KASAINSTITUTE self-hosted runner, never GitHub-hosted machines',()=>{
  for(const path of workflows){
    const contents = readFileSync(path,'utf8');
    const runners = [...contents.matchAll(/^[ \t]+runs-on:\s*(.+)$/gm)].map(x=>x[1].trim());
    assert.ok(runners.length>0, path+' must declare a runner');
    for(const runner of runners){
      assert.match(runner,/self-hosted/,path+' contains a hosted Actions job');
      assert.match(runner,/KASAINSTITUTE/,path+' has no explicit trusted runner label');
      assert.doesNotMatch(runner,/(?:ubuntu|windows|macos)-latest/);
    }
  }
});

test('fork PRs must fail on trusted runner before any checkout; they must never succeed through skipped jobs',()=>{
  for(const path of [
    '.github/workflows/vop-native-android.yml',
    '.github/workflows/vop-firestore-rules.yml',
    '.github/workflows/vop-validate.yml',
    '.github/workflows/vop-verify.yml',
  ]) {
    const source=readFileSync(path,'utf8');
    const jobs=(source.match(/^    runs-on: \[self-hosted, Windows, KASAINSTITUTE\]$/gm)||[]).length;
    const guard=(source.match(/^      - name: Reject untrusted fork PR before checking out code$/gm)||[]).length;
    const failure=(source.match(/throw "Fork pull requests cannot execute code on the VOP KASAINSTITUTE self-hosted runner/g)||[]).length;
    assert.equal(guard,jobs,path+' does not reject every untrusted fork job');
    assert.equal(failure,jobs,path+' missing the non-skippable failure');
    assert.doesNotMatch(source,/^    if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository$/m,
      path+' must not mark fork jobs as skipped/success');
    const sections=source.split(/^      - name: Reject untrusted fork PR before checking out code$/m).slice(1);
    for(const section of sections){
      const nextCheckout=section.indexOf('uses: actions/checkout@');
      const nextForkFailure=section.indexOf('throw "Fork pull requests cannot execute code');
      assert.ok(nextCheckout<0|| (nextForkFailure>=0 && nextForkFailure<nextCheckout),
        path+' checks out code before rejecting untrusted fork');
    }
  }
});

test('native Flutter Android and Web CI invokes Windows-compatible commands',()=>{
  const source=readFileSync('.github/workflows/vop-native-android.yml','utf8');
  assert.match(source,/shell: cmd/);
  assert.match(source,/shell: pwsh/);
  assert.match(source,/flutter build apk --debug/);
  assert.match(source,/flutter build web --release/);
  assert.match(source,/passkeys-bundle\.js/);
  assert.doesNotMatch(source,/shell: bash/);
  assert.doesNotMatch(source,/run: python3 /);
  assert.doesNotMatch(source,/runs-on: ubuntu-latest/);
});
