# Find an available VOP Flutter preview port without terminating other processes.
# Browser API CORS grants are explicit origins, not arbitrary localhost ports.
function Test-VopWebPortAvailable {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateRange(1, 65535)]
        [int]$Port,
        [switch]$ShareOnNetwork
    )
    $bindAddress = if ($ShareOnNetwork) { [Net.IPAddress]::Any }
                   else { [Net.IPAddress]::Parse("127.0.0.1") }
    $listener = [Net.Sockets.TcpListener]::new($bindAddress, $Port)
    try {
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    } catch [Net.Sockets.SocketException] {
        return $false
    } finally {
        $listener.Stop()
    }
}

function Resolve-VopWebPort {
    param(
        [ValidateRange(1, 65535)]
        [int]$PreferredPort = 7357,
        [switch]$ExplicitPort,
        [switch]$ShareOnNetwork,
        [int[]]$ApprovedFallbackPorts = @(7358, 7359)
    )
    if (Test-VopWebPortAvailable -Port $PreferredPort -ShareOnNetwork:$ShareOnNetwork) {
        return $PreferredPort
    }
    if ($ExplicitPort) {
        throw "Port $PreferredPort is already in use or cannot be bound. Select another authorized port with -WebPort, or inspect the listener using Get-NetTCPConnection -LocalPort $PreferredPort -State Listen. Never stop an unidentified process."
    }
    foreach ($candidate in $ApprovedFallbackPorts) {
        if ($candidate -eq $PreferredPort) { continue }
        if (Test-VopWebPortAvailable -Port $candidate -ShareOnNetwork:$ShareOnNetwork) {
            Write-Warning "VOP web port $PreferredPort is busy. Selecting available approved preview port $candidate instead; no processes were stopped."
            return $candidate
        }
    }
    throw "VOP web preview ports $PreferredPort, $($ApprovedFallbackPorts -join ', ') are busy or unavailable. Inspect listeners with Get-NetTCPConnection, or specify an authorized free port using -WebPort. The launcher never terminates other processes."
}
