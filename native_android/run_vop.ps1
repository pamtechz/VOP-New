param(
    [ValidateSet("Menu", "USB", "WiFi", "Emulator", "Browser", "Cloud", "List")]
    [string]$Mode = "Menu",
    [string]$DeviceId = "",
    [string]$PairAddress = "",
    [string]$ConnectAddress = "",
    [string]$EmulatorId = "",
    [ValidateSet("Default", "Chrome", "Edge")]
    [string]$Browser = "Default",
    [ValidateSet("Appetize", "BrowserStack")]
    [string]$CloudProvider = "Appetize",
    [string]$EnvFile = "Vop_Android_Config.env",
    [switch]$RepairSharePlus
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Require-Flutter {
    if (!(Get-Command flutter -ErrorAction SilentlyContinue)) {
        throw "Flutter is not installed or is not on PATH. Run flutter doctor after installing Flutter."
    }
}

function Resolve-Adb {
    $command = Get-Command adb -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
    if ($env:LOCALAPPDATA) {
        $sdkRoots += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    }
    foreach ($sdkRoot in $sdkRoots) {
        if ([string]::IsNullOrWhiteSpace($sdkRoot)) { continue }
        $candidate = Join-Path $sdkRoot "platform-tools\adb.exe"
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "adb was not found. Install Android SDK Platform-Tools in Android Studio (SDK Manager)."
}

function Get-AndroidDevices {
    $machineOutput = @(& flutter devices --machine)
    if ($LASTEXITCODE -ne 0) { throw "Flutter could not list devices; run flutter doctor -v." }
    try {
        $parsed = ConvertFrom-Json -InputObject ($machineOutput -join [Environment]::NewLine)
        return @($parsed | Where-Object { $_.targetPlatform -like "android-*" })
    } catch {
        throw "Unable to parse Flutter device list. Run flutter devices and verify the toolchain."
    }
}

function Select-Target($devices, [string]$requested, [string]$kind) {
    $matching = @($devices)
    if ($requested) {
        $choice = @($matching | Where-Object { $_.id -eq $requested })
        if ($choice.Count -ne 1) {
            $ids = ($matching | ForEach-Object { "$($_.name) [$($_.id)]" }) -join ", "
            throw "Device '$requested' is not a detected $kind target. Available: $ids"
        }
        return [string]$choice[0].id
    }
    if ($matching.Count -eq 0) { throw "No $kind target found. Run .\run_vop.ps1 -Mode List." }
    if ($matching.Count -eq 1) {
        Write-Host "Using $($matching[0].name) [$($matching[0].id)]"
        return [string]$matching[0].id
    }
    Write-Host "Available $kind targets:"
    for ($i = 0; $i -lt $matching.Count; $i++) {
        Write-Host ("  {0}. {1} ({2})" -f ($i + 1), $matching[$i].name, $matching[$i].id)
    }
    $answer = Read-Host "Select target number"
    $number = 0
    if (![int]::TryParse($answer, [ref]$number) -or $number -lt 1 -or $number -gt $matching.Count) {
        throw "Choose a number from 1 to $($matching.Count)."
    }
    return [string]$matching[$number - 1].id
}

function Start-Native([string]$targetId) {
    $args = @{
        DeviceId = $targetId
        EnvFile = $EnvFile
        RepairSharePlus = [bool]$RepairSharePlus
    }
    & (Join-Path $PSScriptRoot "run_android.ps1") @args
    if (!$?) { throw "VOP Flutter launch failed." }
}

function Start-Browser([string]$url) {
    $executable = switch ($Browser) {
        "Chrome" { "chrome.exe" }
        "Edge" { "msedge.exe" }
        default { "" }
    }
    if ($executable) {
        $command = Get-Command $executable -ErrorAction SilentlyContinue
        $location = if ($command) { $command.Source } else { "" }
        if (!$location) {
            $browserFolder = if ($Browser -eq "Chrome") {
                "Google\Chrome\Application"
            } else {
                "Microsoft\Edge\Application"
            }
            $installRoots = @(
                $env:ProgramFiles,
                [Environment]::GetEnvironmentVariable("ProgramFiles(x86)"),
                $env:LOCALAPPDATA
            )
            foreach ($installRoot in $installRoots) {
                if ([string]::IsNullOrWhiteSpace($installRoot)) { continue }
                $candidate = Join-Path (Join-Path $installRoot $browserFolder) $executable
                if (Test-Path -LiteralPath $candidate) { $location = $candidate; break }
            }
        }
        if (!$location) {
            throw "$Browser executable not found. Retry with -Browser Default."
        }
        Start-Process -FilePath $location -ArgumentList $url
    } else {
        Start-Process -FilePath $url
    }
}

function Assert-WirelessAddress([string]$address) {
    if ($address -notmatch '^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$') {
        throw "Use the IP:port shown in Android Wireless debugging (for example, 192.168.1.10:37123)."
    }
    $parts = $address.Split(":")
    $validIp = $null
    $port = [int]$parts[1]
    if (![System.Net.IPAddress]::TryParse($parts[0], [ref]$validIp) -or
        $port -lt 1 -or $port -gt 65535) {
        throw "The Wi-Fi debugging IP or port is invalid."
    }
}

function Start-Wireless {
    Write-Host "Android 11+ wireless debugging: computer and phone must share a Wi-Fi network."
    Write-Host "Phone: Settings > Developer options > Wireless debugging."
    $adb = Resolve-Adb
    $pair = $PairAddress
    $connect = $ConnectAddress
    $connected = @(Get-AndroidDevices | Where-Object {
        $_.emulator -ne $true -and $_.id -match ':\d+$'
    })
    if (!$pair -and !$connect -and $connected.Count -eq 0) {
        $pair = Read-Host "Pairing IP:port (from 'Pair device with pairing code'; Enter to skip if already paired)"
    }
    if ($pair) {
        Assert-WirelessAddress $pair
        Write-Host "Enter the phone's pairing code in the adb prompt. Do not put the code in a script."
        & $adb pair $pair
        if ($LASTEXITCODE -ne 0) { throw "ADB wireless pairing failed. Check the pairing IP, port and code." }
    }
    if (!$connect -and ($pair -or $connected.Count -eq 0)) {
        $connect = Read-Host "Device IP:port (from the main Wireless debugging screen, not the pairing popup)"
    }
    if ($connect) {
        Assert-WirelessAddress $connect
        & $adb connect $connect
        if ($LASTEXITCODE -ne 0) { throw "ADB wireless connection failed. Check Wi-Fi and device port." }
    }
    $targets = @()
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $targets = @(Get-AndroidDevices | Where-Object {
            $_.emulator -ne $true -and $_.id -match ':\d+$'
        })
        if ($targets.Count -gt 0) { break }
        Start-Sleep -Seconds 2
    }
    $selected = Select-Target $targets $DeviceId "Wi-Fi Android"
    Start-Native $selected
}

function Start-Emulator {
    $running = @(Get-AndroidDevices | Where-Object { $_.emulator -eq $true -or $_.id -match '^emulator-\d+$' })
    if ($running.Count -gt 0 -and !$EmulatorId) {
        Start-Native (Select-Target $running $DeviceId "Android emulator")
        return
    }
    $machineOutput = @(& flutter emulators --machine)
    if ($LASTEXITCODE -ne 0) { throw "Unable to list Android emulators. Open Android Studio > Device Manager." }
    $emulators = @(ConvertFrom-Json -InputObject ($machineOutput -join [Environment]::NewLine))
    $androidEmulators = @($emulators | Where-Object {
        $_.platform -match "android" -or $_.id -match "android|pixel|avd" -or !$_.platform
    })
    if ($androidEmulators.Count -eq 0) {
        throw "No Android Virtual Device found. In Android Studio open Device Manager > Create device."
    }
    $target = Select-Target $androidEmulators $EmulatorId "Android virtual device"
    & flutter emulators --launch $target
    if ($LASTEXITCODE -ne 0) { throw "Android emulator $target could not be started." }
    Write-Host "Waiting for the virtual Android device to appear..."
    $running = @()
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $running = @(Get-AndroidDevices | Where-Object {
            $_.emulator -eq $true -or $_.id -match '^emulator-\d+$'
        })
        if ($running.Count -gt 0) { break }
        Start-Sleep -Seconds 3
    }
    Start-Native (Select-Target $running $DeviceId "Android emulator")
}

