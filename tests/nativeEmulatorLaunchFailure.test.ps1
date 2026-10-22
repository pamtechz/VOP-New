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
        > "%VOP_EMULATOR_FAILURE_MARKER%" echo fatal
        echo The Android emulator exited with code 1
        exit /b 1
    )
)
exit /b 0
'@
Set-Content -LiteralPath (Join-Path $stubDir "flutter.cmd") -Value $stub -Encoding ascii

$originalPath = $env:PATH
$originalMarker = $env:VOP_EMULATOR_FAILURE_MARKER
$failureMarker = Join-Path $stubDir 'fatal-start.marker'
$child = $null
try {
    $env:PATH = "$stubDir;$originalPath"
    $env:VOP_EMULATOR_FAILURE_MARKER = $failureMarker
    $currentPowerShell = (Get-Process -Id $PID).Path
    if (!$currentPowerShell) { throw "Cannot resolve the current PowerShell executable for the launcher test." }
    # A nonzero child exit and its stderr are the test subject; Windows
    # PowerShell 5.1 must not convert them into a terminating NativeCommandError.
    $stdoutPath = Join-Path $stubDir 'launcher.stdout'
    $stderrPath = Join-Path $stubDir 'launcher.stderr'
    $child = Start-Process -FilePath $currentPowerShell -ArgumentList @(
        '-NoProfile', '-NonInteractive', '-File', ('"' + $launcher + '"'),
        '-Mode', 'Emulator', '-EmulatorId', 'Pixel10'
    ) -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    # The stub records the precise point of the simulated emulator failure.
    # Exclude slow PowerShell/Flutter startup from the abort-latency assertion.
    $startupDeadline = (Get-Date).AddSeconds(90)
    while (!(Test-Path -LiteralPath $failureMarker) -and !$child.HasExited -and (Get-Date) -lt $startupDeadline) {
        Start-Sleep -Milliseconds 100
        $child.Refresh()
    }
    if (!(Test-Path -LiteralPath $failureMarker)) {
        throw "The simulated Flutter emulator failure was not reached before the launcher exited or startup timed out."
    }
    $failureObservedAt = Get-Date
    while (!$child.HasExited -and ((Get-Date) - $failureObservedAt).TotalSeconds -le 25) {
        Start-Sleep -Milliseconds 100
        $child.Refresh()
    }
    if (!$child.HasExited) {
        throw "The launcher did not exit within 25 seconds of the simulated emulator failure."
    }
    $elapsed = ((Get-Date) - $failureObservedAt).TotalSeconds
    $output = (Get-Content -LiteralPath $stdoutPath -Raw) + (Get-Content -LiteralPath $stderrPath -Raw)
    $code = $child.ExitCode
    if ($code -eq 0) { throw "Launcher incorrectly reported success after Flutter emulator returned code 1." }
    if ($output -notmatch 'failed to start \(exit code 1\)') {
        throw "The launcher did not surface the early exit code. Output: $output"
    }
    if ($output -notmatch 'not Firebase') {
        throw "The launcher did not distinguish Android AVD startup failure from Firebase."
    }
    if ($elapsed -gt 25) {
        throw "The launcher waited $elapsed seconds after the simulated emulator failure; expected immediate abort."
    }
    Write-Host "Emulator nonzero-exit handling passed in $([math]::Round($elapsed,1)) seconds."
} finally {
    if ($child) {
        try {
            $child.Refresh()
            if (!$child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
        } catch { }
    }
    $env:PATH = $originalPath
    $env:VOP_EMULATOR_FAILURE_MARKER = $originalMarker
    Remove-Item -LiteralPath $stubDir -Recurse -Force -ErrorAction SilentlyContinue
}
# The child process intentionally exits 1; make the test's own status success.
$global:LASTEXITCODE = 0
