# Convenience entry point for the VOP native Android multi-target launcher.
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
[switch]$RepairSharePlus,
[switch]$UseVercelEnv,
[switch]$ColdBoot,
[switch]$SoftwareGraphics,
[ValidateSet("production", "preview", "development")]
[string]$VercelEnvironment = "production"
)
$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "native_android\run_vop.ps1"
if (!(Test-Path -LiteralPath $launcher)) {
  throw "VOP native Android multi-target launcher was not found: $launcher"
}
try {
  & $launcher @PSBoundParameters
} catch {
  Write-Host ""
  Write-Host "Error: $_" -ForegroundColor Red
  Write-Host ""
  Read-Host "Press Enter to exit..."
  exit 1
}
