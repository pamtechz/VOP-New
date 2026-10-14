$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root "native_android\tool\web_port.ps1")

$ip = [Net.IPAddress]::Parse("127.0.0.1")
$busy = [Net.Sockets.TcpListener]::new($ip, 0)
$freeProbe = [Net.Sockets.TcpListener]::new($ip, 0)
$alsoBusy = [Net.Sockets.TcpListener]::new($ip, 0)
try {
    $busy.Server.ExclusiveAddressUse = $true
    $busy.Start()
    $occupiedPort = $busy.LocalEndpoint.Port
    if (Test-VopWebPortAvailable -Port $occupiedPort) {
        throw "The port probe did not detect an occupied loopback port."
    }
    if (Test-VopWebPortAvailable -Port $occupiedPort -ShareOnNetwork) {
        throw "A LAN server probe did not detect the occupied loopback port."
    }

    $freeProbe.Start()
    $fallbackPort = $freeProbe.LocalEndpoint.Port
    $freeProbe.Stop()
    if (!(Test-VopWebPortAvailable -Port $fallbackPort)) {
        throw "The candidate fallback port was unexpectedly unavailable."
    }
    $resolved = Resolve-VopWebPort -PreferredPort $occupiedPort -ApprovedFallbackPorts @($fallbackPort)
    if ($resolved -ne $fallbackPort) {
        throw "The launcher did not recover an available fallback port."
    }
    $explicitFailed = $false
    try {
        Resolve-VopWebPort -PreferredPort $occupiedPort -ExplicitPort | Out-Null
    } catch {
        $explicitFailed = $_.Exception.Message -match 'already in use'
    }
    if (!$explicitFailed) { throw "An explicitly specified busy port was silently overridden." }

    $alsoBusy.Server.ExclusiveAddressUse = $true
    $alsoBusy.Start()
    $secondOccupiedPort = $alsoBusy.LocalEndpoint.Port
    $allBusyFailed = $false
    try {
        Resolve-VopWebPort -PreferredPort $occupiedPort -ApprovedFallbackPorts @($secondOccupiedPort) | Out-Null
    } catch {
        $allBusyFailed = $_.Exception.Message -match 'busy or unavailable'
    }
    if (!$allBusyFailed) { throw "All occupied candidate ports were not reported." }

    # The original listener must remain intact: launcher never kills foreign apps.
    if (!(Get-NetTCPConnection -LocalPort $occupiedPort -State Listen -ErrorAction SilentlyContinue)) {
        throw "The launcher changed a listening process instead of only probing."
    }
    Write-Host "Flutter VOP busy-port detection, approved fallback, explicit-port refusal and no process termination passed."
} finally {
    $busy.Stop()
    $freeProbe.Stop()
    $alsoBusy.Stop()
    $global:LASTEXITCODE = 0
}
