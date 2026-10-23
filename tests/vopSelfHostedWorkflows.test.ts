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

test('Windows npm installations are bounded and serialized across KASAINSTITUTE runner services',()=>{
  for(const path of ['.github/workflows/vop-validate.yml','.github/workflows/vop-verify.yml','.github/workflows/vop-firestore-rules.yml']){
    const source=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
    assert.match(source,/timeout-minutes: 30\n\s+working-directory:|timeout-minutes: 30\n\s+shell: powershell/,
      path+' must bound the dependency install step');
    assert.match(source,/System\.Threading\.Mutex/,path+' must synchronize npm installs between runners');
    assert.match(source,/Global\\VOP-NPM-CI-WINDOWS/,
      path+' must use the same cross-process named mutex');
    assert.match(source,/\.WaitOne\(/,path+' must bound lock acquisition');
    assert.match(source,/\.ReleaseMutex\(\)/,path+' must release the installation lock');
    assert.match(source,/npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --loglevel=warn --maxsockets=8/,
      path+' must use the reviewed lockfile with reduced Windows disk contention');
    assert.match(source,/required build package is missing after the script-free install/,
      path+' must fail closed when dependency lifecycle scripts are skipped');
    assert.match(source,/\$LASTEXITCODE -ne 0/,path+' must reject a failed installation');
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

test('shared Firestore/Auth emulator integration files run sequentially to isolate platform settings',()=>{
  const source=readFileSync('.github/workflows/vop-validate.yml','utf8');
  assert.match(source,/node --test --test-concurrency=1 tests\/engagementApi\.integration\.mjs/,
    'parallel integration test files can mutate shared system settings and overload the emulator');
  assert.match(source,/firebase emulators:exec --project demo-vop-security-rules/,
    'integration tests must stay isolated from the production Firebase project');
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
  assert.equal(source.split("      - '.github/scripts/setup-vop-flutter.ps1'").length-1,2,
    'both PR and push Flutter workflows must run when the Windows SDK bootstrap changes');
  assert.equal(source.split("      - 'tests/native*.test.ps1'").length-1,2,
    'Windows launcher test changes must trigger Flutter CI');
  assert.match(source,/flutter build apk --debug/);
  assert.match(source,/flutter build web --release/);
  assert.equal(source.split('flutter pub get --enforce-lockfile').length-1,2,
    'both Flutter builds must resolve the reviewed application lockfile');
  assert.match(source,/python native_android\/tool\/prepare_scaffold\.py --platform android/);
  assert.match(source,/python native_android\/tool\/prepare_scaffold\.py --platform web/);
  assert.match(source,/python tests\/flutter_scaffold_test\.py/);
  assert.match(source,/--base-href \/classic\//);
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

test('single-run feature PR policy avoids duplicate push builds on KASAINSTITUTE',()=>{
  for(const path of [
    '.github/workflows/vop-native-android.yml',
    '.github/workflows/vop-validate.yml',
    '.github/workflows/vop-verify.yml',
    '.github/workflows/vop-firestore-rules.yml',
  ]){
    const workflow=readFileSync(path,'utf8');
    const pushSection=workflow.split(/^  push:\s*$/m)[1]?.split(/^  [a-z_]+:\s*$/m)[0] ?? '';
    assert.match(pushSection,/\bmain\b/,path+' must validate main on push');
    assert.doesNotMatch(pushSection,/feat\/\*\*|fix\/\*\*/,path+' must not duplicate PR jobs through feature branch pushes');
    assert.match(workflow,/pull_request_target:/,path+' must still validate trusted pull requests');
    assert.match(workflow,/cancel-in-progress: true/,path+' must keep obsolete commit cancellation');
  }
});
