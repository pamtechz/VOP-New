$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\vercel_public_config.ps1")

$lines = @(
    "VITE_FIREBASE_PROJECT_ID=voiceofprophecy",
    "VITE_FIREBASE_API_KEY=web-public-key",
    "VITE_FIREBASE_APP_ID=web-id-not-for-android",
    "VOP_FIREBASE_ANDROID_APP_ID=1:123456:android:abc",
    "VOP_FIREBASE_SENDER_ID=123456",
    "VOP_FIREBASE_ANDROID_API_KEY=android-public-key",
    "VOP_API_BASE_URL=https://example.org",
    'FIREBASE_ADMIN_PRIVATE_KEY="never-expose-this"',
    "CRON_SECRET=server-only",
    "MTN_MOMO_API_KEY=server-only"
)
$result = ConvertFrom-VercelClientEnvironmentLines -Lines $lines
foreach ($key in @(
    "FIREBASE_ADMIN_PRIVATE_KEY", "CRON_SECRET", "MTN_MOMO_API_KEY",
    "VITE_FIREBASE_APP_ID"
)) {
    if ($result.ContainsKey($key)) { throw "Disallowed Firebase or server secret was accepted: $key" }
}
if ($result["VITE_FIREBASE_PROJECT_ID"] -ne "voiceofprophecy") {
    throw "Public Firebase project ID was not parsed."
}
if ($result["VOP_FIREBASE_ANDROID_APP_ID"] -ne "1:123456:android:abc") {
    throw "Explicit Android Firebase app ID was not parsed."
}
if ($result["VOP_FIREBASE_ANDROID_API_KEY"] -ne "android-public-key") {
    throw "Android-specific API key was not parsed."
}
if ($result.Count -ne 6) {
    throw "The Vercel allowlist contained an unexpected number of fields ($($result.Count))."
}
Write-Host "Vercel public client allowlist and server-secret exclusion tests passed."
