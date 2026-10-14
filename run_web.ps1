# Run the Flutter VOP learner app in a browser from the repository root.
[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [string]$ApiBaseUrl = "",
    [ValidateSet("production", "preview", "development")]
    [string]$VercelEnvironment = "production",
    [switch]$NoPrompt,
    [switch]$ChromeInspector,
    [switch]$ShareOnNetwork,
    [ValidateRange(1,65535)]
    [int]$WebPort = 7357
)
$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "native_android\run_web.ps1"
& $launcher @PSBoundParameters
if (!$?) { throw "VOP Flutter web launcher failed." }
