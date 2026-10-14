. (Join-Path $PSScriptRoot "vercel_cli.ps1")
# Public client Firebase web settings only. No admin/financial/private secrets.
function ConvertFrom-VopWebEnvLines {
    param([string[]]$Lines)
    $allowed = @(
        "VITE_FIREBASE_API_KEY", "VITE_FIREBASE_APP_ID",
        "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VOP_FIREBASE_API_KEY", "VOP_FIREBASE_WEB_APP_ID",
        "VOP_FIREBASE_PROJECT_ID", "VOP_FIREBASE_WEB_AUTH_DOMAIN",
        "VOP_FIREBASE_SENDER_ID", "VOP_API_BASE_URL"
    )
    $found = @{}
    foreach ($line in $Lines) {
        $entry = ([string]$line).Trim()
        if ($entry -match '^(?:export )?([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $name = $Matches[1]
            if ($allowed -notcontains $name) { continue }
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and $value[0] -eq '"' -and $value[-1] -eq '"') {
                $value = $value.Substring(1, $value.Length - 2)
            }
            if ($value) { $found[$name] = $value }
        }
    }
    return $found
}

function Get-VopWebClientConfiguration {
    param(
        [string]$ConfigPath = "",
        [ValidateSet("production", "preview", "development")]
        [string]$VercelEnvironment = "production",
        [string]$ApiBaseUrl = ""
    )
    $settings = @{}
    if ($ConfigPath) {
        if (!(Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
            throw "Web client configuration file not found: $ConfigPath"
        }
        $settings = ConvertFrom-VopWebEnvLines -Lines @(Get-Content -LiteralPath $ConfigPath)
    } else {
        if (!(Get-Command vercel -ErrorAction SilentlyContinue)) {
            throw "Vercel CLI is required. Run 'npm install -g vercel' and 'vercel login', or pass -ConfigPath."
        }
        $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
        if (!(Test-Path -LiteralPath (Join-Path $projectRoot ".vercel\project.json"))) {
            throw "Link your existing Vercel project first: from the VOP-New root, run 'vercel link --project vop-new'."
        }
        $temporary = Join-Path ([IO.Path]::GetTempPath()) ("vop-web-" + [Guid]::NewGuid().ToString("N") + ".env")
        try {
            Invoke-VopVercelEnvironmentPull -ProjectRoot $projectRoot -Destination $temporary -Environment $VercelEnvironment
            $settings = ConvertFrom-VopWebEnvLines -Lines @(Get-Content -LiteralPath $temporary)
        } finally {
            if (Test-Path -LiteralPath $temporary) {
                Remove-Item -LiteralPath $temporary -Force
            }
        }
    }
    $translated = @{
        "VOP_FIREBASE_API_KEY" = @("VITE_FIREBASE_API_KEY", "VOP_FIREBASE_API_KEY")
        "VOP_FIREBASE_WEB_APP_ID" = @("VITE_FIREBASE_APP_ID", "VOP_FIREBASE_WEB_APP_ID")
        "VOP_FIREBASE_PROJECT_ID" = @("VITE_FIREBASE_PROJECT_ID", "VOP_FIREBASE_PROJECT_ID")
        "VOP_FIREBASE_WEB_AUTH_DOMAIN" = @("VITE_FIREBASE_AUTH_DOMAIN", "VOP_FIREBASE_WEB_AUTH_DOMAIN")
        "VOP_FIREBASE_SENDER_ID" = @("VITE_FIREBASE_MESSAGING_SENDER_ID", "VOP_FIREBASE_SENDER_ID")
    }
    $result = @{}
    foreach ($destination in $translated.Keys) {
        foreach ($source in $translated[$destination]) {
            if ($settings.ContainsKey($source)) { $result[$destination] = $settings[$source]; break }
        }
    }
    $appId = [string]$result["VOP_FIREBASE_WEB_APP_ID"]
    $match = [regex]::Match($appId, '^1:([0-9]+):web:[a-zA-Z0-9]+$')
    if (!$match.Success) { throw "Vercel VITE_FIREBASE_APP_ID is missing or is not a Firebase web app ID." }
    if (!$result["VOP_FIREBASE_SENDER_ID"]) {
        $result["VOP_FIREBASE_SENDER_ID"] = $match.Groups[1].Value
    } elseif ($result["VOP_FIREBASE_SENDER_ID"] -ne $match.Groups[1].Value) {
        throw "Firebase web app ID and messaging sender ID are from different projects."
    }
    foreach ($key in @("VOP_FIREBASE_API_KEY", "VOP_FIREBASE_PROJECT_ID", "VOP_FIREBASE_WEB_AUTH_DOMAIN")) {
        if ([string]::IsNullOrWhiteSpace([string]$result[$key])) {
            throw "Missing $key in the Firebase web client configuration."
        }
    }
    $auth = [string]$result["VOP_FIREBASE_WEB_AUTH_DOMAIN"]
    if ($auth -notmatch '^[A-Za-z0-9.-]+$' -or $auth.Contains('..') -or $auth.StartsWith('-')) {
        throw "Firebase browser auth domain must be a valid hostname, not a URL."
    }
    $origin = if ($ApiBaseUrl) { $ApiBaseUrl }
              elseif ($settings.ContainsKey("VOP_API_BASE_URL")) { $settings["VOP_API_BASE_URL"] }
              else { "https://vopafrica.vercel.app" }
    $uri = $null
    if (![Uri]::TryCreate($origin, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne "https" -or !$uri.Host -or
        $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
        $uri.AbsolutePath -ne "/") {
        throw "VOP_API_BASE_URL must be an HTTPS origin without path, query or credentials."
    }
    $result["VOP_API_BASE_URL"] = $uri.GetLeftPart([UriPartial]::Authority)
    return $result
}
