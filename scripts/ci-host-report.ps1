# Read-only CI host capability report.
# Records the executing runner's platform and accelerator inventory so pipeline
# logs show which device backend the host provides.

$ErrorActionPreference = 'Continue'
Write-Output 'CI host capability report'
Write-Output ("hostname=" + $env:COMPUTERNAME)
Write-Output ("whoami=" + (whoami))

foreach ($cmd in @('nvidia-smi -L',
                   'nvidia-smi --query-gpu=name,uuid,memory.total,memory.free,driver_version --format=csv,noheader',
                   'wmic path win32_VideoController get name,adapterram',
                   'Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1 Name')) {
    Write-Output ("$ " + $cmd)
    try { Invoke-Expression $cmd 2>&1 | ForEach-Object { Write-Output $_ } } catch { Write-Output ("(unavailable: " + $_.Exception.Message + ")") }
}
Write-Output 'END_DIAG'
