$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\flutter_device_parser.ps1")

$bullet = [char]0x2022
$deviceText = @(
    "Found 4 connected devices:",
    "  SM A145F (mobile) $bullet R58W313YEMB $bullet android-arm64 $bullet Android 15 (API 35)",
    "  Pixel_10 (mobile) $bullet emulator-5554 $bullet android-x64 $bullet Android 15 (API 35)",
    "  Galaxy Wi-Fi (mobile) $bullet adb-ABC123-xyz._adb-tls-connect._tcp $bullet android-arm64 $bullet Android 15 (API 35)",
    "  Chrome (web) $bullet chrome $bullet web-javascript $bullet Google Chrome"
)
$devices = @(ConvertFrom-FlutterDeviceText -Lines $deviceText)
if ($devices.Count -ne 3) { throw "Expected three Android devices, got $($devices.Count)" }
if ($devices[0].id -ne "R58W313YEMB") { throw "Samsung device ID was not parsed." }
if ($devices[1].id -ne "emulator-5554" -or !$devices[1].emulator) {
    throw "The local emulator was not identified."
}
if ($devices[2].id -notlike "*adb-tls-connect*" -or $devices[2].emulator) {
    throw "Secure wireless Android device was not parsed."
}
$empty = @(ConvertFrom-FlutterDeviceText -Lines @("Found 2 connected devices:", "Windows", "Chrome"))
if ($empty.Count -ne 0) { throw "Non-Android devices should be ignored." }

$emulatorText = @(
    "2 available emulators:",
    "Id               $bullet Name             $bullet Manufacturer $bullet Platform",
    "Pixel10          $bullet Pixel10          $bullet Google       $bullet android",
    "RSSEDURMS_API_35 $bullet RSSEDURMS API 35 $bullet Google       $bullet android",
    "ios_sim          $bullet iPhone           $bullet Apple        $bullet ios"
)
$emulators = @(ConvertFrom-FlutterEmulatorText -Lines $emulatorText)
if ($emulators.Count -ne 2) { throw "Expected 2 Android AVDs, got $($emulators.Count)." }
if ($emulators[0].id -ne "Pixel10" -or $emulators[1].id -ne "RSSEDURMS_API_35") {
    throw "Emulator selection identifiers did not match Flutter output."
}
Write-Host "Flutter device and Android emulator text parser tests passed."
