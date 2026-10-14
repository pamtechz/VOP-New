$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\vercel_web_config.ps1")

$lines = @(
    "VITE_FIREBASE_API_KEY=browser-public-key",
    "VITE_FIREBASE_APP_ID=1:12703:web:abcd1234",
    "VITE_FIREBASE_PROJECT_ID=voiceofprophecy",
    "VITE_FIREBASE_AUTH_DOMAIN=voiceofprophecy.firebaseapp.com",
    'FIREBASE_ADMIN_PRIVATE_KEY="never-expose-this"',
    "MTN_MOMO_API_KEY=server-only",
    "VOP_BOOTSTRAP_SECRET=server-only"
)
$filtered = ConvertFrom-VopWebEnvLines -Lines $lines
foreach ($privateKey in @("FIREBASE_ADMIN_PRIVATE_KEY", "MTN_MOMO_API_KEY", "VOP_BOOTSTRAP_SECRET")) {
    if ($filtered.ContainsKey($privateKey)) { throw "Server key leaked into client configuration: $privateKey" }
}
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("vop-web-config-test-" + [Guid]::NewGuid().ToString("N") + ".env")
try {
    Set-Content -LiteralPath $temporary -Value $lines -Encoding utf8
    $config = Get-VopWebClientConfiguration -ConfigPath $temporary
    if ($config["VOP_FIREBASE_WEB_APP_ID"] -ne "1:12703:web:abcd1234") { throw "Firebase web app ID was not mapped." }
    if ($config["VOP_FIREBASE_SENDER_ID"] -ne "12703") { throw "Firebase messaging sender was not derived." }
    if ($config["VOP_API_BASE_URL"] -ne "https://vopafrica.vercel.app") { throw "Incorrect API backend default." }
    if ($config.ContainsKey("FIREBASE_ADMIN_PRIVATE_KEY")) { throw "Server private key was exported." }

    $configCustom = Get-VopWebClientConfiguration -ConfigPath $temporary -ApiBaseUrl "https://example.org"
    if ($configCustom["VOP_API_BASE_URL"] -ne "https://example.org") { throw "HTTPS API override was ignored." }
    $invalid = $false
    try {
        Get-VopWebClientConfiguration -ConfigPath $temporary -ApiBaseUrl "http://example.org" | Out-Null
    } catch { $invalid = $_.Exception.Message -match "HTTPS origin" }
    if (!$invalid) { throw "HTTP backend origin was accepted." }

    $androidLines = @($lines | Where-Object { $_ -notmatch "^VITE_FIREBASE_APP_ID=" })
    $androidLines += "VITE_FIREBASE_APP_ID=1:12703:android:abcd1234"
    Set-Content -LiteralPath $temporary -Value $androidLines -Encoding utf8
    $wrongPlatform = $false
    try { Get-VopWebClientConfiguration -ConfigPath $temporary | Out-Null }
    catch { $wrongPlatform = $_.Exception.Message -match "web app ID" }
    if (!$wrongPlatform) { throw "An Android Firebase app ID was accepted as the browser app ID." }
    Write-Host "Browser Firebase public configuration filtering, sender ID and HTTPS validation passed."
} finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
}
