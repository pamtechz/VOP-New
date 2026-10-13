param(
    [string]$DeviceId = "",
    [string]$EnvFile = "Vop_Android_Config.env",
    [switch]$RepairSharePlus
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

# Confirm the Android sharing plugin is complete before Gradle compiles it.
# A stale/incomplete Windows Pub cache can leave its Kotlin types unresolved.
$packageConfigPath = Join-Path $PSScriptRoot ".dart_tool\package_config.json"
if (!(Test-Path -LiteralPath $packageConfigPath)) {
    throw "Flutter did not generate its package configuration."
}
$packageConfig = Get-Content -LiteralPath $packageConfigPath -Raw | ConvertFrom-Json
$shareEntry = @($packageConfig.packages | Where-Object { $_.name -eq "share_plus" })
if ($shareEntry.Count -ne 1) { throw "share_plus was not resolved in package_config.json." }
$packageUri = [System.Uri]::new([string]$shareEntry[0].rootUri, [System.UriKind]::RelativeOrAbsolute)
if (!$packageUri.IsAbsoluteUri -or !$packageUri.IsFile) {
    throw "Unexpected share_plus source location. Expected an absolute file URI."
}
$sharePackage = [System.IO.Path]::GetFullPath($packageUri.LocalPath).TrimEnd([char]92, [char]47)
$expectedSource = @(
    "Share.kt",
    "ShareSuccessManager.kt",
    "SharePlusPendingIntent.kt",
    "MethodCallHandler.kt",
    "SharePlusPlugin.kt"
)
function Get-MissingShareSources([string]$packagePath) {
    $source = Join-Path $packagePath "android\src\main\kotlin\dev\fluttercommunity\plus\share"
    return @($expectedSource | Where-Object { !(Test-Path -LiteralPath (Join-Path $source $_)) })
}
$missingSources = @(Get-MissingShareSources $sharePackage)
if ($RepairSharePlus -or $missingSources.Count -gt 0) {
    if ($missingSources.Count -gt 0) {
        Write-Warning "share_plus is missing Kotlin source files: $($missingSources -join ', ')"
    }
    $cacheRoot = if ($env:PUB_CACHE) {
        [System.IO.Path]::GetFullPath($env:PUB_CACHE)
    } else {
        Join-Path $env:LOCALAPPDATA "Pub\Cache"
    }
    $expectedHosted = [System.IO.Path]::GetFullPath((Join-Path $cacheRoot "hosted\pub.dev"))
    $parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $sharePackage))
    if ($parent -ne $expectedHosted -or (Split-Path -Leaf $sharePackage) -notmatch '^share_plus-[0-9]+(?:\.[0-9]+){2}
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
) {
        throw "Refusing to remove a share_plus source outside the verified Pub hosted cache: $sharePackage"
    }
    Write-Host "Refreshing only the share_plus package cache and native build outputs..."
    Remove-Item -LiteralPath $sharePackage -Recurse -Force
    flutter clean
    if ($LASTEXITCODE -ne 0) { throw "Flutter clean failed during share_plus repair." }
    flutter pub get
    if ($LASTEXITCODE -ne 0) { throw "Pub failed to restore share_plus." }
    $sharePackage = [System.IO.Path]::GetFullPath($packageUri.LocalPath).TrimEnd([char]92, [char]47)
    $missingSources = @(Get-MissingShareSources $sharePackage)
    if ($missingSources.Count -gt 0) {
        throw "The restored share_plus package is still missing: $($missingSources -join ', ')"
    }
    Write-Host "share_plus source cache was restored."
}

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
