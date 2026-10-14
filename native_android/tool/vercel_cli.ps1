# Invoke Vercel via its Windows command shim. The vercel.ps1 wrapper can
# convert benign version/status text on stderr into a terminating error when
# Windows PowerShell 5.1 uses ErrorActionPreference Stop.
function Invoke-VopVercelEnvironmentPull {
    param(
        [Parameter(Mandatory=$true)]
        [string]$ProjectRoot,
        [Parameter(Mandatory=$true)]
        [string]$Destination,
        [ValidateSet("production", "preview", "development")]
        [string]$Environment = "production"
    )

    $vercel = Get-Command -Name "vercel.cmd" -CommandType Application -ErrorAction SilentlyContinue
    if (!$vercel) {
        throw "Vercel CLI Windows executable (vercel.cmd) was not found. Run npm install -g vercel and vercel login."
    }
    if (!(Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        throw "The Vercel project directory does not exist."
    }
    $cmdExe = if ($env:ComSpec) { $env:ComSpec } else { "cmd.exe" }
    $logBase = Join-Path ([IO.Path]::GetTempPath()) ("vop-vercel-cli-" + [Guid]::NewGuid().ToString("N"))
    $stdoutPath = $logBase + ".stdout"
    $stderrPath = $logBase + ".stderr"
    try {
        # cmd /S /C uses outer quotes around the quoted binary and destination.
        # Environment is constrained to a ValidateSet, never unchecked input.
        $commandLine = '""' + $vercel.Source + '" env pull "' +
            $Destination + '" --environment=' + $Environment + ' --yes"'
        $process = Start-Process -FilePath $cmdExe -WorkingDirectory $ProjectRoot -ArgumentList @("/D", "/S", "/C", $commandLine) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        if ($null -eq $process -or $process.ExitCode -ne 0 -or
            !(Test-Path -LiteralPath $Destination -PathType Leaf)) {
            # Do not print raw CLI output because it may contain environment
            # metadata. Parent callers delete the full downloaded env file.
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
