$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "native_android\run_vop.ps1"
$stubDir = Join-Path ([IO.Path]::GetTempPath()) ("vop-stub-flutter-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stubDir -Force | Out-Null

$stub = @'
@echo off
if "%~1"=="devices" (
    echo Found 0 connected devices:
    exit /b 0
)
if "%~1"=="emulators" (
    if "%~2"=="--launch" (
        echo The Android emulator exited with code 1
        exit /b 1
    )
)
exit /b 0
'@
Set-Content -LiteralPath (Join-Path $stubDir "flutter.cmd") -Value $stub -Encoding ascii

$originalPath = $env:PATH
try {
    $env:PATH = "$stubDir;$originalPath"
    $start = Get-Date
    $currentPowerShell = (Get-Process -Id $PID).Path
    if (!$currentPowerShell) { throw "Cannot resolve the current PowerShell executable for the launcher test." }
    # A nonzero child exit and its stderr are the test subject; Windows
    # PowerShell 5.1 must not convert them into a terminating NativeCommandError.
    $stdoutPath = Join-Path $stubDir 'launcher.stdout'
    $stderrPath = Join-Path $stubDir 'launcher.stderr'
    $child = Start-Process -FilePath $currentPowerShell -ArgumentList @(
        '-NoProfile', '-NonInteractive', '-File', ('"' + $launcher + '"'),
        '-Mode', 'Emulator', '-EmulatorId', 'Pixel10'
    ) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    $output = (Get-Content -LiteralPath $stdoutPath -Raw) + (Get-Content -LiteralPath $stderrPath -Raw)
    $code = $child.ExitCode
    $elapsed = ((Get-Date) - $start).TotalSeconds
    if ($code -eq 0) { throw "Launcher incorrectly reported success after Flutter emulator returned code 1." }
    if ($output -notmatch 'failed to start \(exit code 1\)') {
        throw "The launcher did not surface the early exit code. Output: $output"
    }
    if ($output -notmatch 'not Firebase') {
        throw "The launcher did not distinguish Android AVD startup failure from Firebase."
    }
    if ($elapsed -gt 25) {
        throw "The launcher waited $elapsed seconds after fatal startup failure; expected immediate abort."
    }
    Write-Host "Emulator nonzero-exit handling passed in $([math]::Round($elapsed,1)) seconds."
} finally {
    $env:PATH = $originalPath
    Remove-Item -LiteralPath $stubDir -Recurse -Force -ErrorAction SilentlyContinue
}
# The child process intentionally exits 1; make the test's own status success.
$global:LASTEXITCODE = 0
