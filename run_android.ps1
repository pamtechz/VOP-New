# Convenience entry point from the VOP-New repository root.
# The native launcher resolves the Flutter project and public client config.
param(
    [string]$DeviceId = "",
    [string]$EnvFile = "Vop_Android_Config.env",
    [switch]$RepairSharePlus,
    [switch]$BuildApk,
    [switch]$UseVercelEnv,
    [ValidateSet("production", "preview", "development")]
    [string]$VercelEnvironment = "production"
)
$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "native_android\run_android.ps1"
if (!(Test-Path -LiteralPath $launcher)) {
    throw "VOP native Android launcher was not found: $launcher"
}
& $launcher @PSBoundParameters
if (!$?) { throw "Native VOP Android launcher failed." }
