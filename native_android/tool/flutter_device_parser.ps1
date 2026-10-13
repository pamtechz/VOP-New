# Parse the stable, human-readable device tables from Flutter's standard CLI.
# Some Flutter versions reject "--machine" for devices and emulators.
function ConvertFrom-FlutterDeviceText {
    param([string[]]$Lines)
    $separator = '\s+' + [regex]::Escape([string][char]0x2022) + '\s+'
    foreach ($line in $Lines) {
        $columns = @(([string]$line) -split $separator)
        if ($columns.Count -lt 4) { continue }
        $platform = $columns[2].Trim()
        if ($platform -notmatch '^android(?:-.+)?$') { continue }
        $deviceId = $columns[1].Trim()
        if ([string]::IsNullOrWhiteSpace($deviceId)) { continue }
        [pscustomobject]@{
            name = $columns[0].Trim()
            id = $deviceId
            targetPlatform = $platform
            emulator = ($deviceId -match '^emulator-[0-9]+$')
            emulatorId = ""
        }
    }
}

function ConvertFrom-FlutterEmulatorText {
    param([string[]]$Lines)
    $separator = '\s+' + [regex]::Escape([string][char]0x2022) + '\s+'
    foreach ($line in $Lines) {
        $columns = @(([string]$line) -split $separator)
        if ($columns.Count -lt 4) { continue }
        if ($columns[3].Trim() -notmatch '^android(?:\s|$)') { continue }
        $avdId = $columns[0].Trim()
        if ([string]::IsNullOrWhiteSpace($avdId)) { continue }
        [pscustomobject]@{
            id = $avdId
            name = $columns[1].Trim()
            manufacturer = $columns[2].Trim()
            platform = $columns[3].Trim()
        }
    }
}

function ConvertFrom-AndroidAvdList {
    param([string[]]$Lines)
    foreach ($rawLine in $Lines) {
        $avdId = ([string]$rawLine).Trim()
        if ($avdId -notmatch '^[A-Za-z0-9_.-]+$' -or
            $avdId -eq 'OK' -or $avdId -eq 'ERROR') { continue }
        [pscustomobject]@{
            id = $avdId
            name = $avdId
            manufacturer = "Android SDK"
            platform = "android"
        }
    }
}
