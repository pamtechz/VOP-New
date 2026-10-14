$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\vercel_cli.ps1")

# Reproduce Vercel CLI 63.1.2: write its version banner to stderr even when
# the command succeeds. The parent uses ErrorActionPreference Stop.
$stubDir = Join-Path ([IO.Path]::GetTempPath()) ("vop-vercel-cli-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stubDir -Force | Out-Null
$stub = @'
@echo off
>&2 echo Vercel CLI 63.1.2 (Node.js 22.16.0)
if not "%~1"=="env" exit /b 3
if not "%~2"=="pull" exit /b 4
(
echo VITE_FIREBASE_API_KEY=public-test-key
echo VITE_FIREBASE_APP_ID=1:12345:web:abcde
echo VITE_FIREBASE_PROJECT_ID=test-project
echo VITE_FIREBASE_AUTH_DOMAIN=test-project.firebaseapp.com
) > "%~3"
exit /b 0
'@
Set-Content -LiteralPath (Join-Path $stubDir "vercel.cmd") -Value $stub -Encoding ascii
$originalPath = $env:PATH
$destination = Join-Path $stubDir "environment with spaces.env"
try {
    $env:PATH = "$stubDir;$originalPath"
    Invoke-VopVercelEnvironmentPull -ProjectRoot $stubDir -Destination $destination -Environment production
    if (!(Test-Path -LiteralPath $destination)) {
        throw "Vercel env pull did not write its expected destination file."
    }
    $lines = @(Get-Content -LiteralPath $destination)
    if ($lines -notcontains "VITE_FIREBASE_PROJECT_ID=test-project") {
        throw "Public Vercel configuration was not retrieved."
    }
    Write-Host "Windows Vercel stderr version banner did not abort the successful env pull."

    # A real exit-code failure must still abort (not be masked by stderr filtering).
    Remove-Item -LiteralPath $destination -Force
    $failedStub = @'
@echo off
>&2 echo Vercel CLI 63.1.2 (Node.js 22.16.0)
exit /b 7
'@
    Set-Content -LiteralPath (Join-Path $stubDir "vercel.cmd") -Value $failedStub -Encoding ascii
    $failed = $false
    try {
        Invoke-VopVercelEnvironmentPull -ProjectRoot $stubDir -Destination $destination -Environment production
    } catch {
        $failed = $_.Exception.Message -match "exit code 7"
    }
    if (!$failed) {
        throw "A nonzero Vercel CLI exit code was not surfaced."
    }
    if (Test-Path -LiteralPath $destination) {
        throw "Failed env pull unexpectedly wrote a configuration file."
    }
    Write-Host "Windows Vercel CLI error code and secret-safe diagnostics validated."
} finally {
    $env:PATH = $originalPath
    Remove-Item -LiteralPath $stubDir -Recurse -Force -ErrorAction SilentlyContinue
    # Expected mock failure must not fail the test process.
    $global:LASTEXITCODE = 0
}
