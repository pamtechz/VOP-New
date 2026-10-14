$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\vercel_cli.ps1")

# Reproduce Vercel 63 writing its version to stderr on successful exit.
# Verify that Vercel's Node entrypoint gets the exact unexpanded --cwd path.
$stubDir = Join-Path ([IO.Path]::GetTempPath()) ("vop-vercel-cli-test-" + [Guid]::NewGuid().ToString("N"))
$nodeDir = Join-Path $stubDir "node_modules\vercel\dist"
$projectRoot = Join-Path $stubDir "project with %VOP_DO_NOT_EXPAND%\VOP-New"
New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
New-Item -ItemType Directory -Path $projectRoot -Force | Out-Null
$shim = @'
@echo off
>&2 echo Invalid call to vercel.cmd shim
exit /b 42
'@
Set-Content -LiteralPath (Join-Path $stubDir "vercel.cmd") -Value $shim -Encoding ascii
$js = @'
const fs = require('node:fs');
const args = process.argv.slice(2);
process.stderr.write('Vercel CLI 63.1.2 (Node.js 22.16.0)\n');
if (args[0] !== '--cwd' || args[1] !== process.env.VOP_TEST_PROJECT_ROOT ||
    args[2] !== 'env' || args[3] !== 'pull') {
  process.stderr.write('Wrong current project or argv\n');
  process.exit(9);
}
if (process.env.VOP_TEST_FAIL === '1') process.exit(7);
const file = args[4];
fs.writeFileSync(file, [
  'VITE_FIREBASE_API_KEY=public-test-key',
  'VITE_FIREBASE_APP_ID=1:12345:web:abcde',
  'VITE_FIREBASE_PROJECT_ID=test-project',
  'VITE_FIREBASE_AUTH_DOMAIN=test-project.firebaseapp.com'
].join('\n'));
'@
Set-Content -LiteralPath (Join-Path $nodeDir "vc.js") -Value $js -Encoding utf8
$originalPath = $env:PATH
$priorRoot = $env:VOP_TEST_PROJECT_ROOT
$priorFailure = $env:VOP_TEST_FAIL
$destination = Join-Path $projectRoot "environment with %VOP_DO_NOT_EXPAND% and spaces.env"
try {
    $env:PATH = "$stubDir;$originalPath"
    $env:VOP_TEST_PROJECT_ROOT = $projectRoot
    Remove-Item Env:\VOP_TEST_FAIL -ErrorAction SilentlyContinue

    Invoke-VopVercelEnvironmentPull -ProjectRoot $projectRoot -Destination $destination -Environment production
    if (!(Test-Path -LiteralPath $destination)) {
        throw "Vercel env pull did not write the expected destination file."
    }
    if (@(Get-Content -LiteralPath $destination) -notcontains "VITE_FIREBASE_PROJECT_ID=test-project") {
        throw "Public Firebase environment configuration was not returned."
    }
    Write-Host "Vercel CLI stderr banner, literal percent paths and explicit --cwd all passed."

    Remove-Item -LiteralPath $destination -Force
    $env:VOP_TEST_FAIL = "1"
    $failed = $false
    try {
        Invoke-VopVercelEnvironmentPull -ProjectRoot $projectRoot -Destination $destination -Environment production
    } catch {
        $failed = $_.Exception.Message -match "exit code 7"
    }
    if (!$failed) { throw "A real Vercel process failure was not surfaced." }
    if (Test-Path -LiteralPath $destination) {
        throw "Failed env pull unexpectedly wrote a configuration file."
    }
    Write-Host "Vercel exit code 7 is still reported correctly and configuration is not fabricated."
} finally {
    $env:PATH = $originalPath
    if ($null -ne $priorRoot) { $env:VOP_TEST_PROJECT_ROOT = $priorRoot }
    else { Remove-Item Env:\VOP_TEST_PROJECT_ROOT -ErrorAction SilentlyContinue }
    if ($null -ne $priorFailure) { $env:VOP_TEST_FAIL = $priorFailure }
    else { Remove-Item Env:\VOP_TEST_FAIL -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $stubDir -Recurse -Force -ErrorAction SilentlyContinue
    $global:LASTEXITCODE = 0
}
