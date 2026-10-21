import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// Automatically include every workflow so new Actions cannot bypass self-hosted checks.
const workflows = readdirSync('.github/workflows',{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/\.ya?ml$/.test(entry.name))
  .map(entry=>'.github/workflows/'+entry.name)
  .sort();

test('every VOP GitHub job uses the KASAINSTITUTE self-hosted runner, never GitHub-hosted machines',()=>{
  for(const path of workflows){
    const contents = readFileSync(path,'utf8');
    const runners = [...contents.matchAll(/^[ \t]+runs-on:\s*(.+)$/gm)].map(x=>x[1].trim());
    assert.ok(runners.length>0, path+' must declare a runner');
    assert.equal((contents.match(/^    runs-on:/gm)||[]).length,runners.length,path+' has unexpected runner declarations');
    const guards=[...contents.matchAll(/^      - name: Verify KASAINSTITUTE runner identity$/gm)].length;
    assert.equal(guards,runners.length,path+' must check identity in every job');
    assert.match(contents,/VOP_ACTUAL_RUNNER: \$\{\{ runner\.name \}\}/,path+' must read registered runner name');
    assert.doesNotMatch(contents,/shell: pwsh/,path+' must not depend on uninstalled PowerShell 7');
    for(const job of contents.split(/^    runs-on: \[self-hosted, Windows\]$/m).slice(1)){
      assert.equal(job.match(/^      - (?:name|uses): .+$/m)?.[0],
        '      - name: Verify KASAINSTITUTE runner identity',
        path+' must check identity before downloading untrusted code');
    }
    for(const runner of runners){
      assert.equal(runner,'[self-hosted, Windows]',path+' must target only self-hosted Windows, with KASAINSTITUTE identity guard');
      assert.doesNotMatch(runner,/KASAINSTITUTE/,path+' must not confuse the runner name with a custom label');
      assert.match(runner,/Windows/,path+' must use the trusted Windows runner platform');
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
    const jobs=(source.match(/^    runs-on: \[self-hosted, Windows\]$/gm)||[]).length;
    const guard=(source.match(/^      - name: Reject untrusted fork PR before checking out code$/gm)||[]).length;
    const failure=(source.match(/throw "Fork pull requests cannot execute code on the VOP KASAINSTITUTE self-hosted runner/g)||[]).length;
    assert.match(source,/pull_request_target:/);
    assert.doesNotMatch(source,/^  pull_request:/m);
    assert.match(source,/ref: \$\{\{ github\.event_name == 'pull_request_target'/);
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

test('dependency installation has bounded time on the dedicated Windows runner',()=>{
  for (const path of ['.github/workflows/vop-validate.yml','.github/workflows/vop-verify.yml','.github/workflows/vop-firestore-rules.yml']) {
    const source=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
    const matches=[...source.matchAll(/timeout-minutes: (\d+)\n(?:[ \t]+[^\n]*\n){0,2}[ \t]+run: npm ci --no-audit --no-fund --prefer-offline --loglevel=info/g)];
    assert.equal(matches.length,1,path+' must bound a lockfile install and retain npm audit separately');
    assert.ok(Number(matches[0][1])>=5&&Number(matches[0][1])<=15,path+' must fail promptly if package installation hangs');
  }
});

test('long-running Windows pipelines cancel superseded commits on the same branch',()=>{
  for(const path of [
    '.github/workflows/vop-validate.yml',
    '.github/workflows/vop-native-android.yml',
    '.github/workflows/vop-firestore-rules.yml',
  ]){
    const source=readFileSync(path,'utf8');
    assert.match(source,/concurrency:/,path+' must not queue obsolete builds forever');
    assert.match(source,/group: vop-[a-z-]+-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/,
      path+' must isolate branch or pull request concurrency');
    assert.match(source,/cancel-in-progress: true/,path+' must cancel superseded runs');
  }
});

test('native Flutter Android and Web CI invokes Windows-compatible commands',()=>{
  const source=readFileSync('.github/workflows/vop-native-android.yml','utf8');
  assert.match(source,/shell: cmd/);
  assert.match(source,/shell: powershell/);
  assert.doesNotMatch(source,/shell: pwsh/);
  assert.doesNotMatch(source,/subosito\/flutter-action/, 'Flutter CI must not invoke a bash-based installer on native Windows');
  const setupInvocation = String.raw`run: .\.github\scripts\setup-vop-flutter.ps1`;
  assert.equal(source.split(setupInvocation).length-1,2,
    'both Flutter build jobs must use the trusted Windows SDK bootstrap');
  const setup=readFileSync('.github/scripts/setup-vop-flutter.ps1','utf8');
  assert.match(setup,/flutter\.bat/);
  assert.match(setup,/GITHUB_PATH/);
  assert.doesNotMatch(setup,/\/bin\/bash|wsl\.exe/);
  assert.match(source,/flutter build apk --debug/);
  assert.match(source,/flutter build web --release/);
  assert.match(source,/passkeys-bundle\.js/);
  assert.doesNotMatch(source,/shell: bash/);
  assert.doesNotMatch(source,/run: python3 /);
  assert.doesNotMatch(source,/runs-on: ubuntu-latest/);
});

test('fork metadata gate is evaluated from trusted base without downloading PR content',()=>{
  const gate=readFileSync('.github/workflows/vop-fork-pr-gate.yml','utf8');
  assert.match(gate,/pull_request_target:/);
  assert.match(gate,/VOP_HEAD_REPOSITORY: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/);
  assert.match(gate,/VOP_BASE_REPOSITORY: \$\{\{ github\.repository \}\}/);
  assert.match(gate,/if \(\$env:VOP_HEAD_REPOSITORY -ne \$env:VOP_BASE_REPOSITORY\)/);
  assert.match(gate,/throw 'This VOP pull request originates from an untrusted fork/);
  assert.doesNotMatch(gate,/uses:\s*actions\/checkout/);
  assert.doesNotMatch(gate,/\$\{\{[^}]*secrets\./);
});
