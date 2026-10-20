# Run the Flutter VOP learner app in a browser from the repository root.
[CmdletBinding()]
param(
[string]$ConfigPath = "",
[string]$ApiBaseUrl = "",
[ValidateSet("production", "preview", "development")]
[string]$VercelEnvironment = "production",
[switch]$NoPrompt,
[switch]$ChromeInspector,
[switch]$NoInjectedClient,
[switch]$ShareOnNetwork,
[ValidateRange(1,65535)]
[int]$WebPort = 7357
)
$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "native_android\run_web.ps1"
if (!(Test-Path -LiteralPath $launcher)) {
  throw "VOP Flutter web launcher was not found: $launcher"
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
