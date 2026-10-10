param(
    [string]$DeviceId = "",
    [string]$EnvFile = "Vop_Android_Config.env"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (!(Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw "Flutter is not installed or is not in PATH. Install Flutter SDK and Android Studio."
}
if (!(Test-Path $EnvFile)) {
    throw "Create $EnvFile from Vop_Android_Config.example.env. Do not commit actual client values."
}
$values = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and !$line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=",2)
        $values[$parts[0].Trim()] = $parts[1].Trim()
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
if (!(Test-Path "android/app/src/main/AndroidManifest.xml")) {
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
