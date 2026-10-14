# Run the same Flutter VOP learner UI in a desktop/phone browser.
# Default web-server avoids Chrome DWDS/AppInspector execution-context churn.
[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [string]$ApiBaseUrl = "",
    [ValidateSet("production", "preview", "development")]
    [string]$VercelEnvironment = "production",
    [switch]$NoPrompt,
    [switch]$ChromeInspector,
    [switch]$ShareOnNetwork,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 7357
)

$ErrorActionPreference = "Stop"
if ($ShareOnNetwork -and $ChromeInspector) {
    throw "Choose -ShareOnNetwork for a phone browser, or -ChromeInspector for local DWDS debugging. They cannot be combined."
}
if (!(Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw "Flutter SDK was not found. Install Flutter stable and run flutter doctor."
}
$root = $PSScriptRoot
. (Join-Path $root "tool\web_port.ps1")
# Resolve the port before Vercel config download and flutter pub get.
# When a caller explicitly requests a port, fail clearly rather than silently
# running a different origin (which might not be permitted by server CORS).
$explicitWebPort = $PSBoundParameters.ContainsKey("WebPort")
$WebPort = Resolve-VopWebPort -PreferredPort $WebPort -ExplicitPort:$explicitWebPort -ShareOnNetwork:$ShareOnNetwork
if ($ShareOnNetwork) {
    Write-Warning "Phone browsers using LAN HTTP cannot access protected VOP backend APIs: this deployment intentionally rejects insecure non-loopback origins. Even a CORS allowlist entry will not enable HTTP LAN access. Use a trusted HTTPS preview origin with proper Firebase authorization for authenticated phone browser testing."
} elseif ($WebPort -notin @(7357, 7358, 7359)) {
    Write-Warning "Port $WebPort is custom. Protected VOP API requests from http://127.0.0.1:$WebPort require this exact loopback origin to be included in the server-side VOP_FLUTTER_WEB_ALLOWED_ORIGINS."
}
if ($ConfigPath) {
    $ConfigPath = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
}
. (Join-Path $root "tool\vercel_web_config.ps1")
$publicConfig = Get-VopWebClientConfiguration -ConfigPath $ConfigPath -VercelEnvironment $VercelEnvironment -ApiBaseUrl $ApiBaseUrl

Set-Location -LiteralPath $root
if (!(Test-Path -LiteralPath (Join-Path $root "web\index.html"))) {
    Write-Host "Generating Flutter web platform scaffold..."
    & flutter create --platforms=web --org com.sda --project-name vop .
    if ($LASTEXITCODE -ne 0) { throw "Flutter web platform creation failed." }
}
& flutter pub get
if ($LASTEXITCODE -ne 0) { throw "Flutter dependency resolution failed." }

$defines = @()
foreach ($key in @(
    "VOP_API_BASE_URL", "VOP_FIREBASE_API_KEY",
    "VOP_FIREBASE_WEB_APP_ID", "VOP_FIREBASE_WEB_AUTH_DOMAIN",
    "VOP_FIREBASE_SENDER_ID", "VOP_FIREBASE_PROJECT_ID"
)) {
    if (![string]::IsNullOrWhiteSpace([string]$publicConfig[$key])) {
        $defines += "--dart-define=$key=$($publicConfig[$key])"
    }
}
if ($ChromeInspector) {
    Write-Host "Starting VOP Flutter web with Chrome Inspector/DWDS enabled."
    $flutterArgs = @("run", "-d", "chrome", "--web-port", "$WebPort") + $defines
} else {
    $bindAddress = if ($ShareOnNetwork) { "0.0.0.0" } else { "127.0.0.1" }
    $flutterArgs = @(
        "run", "-d", "web-server", "--web-hostname", $bindAddress,
        "--web-port", "$WebPort"
    ) + $defines
    Write-Host "Starting VOP Flutter web-server at http://127.0.0.1:$WebPort"
    Write-Host "Open this URL in Chrome, Edge, Firefox or Safari once Flutter says the server is ready."
    if ($ShareOnNetwork) {
        Write-Warning "LAN HTTP previews can display the Flutter interface, but protected VOP API requests and secure browser authentication will not work from the phone's HTTP address. Do not enter real credentials into an insecure phone preview. For full functionality, use an HTTPS preview domain authorized by Firebase."
        try {
            $addresses = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
                Where-Object {
                    $_.OperationalStatus -eq [Net.NetworkInformation.OperationalStatus]::Up -and
                    $_.NetworkInterfaceType -ne [Net.NetworkInformation.NetworkInterfaceType]::Loopback
                } | ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
                Where-Object {
                    $_.Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
                    -not [Net.IPAddress]::IsLoopback($_.Address) -and
                    -not $_.Address.ToString().StartsWith("169.254.")
                } | ForEach-Object { $_.Address.ToString() } | Sort-Object -Unique)
            foreach ($address in $addresses) {
                Write-Host ("Phone preview: http://" + $address + ":$WebPort")
            }
        } catch {
            Write-Host "Use 'ipconfig' and your trusted Wi-Fi IPv4 address for the phone preview."
        }
        Write-Host "If Windows Firewall asks, allow Flutter only on your Private trusted network."
    }
}
Write-Host "Using the registered Firebase web app, not the Android Firebase app registration."
Write-Host "Browser requests to the VOP backend require its CORS policy to authorize this development origin."
Write-Host "Press Ctrl+C to stop the Flutter web preview."
& flutter @flutterArgs
if ($LASTEXITCODE -ne 0) { throw "Flutter web preview failed with exit code $LASTEXITCODE." }
