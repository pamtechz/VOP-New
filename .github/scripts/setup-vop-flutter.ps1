# The VOP runner is native Windows. Avoid actions that bootstrap Flutter through
# Linux shell scripts; WSL is not installed on KASAINSTITUTE.
$ErrorActionPreference = 'Stop'

$candidates = New-Object 'System.Collections.Generic.List[string]'
$flutterOnPath = Get-Command -Name 'flutter.bat' -CommandType Application -ErrorAction SilentlyContinue
if ($flutterOnPath) { [void]$candidates.Add($flutterOnPath.Source) }

$roots = @(
    $env:VOP_FLUTTER_ROOT,
    $env:FLUTTER_ROOT,
    $env:FLUTTER_HOME,
    'C:\flutter',
    'C:\src\flutter',
    'C:\tools\flutter',
    'D:\flutter',
    'D:\src\flutter',
    (Join-Path $env:USERPROFILE 'flutter'),
    (Join-Path $env:USERPROFILE 'development\flutter')
)
foreach ($root in $roots) {
    if (![string]::IsNullOrWhiteSpace($root)) {
        [void]$candidates.Add([System.IO.Path]::Combine($root, 'bin', 'flutter.bat'))
    }
}

$flutter = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $flutter = (Resolve-Path -LiteralPath $candidate).Path
        break
    }
}
if (!$flutter) {
    throw 'Flutter SDK not found on KASAINSTITUTE. Install the trusted Flutter stable Windows SDK and set VOP_FLUTTER_ROOT to its installation root (not bin), then restart the runner listener. Do not use WSL or install an unreviewed SDK in a pull-request workflow.'
}

$bin = Split-Path -Parent $flutter
$sdkRoot = Split-Path -Parent $bin
# The same immutable revision must build both KASAINSTITUTE and Vercel.
$buildScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\..\native_android\tool\vercel-build-web.sh') -Raw
if ($buildScript -notmatch 'readonly flutter_sha="([a-f0-9]{40})"') {
    throw 'The reviewed Flutter revision is missing from vercel-build-web.sh.'
}
$expectedRevision = $Matches[1]
$actualRevision = & git -C $sdkRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or "$actualRevision".Trim() -ne $expectedRevision) {
    throw "Flutter SDK provenance mismatch. KASAINSTITUTE must use revision $expectedRevision."
}
Write-Host "Verified pinned Flutter revision $expectedRevision"
if ($env:GITHUB_PATH) {
    [System.IO.File]::AppendAllText($env:GITHUB_PATH, "$bin`n", [System.Text.UTF8Encoding]::new($false))
}
$env:PATH = "$bin;$env:PATH"
& $flutter --version
if ($LASTEXITCODE -ne 0) {
    throw "Flutter SDK exists at $flutter but failed its version check (exit $LASTEXITCODE)."
}
Write-Host "Validated native Windows Flutter SDK at $flutter"
