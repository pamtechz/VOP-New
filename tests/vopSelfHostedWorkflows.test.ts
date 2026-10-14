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

test('untrusted fork PRs cannot execute arbitrary checkout code on VOP self-hosted runner',()=>{
  for(const path of [
    '.github/workflows/vop-native-android.yml',
    '.github/workflows/vop-firestore-rules.yml',
    '.github/workflows/vop-validate.yml',
    '.github/workflows/vop-verify.yml',
  ]) {
    const contents=readFileSync(path,'utf8');
    const jobs = contents.match(/^[ ]{4}runs-on:/gm) || [];
    const protections = contents.match(/^[ ]{4}if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/gm)||[];
    assert.equal(protections.length,jobs.length,path+' must guard every self-hosted PR job');
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