function Show-Targets {
    Write-Host "--- Flutter devices ---"
    & flutter devices
    Write-Host "--- Android emulators ---"
    & flutter emulators
    Write-Host "--- Android Debug Bridge devices ---"
    try {
        $adb = Resolve-Adb
        & $adb devices -l
    } catch {
        Write-Warning $_.Exception.Message
    }
}

Require-Flutter
if ($Mode -eq "Menu") {
    Write-Host ""
    Write-Host "VOP: choose a run target"
    Write-Host "  1  Android phone (USB)"
    Write-Host "  2  Android phone (Wi-Fi / wireless debugging)"
    Write-Host "  3  Android Studio emulator"
    Write-Host "  4  VOP web portal in browser (not the native APK)"
    Write-Host "  5  Android APK in a cloud browser emulator"
    Write-Host "  6  List connected devices and emulators"
    Write-Host "  0  Exit"
    $selection = Read-Host "Option"
    $Mode = switch ($selection) {
        "1" { "USB" }
        "2" { "WiFi" }
        "3" { "Emulator" }
        "4" { "Browser" }
        "5" { "Cloud" }
        "6" { "List" }
        "0" { return }
        default { throw "Invalid option." }
    }
}

switch ($Mode) {
    "USB" {
        $targets = @(Get-AndroidDevices | Where-Object {
            $_.emulator -ne $true -and $_.id -notmatch ':\d+$'
        })
        Start-Native (Select-Target $targets $DeviceId "USB Android")
    }
    "WiFi" { Start-Wireless }
    "Emulator" { Start-Emulator }
    "Browser" {
        Write-Host "Opening the deployed VOP web portal, not the Android APK."
        Write-Host "For an actual Android APK in a browser, select -Mode Cloud."
        Start-Browser "https://vopafrica.vercel.app"
    }
    "Cloud" {
        Write-Host "Building the real Android debug APK; an upload to the cloud provider is a separate action."
        & (Join-Path $PSScriptRoot "run_android.ps1") -BuildApk -EnvFile $EnvFile -RepairSharePlus:$RepairSharePlus
        if (!$?) { throw "VOP APK build failed." }
        $apk = Join-Path $PSScriptRoot "build\app\outputs\flutter-apk\app-debug.apk"
        if (!(Test-Path -LiteralPath $apk)) { throw "APK was not found at $apk" }
        Write-Host "APK ready: $apk"
        Write-Host "Upload it manually. Cloud emulators may not support actual phone biometric or passkey hardware."
        $uploadUrl = if ($CloudProvider -eq "BrowserStack") {
            "https://www.browserstack.com/app-live"
        } else {
            "https://appetize.io/upload"
        }
        Start-Browser $uploadUrl
    }
    "List" { Show-Targets }
}
