function ConvertFrom-VercelClientEnvironmentLines {
    param([string[]]$Lines)
    $allowlist = @(
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_API_KEY",
        "VOP_FIREBASE_ANDROID_APP_ID",
        "VOP_FIREBASE_ANDROID_API_KEY",
        "VOP_FIREBASE_SENDER_ID",
        "VOP_GOOGLE_WEB_CLIENT_ID",
        "VOP_API_BASE_URL"
    )
    $values = @{}
    foreach ($line in $Lines) {
        if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
        $name = $Matches[1]
        if ($allowlist -notcontains $name) { continue }
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($value) { $values[$name] = $value }
    }
    return $values
}

# Pull environment configuration from the linked Vercel project.
# The Vercel CLI downloads the full environment into a short-lived temp file.
# Only allowlisted public client values are returned; no server secrets
# are passed to Flutter or saved in the repository.
function Get-VercelPublicClientSettings {
    param(
        [ValidateSet("production", "preview", "development")]
        [string]$Environment = "production"
    )
    if (!(Get-Command vercel -ErrorAction SilentlyContinue)) {
        throw "Install and log in to the Vercel CLI using npm i -g vercel and vercel login."
    }
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
    $projectLink = Join-Path $projectRoot ".vercel\project.json"
    if (!(Test-Path -LiteralPath $projectLink)) {
        throw "The VOP checkout is not linked to Vercel. Run 'vercel link --project vop-new' in the repository root."
    }
    $tempFile = Join-Path ([IO.Path]::GetTempPath()) ("vop-vercel-" + [Guid]::NewGuid().ToString("N") + ".env")
    try {
        Push-Location -LiteralPath $projectRoot
        try {
            # Do not print Vercel CLI output; errors may contain configuration.
            & vercel env pull $tempFile "--environment=$Environment" --yes *> $null
            if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $tempFile)) {
                throw "Could not pull Vercel environment. Check Vercel login, project link and permissions."
            }
        } finally {
            Pop-Location
        }
        $values = ConvertFrom-VercelClientEnvironmentLines -Lines @(Get-Content -LiteralPath $tempFile)
    } finally {
        if (Test-Path -LiteralPath $tempFile) {
            Remove-Item -LiteralPath $tempFile -Force
        }
    }
    return $values
}
