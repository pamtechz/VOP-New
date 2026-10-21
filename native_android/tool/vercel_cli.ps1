# Run npm-installed Vercel's Node entrypoint directly. This avoids both
# Windows PowerShell converting a benign native stderr banner into an error
# and cmd.exe expanding %NAME% in valid paths or rejecting UNC working dirs.
function Invoke-VopVercelEnvironmentPull {
    param(
        [Parameter(Mandatory=$true)]
        [string]$ProjectRoot,
        [Parameter(Mandatory=$true)]
        [string]$Destination,
        [ValidateSet("production", "preview", "development")]
        [string]$Environment = "production"
    )

    # Resolve the first vercel.cmd on the current PATH, not PowerShell's
    # previously cached command discovery. This also allows a temporary test
    # installation to shadow the real CLI without invoking cmd.exe.
    $vercelPath = $null
    foreach ($directory in ($env:PATH -split ';')) {
        if ([string]::IsNullOrWhiteSpace($directory)) { continue }
        $candidate = Join-Path $directory 'vercel.cmd'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $vercelPath = (Resolve-Path -LiteralPath $candidate).Path
            break
        }
    }
    $node = Get-Command -Name "node.exe" -CommandType Application -ErrorAction SilentlyContinue
    if (!$vercelPath -or !$node) {
        throw "Vercel CLI and Node.js Windows executables are required. Run npm install -g vercel and vercel login."
    }
    if (!(Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        throw "The Vercel project directory does not exist."
    }
    $entrypoint = Join-Path (Split-Path -Parent $vercelPath) "node_modules\vercel\dist\vc.js"
    if (!(Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
        throw "The Vercel CLI Node entrypoint was not found alongside vercel.cmd. Reinstall Vercel with npm install -g vercel."
    }
    $logBase = Join-Path ([IO.Path]::GetTempPath()) ("vop-vercel-cli-" + [Guid]::NewGuid().ToString("N"))
    $stdoutPath = $logBase + ".stdout"
    $stderrPath = $logBase + ".stderr"
    try {
        # Start Node itself, NOT cmd.exe/vercel.ps1, so paths with literal %
        # markers are preserved. Use an independent local working directory
        # and Vercel's documented --cwd to support linked UNC checkouts.
        $arguments = @(
            ('"' + $entrypoint + '"'),
            "--cwd", ('"' + $ProjectRoot + '"'),
            "env", "pull", ('"' + $Destination + '"'),
            ("--environment=" + $Environment), "--yes"
        )
        $process = Start-Process -FilePath $node.Source -WorkingDirectory ([IO.Path]::GetTempPath()) -ArgumentList $arguments -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        if ($null -eq $process -or $process.ExitCode -ne 0 -or
            !(Test-Path -LiteralPath $Destination -PathType Leaf)) {
            # Do not print raw CLI output: it can reveal environment metadata.
            $exitDescription = if ($null -eq $process) { "could not start" }
                               else { "exit code $($process.ExitCode)" }
            throw "Vercel env pull failed ($exitDescription). Verify vercel login, the linked vop-new project, and access to the $Environment environment."
        }
    } finally {
        foreach ($logFile in @($stdoutPath, $stderrPath)) {
            if (Test-Path -LiteralPath $logFile) {
                Remove-Item -LiteralPath $logFile -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
