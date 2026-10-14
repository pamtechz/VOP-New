# Resolve Flutter's CURRENT Android device ID immediately before flutter run.
# Emulator serials such as emulator-5554/5556 are ephemeral and not AVD names.
function Resolve-VopAndroidTarget {
    param(
        [string]$RequestedId = "",
        [string[]]$DeviceLines = @(),
        [switch]$NoPrompt
    )

    $targets = @(ConvertFrom-FlutterDeviceText -Lines $DeviceLines)
    if ($targets.Count -eq 0) {
        throw "No online Android device was detected. Run 'flutter devices' and 'adb devices -l'; wait for Android boot or authorize the phone."
    }

    if ([string]::IsNullOrWhiteSpace($RequestedId) -or $RequestedId -eq "auto") {
        if ($targets.Count -eq 1) {
            Write-Host "Automatically selected Android device: $($targets[0].name) [$($targets[0].id)]"
            return [string]$targets[0].id
        }
        if ($NoPrompt) {
            throw "Multiple Android devices are connected. Specify -DeviceId with the current Flutter serial or an unambiguous target."
        }
        Write-Host "Choose the Android device to run VOP:"
        for ($i = 0; $i -lt $targets.Count; $i++) {
            Write-Host ("  {0}. {1} [{2}]" -f ($i + 1), $targets[$i].name, $targets[$i].id)
        }
        $selection = Read-Host "Device number"
        $index = 0
        if (![int]::TryParse($selection, [ref]$index) -or
            $index -lt 1 -or $index -gt $targets.Count) {
            throw "Choose a number between 1 and $($targets.Count)."
        }
        return [string]$targets[$index - 1].id
    }

    $exact = @($targets | Where-Object { $_.id -eq $RequestedId })
    if ($exact.Count -eq 1) { return [string]$exact[0].id }

    $matching = @()
    if ($RequestedId -match '^emulator-\d+$' -or $RequestedId -eq "emulator") {
        $matching = @($targets | Where-Object { $_.emulator -eq $true })
    } elseif ($RequestedId -match '^\d{1,3}(?:\.\d{1,3}){3}:\d+$') {
        $ip = $RequestedId.Split(':')[0]
        $matching = @($targets | Where-Object {
            $_.emulator -ne $true -and ([string]$_.id).StartsWith("$ip" + ":")
        })
    } elseif ($RequestedId -eq "wifi") {
        $matching = @($targets | Where-Object {
            $_.emulator -ne $true -and $_.id -match '(:\d+$|adb-tls-connect)'
        })
    } elseif ($RequestedId -eq "usb") {
        $matching = @($targets | Where-Object {
            $_.emulator -ne $true -and $_.id -notmatch '(:\d+$|adb-tls-connect)'
        })
    } else {
        # Accept human-readable model names without requiring exact whitespace
        # or punctuation: e.g. SM-A145F matches SM A145F (mobile).
        $needle = ($RequestedId.ToLowerInvariant() -replace '[^a-z0-9]', '')
        if ($needle.Length -ge 4) {
            $matching = @($targets | Where-Object {
                $deviceName = (([string]$_.name).ToLowerInvariant() -replace '[^a-z0-9]', '')
                $deviceName -like "*$needle*"
            })
        }
    }

    if ($matching.Count -eq 1) {
        $chosen = [string]$matching[0].id
        Write-Warning "Device '$RequestedId' is no longer the active serial. Using the sole matching Android target '$chosen'."
        return $chosen
    }

    $ids = (@($targets | ForEach-Object { "$($_.name) [$($_.id)]" }) -join "; ")
    if ($matching.Count -gt 1) {
        throw "Device '$RequestedId' is ambiguous: multiple online Android devices match. Use an exact serial shown by 'flutter devices'. Available: $ids"
    }
    throw "Device '$RequestedId' is not connected. Use -DeviceId with a current Flutter serial (or 'emulator', 'wifi', 'usb', or 'auto'). Available: $ids"
}
