param(
    [string]$DeviceId = "",
    [string]$EnvFile = "Vop_Android_Config.env",
    [switch]$RepairSharePlus,
    [switch]$BuildApk
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

$packageConfigPath = Join-Path $PSScriptRoot ".dart_tool\package_config.json"
if (!(Test-Path -LiteralPath $packageConfigPath)) {
    throw "Missing Dart package configuration after flutter pub get."
}
$packageConfig = Get-Content -LiteralPath $packageConfigPath -Raw | ConvertFrom-Json
$matchesShare = @($packageConfig.packages | Where-Object { $_.name -eq "share_plus" })
if ($matchesShare.Count -ne 1) {
    throw "The share_plus dependency was not found in Dart package configuration."
}
$packageUri = [Uri]::new([string]$matchesShare[0].rootUri, [UriKind]::RelativeOrAbsolute)
if (!$packageUri.IsAbsoluteUri -or !$packageUri.IsFile) {
    throw "The share_plus source is not in a local package directory."
}
$packagePath = [IO.Path]::GetFullPath($packageUri.LocalPath).TrimEnd([char]92, [char]47)
$shareSources = @(
    "Share.kt",
    "ShareSuccessManager.kt",
    "SharePlusPendingIntent.kt",
    "MethodCallHandler.kt",
    "SharePlusPlugin.kt"
)
function Get-MissingShareSources([string]$sourcePath) {
    $kotlinPath = Join-Path $sourcePath "android\src\main\kotlin\dev\fluttercommunity\plus\share"
    return @($shareSources | Where-Object {
        !(Test-Path -LiteralPath (Join-Path $kotlinPath $_))
    })
}
$missingShareSources = @(Get-MissingShareSources $packagePath)
if ($RepairSharePlus -or $missingShareSources.Count -gt 0) {
    if ($missingShareSources.Count -gt 0) {
        Write-Warning "Cached share_plus is missing: $($missingShareSources -join ', ')"
    }
    if (!$env:PUB_CACHE -and !$env:LOCALAPPDATA) {
        throw "The Windows Pub package cache location is unknown."
    }
    $cacheRoot = if ($env:PUB_CACHE) {
        [IO.Path]::GetFullPath($env:PUB_CACHE)
    } else {
        Join-Path $env:LOCALAPPDATA "Pub\Cache"
    }
    $expectedParent = [IO.Path]::GetFullPath((Join-Path $cacheRoot "hosted\pub.dev"))
    $actualParent = [IO.Path]::GetFullPath((Split-Path -Parent $packagePath))
    $packageName = Split-Path -Leaf $packagePath
    $parsedVersion = New-Object System.Version
    $isPackageVersion = $packageName.StartsWith("share_plus-") -and
        [Version]::TryParse($packageName.Substring("share_plus-".Length), [ref]$parsedVersion)
    if ($actualParent -ne $expectedParent -or !$isPackageVersion) {
        throw "Refusing to delete a share_plus package outside the verified hosted Pub cache."
    }
    Write-Host "Repairing the scoped share_plus Pub cache and clearing native build outputs..."
    Remove-Item -LiteralPath $packagePath -Recurse -Force
    flutter clean
    if ($LASTEXITCODE -ne 0) { throw "Flutter clean failed during repair." }
    flutter pub get
    if ($LASTEXITCODE -ne 0) { throw "Pub could not restore share_plus." }
    $missingShareSources = @(Get-MissingShareSources $packagePath)
    if ($missingShareSources.Count -gt 0) {
        throw "The restored share_plus archive is still missing required Kotlin sources."
    }
}

$defines = @()
foreach ($key in ($keys + @("VOP_GOOGLE_WEB_CLIENT_ID"))) {
    if ($values.ContainsKey($key) -and $values[$key]) {
        $defines += "--dart-define=$key=$($values[$key])"
    }
}
if ($BuildApk) {
    if ($DeviceId) { throw "Do not pass -DeviceId when building an APK." }
    $flutterArgs = @("build", "apk", "--debug") + $defines
} else {
    $flutterArgs = @("run") + $defines
    if ($DeviceId) { $flutterArgs += @("-d", $DeviceId) }
}
flutter @flutterArgs
if ($LASTEXITCODE -ne 0) {
    throw $(if ($BuildApk) { "Flutter APK build failed." } else { "Flutter run failed." })
}
