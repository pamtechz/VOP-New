$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\flutter_device_parser.ps1")
. (Join-Path $root "native_android\tool\resolve_android_target.ps1")

$bullet = [char]0x2022
$threeTargets = @(
    "Found 5 connected devices:",
    "  SM A145F (mobile) $bullet 192.168.1.32:42653 $bullet android-arm64 $bullet Android 15 (API 35)",
    "  sdk gphone64 x86 64 (mobile) $bullet emulator-5554 $bullet android-x64 $bullet Android 15 (API 35) (emulator)",
    "  Windows (desktop) $bullet windows $bullet windows-x64 $bullet Windows",
    "  Chrome (web) $bullet chrome $bullet web-javascript $bullet Chrome",
    "  Edge (web) $bullet edge $bullet web-javascript $bullet Edge"
)
if ((Resolve-VopAndroidTarget -RequestedId "emulator-5556" -DeviceLines $threeTargets) -ne "emulator-5554") {
    throw "Stale emulator-5556 did not resolve to the sole active emulator-5554."
}
if ((Resolve-VopAndroidTarget -RequestedId "emulator" -DeviceLines $threeTargets) -ne "emulator-5554") {
    throw "The emulator alias did not select the active emulator."
}
if ((Resolve-VopAndroidTarget -RequestedId "192.168.1.32:11111" -DeviceLines $threeTargets) -ne "192.168.1.32:42653") {
    throw "A rotated Wi-Fi debugging port did not resolve by its same device IP."
}
if ((Resolve-VopAndroidTarget -RequestedId "SM-A145F" -DeviceLines $threeTargets) -ne "192.168.1.32:42653") {
    throw "Samsung model alias did not resolve its unique online device."
}
if ((Resolve-VopAndroidTarget -RequestedId "192.168.1.32:42653" -DeviceLines $threeTargets) -ne "192.168.1.32:42653") {
    throw "Exact Android serial was changed."
}

$twoEmulators = $threeTargets + "  Other AVD (mobile) $bullet emulator-5556 $bullet android-x64 $bullet Android 15 (API 35) (emulator)"
$ambiguous = $false
try {
    Resolve-VopAndroidTarget -RequestedId "emulator-5558" -DeviceLines $twoEmulators | Out-Null
} catch {
    $ambiguous = $_.Exception.Message -match "ambiguous"
}
if (!$ambiguous) { throw "Ambiguous stale emulator serial was silently mapped to another AVD." }

$missing = $false
try {
    Resolve-VopAndroidTarget -RequestedId "random-device" -DeviceLines $threeTargets | Out-Null
} catch {
    $missing = $_.Exception.Message -match "not connected"
}
if (!$missing) { throw "An unknown device identifier did not fail." }

$single = @("  sdk gphone64 x86 64 (mobile) $bullet emulator-5554 $bullet android-x64 $bullet Android 15 (API 35) (emulator)")
if ((Resolve-VopAndroidTarget -RequestedId auto -DeviceLines $single -NoPrompt) -ne "emulator-5554") {
    throw "Automatic selection of a sole online Android device failed."
}
Write-Host "Android stale-ID, Wi-Fi port rotation, alias, ambiguity and exact-match tests passed."
