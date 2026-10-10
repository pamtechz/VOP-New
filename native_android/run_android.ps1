param(
    [string]$DeviceId = "",
    [string]$EnvFile = "Vop_Android_Config.env"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (!(Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw "Flutter is not installed or is not in PATH. Install Flutter SDK and Android Studio."
}
$values = @{}
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split '=', 2
            $values[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
} else {
    # Reuse the existing PUBLIC Android Firebase client registration.
    # This file does NOT contain a Firebase Admin service account.
    $legacyConfig = Join-Path $PSScriptRoot "..\android\app\google-services.json"
    if (!(Test-Path $legacyConfig)) {
        throw "No VOP Firebase client config exists. Create $EnvFile from the example."
    }
    $settings = Get-Content $legacyConfig -Raw | ConvertFrom-Json
    $client = @($settings.client | Where-Object {
        $_.client_info.android_client_info.package_name -eq "com.sda.vop"
    } | Select-Object -First 1)
    if ($client.Count -eq 0) { throw "Existing Firebase app com.sda.vop is not registered." }
    $appClient = $client[0]
    $googleWeb = @($appClient.oauth_client | Where-Object {
        $_.client_type -eq 3
    } | Select-Object -First 1)
    $values["VOP_API_BASE_URL"] = "https://vopafrica.vercel.app"
    $values["VOP_FIREBASE_API_KEY"] = [string]$appClient.api_key[0].current_key
    $values["VOP_FIREBASE_ANDROID_APP_ID"] = [string]$appClient.client_info.mobilesdk_app_id
    $values["VOP_FIREBASE_SENDER_ID"] = [string]$settings.project_info.project_number
    $values["VOP_FIREBASE_PROJECT_ID"] = [string]$settings.project_info.project_id
    if ($googleWeb.Count -gt 0) {
        $values["VOP_GOOGLE_WEB_CLIENT_ID"] = [string]$googleWeb[0].client_id
    }
}
$keys = @(
    "VOP_API_BASE_URL", "VOP_FIREBASE_API_KEY",
    "VOP_FIREBASE_ANDROID_APP_ID", "VOP_FIREBASE_SENDER_ID",
    "VOP_FIREBASE_PROJECT_ID"
)
foreach ($key in $keys) {
    if (!$values.ContainsKey($key) -or !$values[$key]) {
        throw "Missing $key in $EnvFile"
    }
}
if (!(Test-Path "android/settings.gradle.kts") -and !(Test-Path "android/settings.gradle")) {
    flutter create --platforms=android --org com.sda --project-name vop .
    if ($LASTEXITCODE -ne 0) { throw "Native Android scaffold generation failed." }
}
flutter pub get
if ($LASTEXITCODE -ne 0) { throw "flutter pub get failed." }
$defines = @()
foreach ($key in ($keys + @("VOP_GOOGLE_WEB_CLIENT_ID"))) {
    if ($values.ContainsKey($key) -and $values[$key]) {
        $defines += "--dart-define=$key=$($values[$key])"
    }
}
$args = @("run") + $defines
if ($DeviceId) { $args += @("-d", $DeviceId) }
flutter @args
if ($LASTEXITCODE -ne 0) { throw "Flutter run failed." }
