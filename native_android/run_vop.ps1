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
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot "tool\flutter_device_parser.ps1")

function Require-Flutter {
    if (!(Get-Command flutter -ErrorAction SilentlyContinue)) {
        throw "Flutter is not installed or is not on PATH. Run flutter doctor after installing Flutter."
    }
}

function Resolve-Adb {
    $command = Get-Command adb -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
    if ($env:LOCALAPPDATA) {
        $sdkRoots += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    }
    foreach ($sdkRoot in $sdkRoots) {
        if ([string]::IsNullOrWhiteSpace($sdkRoot)) { continue }
        $candidate = Join-Path $sdkRoot "platform-tools\adb.exe"
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "adb was not found. Install Android SDK Platform-Tools in Android Studio (SDK Manager)."
}

function Get-AndroidDevices {
    $deviceLines = @(& flutter devices)
    if ($LASTEXITCODE -ne 0) {
        throw "Flutter could not list devices. Run flutter doctor -v."
    }
    $devices = @(ConvertFrom-FlutterDeviceText -Lines $deviceLines)
    $emulators = @($devices | Where-Object { $_.emulator -eq $true })
    if ($emulators.Count -gt 0) {
        try {
            $adb = Resolve-Adb
            foreach ($device in $emulators) {
                $rawAvd = @(& $adb -s ([string]$device.id) emu avd name 2>$null)
                if ($LASTEXITCODE -ne 0) { continue }
                $name = @($rawAvd | ForEach-Object { ([string]$_).Trim() } |
                    Where-Object { $_ -and $_ -ne 'OK' } | Select-Object -First 1)
                if ($name.Count -gt 0) { $device.emulatorId = [string]$name[0] }
            }
        } catch {
            Write-Verbose "ADB could not identify one or more emulator AVD names."
        }
    }
    return $devices
}

function Resolve-AndroidEmulatorExecutable {
    $candidate = Get-Command emulator.exe -ErrorAction SilentlyContinue
    if ($candidate) { return $candidate.Source }
    $roots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)
    if ($env:LOCALAPPDATA) {
        $roots += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
    }
    foreach ($root in $roots) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        $path = Join-Path $root "emulator\emulator.exe"
        if (Test-Path -LiteralPath $path) { return $path }
    }
    return ""
}

function Get-AvailableEmulators {
    $lines = @(& flutter emulators)
    $flutterAvds = if ($LASTEXITCODE -eq 0) {
        @(ConvertFrom-FlutterEmulatorText -Lines $lines)
    } else { @() }
    if ($flutterAvds.Count -gt 0) { return $flutterAvds }

    # Use Android's own emulator inventory if Flutter prints an alternate
    # table layout that cannot be parsed by the PowerShell console.
    $emulatorExecutable = Resolve-AndroidEmulatorExecutable
    if ($emulatorExecutable) {
        $sdkAvds = @(& $emulatorExecutable -list-avds)
        if ($LASTEXITCODE -eq 0) {
            $fromSdk = @(ConvertFrom-AndroidAvdList -Lines $sdkAvds)
            if ($fromSdk.Count -gt 0) { return $fromSdk }
        }
    }
    return @()
}

function Select-Target($devices, [string]$requested, [string]$kind) {
    $matching = @($devices)
    if ($requested) {
        $choice = @($matching | Where-Object { $_.id -eq $requested })
        if ($choice.Count -ne 1) {
            $ids = ($matching | ForEach-Object { "$($_.name) [$($_.id)]" }) -join ", "
            throw "Device '$requested' is not a detected $kind target. Available: $ids"
        }
        return [string]$choice[0].id
    }
    if ($matching.Count -eq 0) { throw "No $kind target found. Run .\run_vop.ps1 -Mode List." }
    if ($matching.Count -eq 1) {
        Write-Host "Using $($matching[0].name) [$($matching[0].id)]"
        return [string]$matching[0].id
    }
    Write-Host "Available $kind targets:"
    for ($i = 0; $i -lt $matching.Count; $i++) {
        Write-Host ("  {0}. {1} ({2})" -f ($i + 1), $matching[$i].name, $matching[$i].id)
    }
    $answer = Read-Host "Select target number"
    $number = 0
    if (![int]::TryParse($answer, [ref]$number) -or $number -lt 1 -or $number -gt $matching.Count) {
        throw "Choose a number from 1 to $($matching.Count)."
    }
    return [string]$matching[$number - 1].id
}

function Start-Native([string]$targetId) {
    $args = @{
        DeviceId = $targetId
        EnvFile = $EnvFile
        RepairSharePlus = [bool]$RepairSharePlus
        UseVercelEnv = [bool]$UseVercelEnv
        VercelEnvironment = $VercelEnvironment
    }
    & (Join-Path $PSScriptRoot "run_android.ps1") @args
    if (!$?) { throw "VOP Flutter launch failed." }
}

function Start-Browser([string]$url) {
    $executable = switch ($Browser) {
        "Chrome" { "chrome.exe" }
        "Edge" { "msedge.exe" }
        default { "" }
    }
    if ($executable) {
        $command = Get-Command $executable -ErrorAction SilentlyContinue
        $location = if ($command) { $command.Source } else { "" }
        if (!$location) {
            $browserFolder = if ($Browser -eq "Chrome") {
                "Google\Chrome\Application"
            } else {
                "Microsoft\Edge\Application"
            }
            $installRoots = @(
                $env:ProgramFiles,
                [Environment]::GetEnvironmentVariable("ProgramFiles(x86)"),
                $env:LOCALAPPDATA
            )
            foreach ($installRoot in $installRoots) {
                if ([string]::IsNullOrWhiteSpace($installRoot)) { continue }
                $candidate = Join-Path (Join-Path $installRoot $browserFolder) $executable
                if (Test-Path -LiteralPath $candidate) { $location = $candidate; break }
            }
        }
        if (!$location) {
            throw "$Browser executable not found. Retry with -Browser Default."
        }
        Start-Process -FilePath $location -ArgumentList $url
    } else {
        Start-Process -FilePath $url
    }
}

function Assert-WirelessAddress([string]$address) {
    if ($address -notmatch '^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$') {
        throw "Use the IP:port shown in Android Wireless debugging (for example, 192.168.1.10:37123)."
    }
    $parts = $address.Split(":")
    $validIp = $null
    $port = [int]$parts[1]
    if (![System.Net.IPAddress]::TryParse($parts[0], [ref]$validIp) -or
        $port -lt 1 -or $port -gt 65535) {
        throw "The Wi-Fi debugging IP or port is invalid."
    }
}

function Test-WirelessDeviceId([string]$deviceId) {
    return $deviceId -match '(:[0-9]+$|adb-tls-connect)'
}

function Start-Wireless {
    Write-Host "Android 11+ wireless debugging: computer and phone must share a Wi-Fi network."
    Write-Host "Phone: Settings > Developer options > Wireless debugging."
    $adb = Resolve-Adb
    $pair = $PairAddress
    $connect = $ConnectAddress
    $connected = @(Get-AndroidDevices | Where-Object {
        $_.emulator -ne $true -and (Test-WirelessDeviceId ([string]$_.id))
    })
    if (!$pair -and !$connect -and $connected.Count -eq 0) {
        $pair = Read-Host "Pairing IP:port (from 'Pair device with pairing code'; Enter to skip if already paired)"
    }
    if ($pair) {
        Assert-WirelessAddress $pair
        Write-Host "Enter the phone's pairing code in the adb prompt. Do not put the code in a script."
        & $adb pair $pair
        if ($LASTEXITCODE -ne 0) { throw "ADB wireless pairing failed. Check the pairing IP, port and code." }
    }
    if (!$connect -and ($pair -or $connected.Count -eq 0)) {
        $connect = Read-Host "Device IP:port (from the main Wireless debugging screen, not the pairing popup)"
    }
    if ($connect) {
        Assert-WirelessAddress $connect
        & $adb connect $connect
        if ($LASTEXITCODE -ne 0) { throw "ADB wireless connection failed. Check Wi-Fi and device port." }
    }
    $targets = @()
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $targets = @(Get-AndroidDevices | Where-Object {
            $_.emulator -ne $true -and (Test-WirelessDeviceId ([string]$_.id))
        })
        if ($targets.Count -gt 0) { break }
        Start-Sleep -Seconds 2
    }
    $selected = Select-Target $targets $DeviceId "Wi-Fi Android"
    Start-Native $selected
}

function Start-Emulator {
    if ($DeviceId -and $EmulatorId) {
        Write-Verbose "The launcher will verify that the running device ID belongs to the requested AVD."
    }
    $running = @(Get-AndroidDevices | Where-Object { $_.emulator -eq $true -or $_.id -match '^emulator-\d+$' })
    if ($EmulatorId) {
        $alreadyStarted = @($running | Where-Object { $_.emulatorId -eq $EmulatorId })
        if ($alreadyStarted.Count -gt 0) {
            if ($ColdBoot -or $SoftwareGraphics) {
                throw "The $EmulatorId AVD is already running. Shut it down in Android Studio Device Manager before changing boot or graphics options."
            }
            Start-Native (Select-Target $alreadyStarted $DeviceId "Android emulator")
            return
        }
        $target = $EmulatorId
    } elseif ($running.Count -gt 0) {
        if ($ColdBoot -or $SoftwareGraphics) {
            throw "An Android emulator is already running. Stop it first or specify -EmulatorId for a different AVD."
        }
        Start-Native (Select-Target $running $DeviceId "Android emulator")
        return
    } else {
        $androidEmulators = @(Get-AvailableEmulators)
        if ($androidEmulators.Count -eq 0) {
            throw "No Android Virtual Device detected. Check 'flutter emulators' or Android Studio > Device Manager."
        }
        $target = Select-Target $androidEmulators "" "Android virtual device"
    }

    # Do not print locally downloaded Vercel env data or access Vercel yet.
    # Only after an actual Android device is ready will Start-Native build VOP.
    $emulatorExecutable = Resolve-AndroidEmulatorExecutable
    $emulatorProcess = $null
    $stdOutPath = ""
    $stdErrPath = ""
    if ($ColdBoot -or $SoftwareGraphics) {
        if (!$emulatorExecutable) {
            throw "Android SDK emulator.exe was not found. Configure ANDROID_SDK_ROOT or install Android Emulator in Android Studio SDK Manager."
        }
        $flags = @("-avd", $target)
        if ($ColdBoot) { $flags += "-no-snapshot-load" }
        if ($SoftwareGraphics) { $flags += @("-gpu", "software") }
        # Keep emulator logs outside the Git working tree and never put Firebase
        # or Vercel environment values in the emulator argument list.
        $logRoot = Join-Path ([IO.Path]::GetTempPath()) "vop-android-emulator"
        if (!(Test-Path -LiteralPath $logRoot)) { New-Item -ItemType Directory -Path $logRoot -Force | Out-Null }
        $logId = [Guid]::NewGuid().ToString("N")
        $stdOutPath = Join-Path $logRoot "avd-$logId-out.log"
        $stdErrPath = Join-Path $logRoot "avd-$logId-err.log"
        Write-Host "Launching Android AVD $target directly (ColdBoot=$([bool]$ColdBoot), SoftwareGraphics=$([bool]$SoftwareGraphics))..."
        $emulatorProcess = Start-Process -FilePath $emulatorExecutable -ArgumentList $flags -PassThru -RedirectStandardOutput $stdOutPath -RedirectStandardError $stdErrPath
    } else {
        Write-Host "Starting Android virtual device $target ..."
        & flutter emulators --launch $target
        $launchCode = $LASTEXITCODE
        if ($launchCode -ne 0) {
            $emulatorPath = if ($emulatorExecutable) { $emulatorExecutable } else { "emulator.exe" }
            throw "Android emulator $target failed to start (exit code $launchCode). This is an AVD/Android SDK error, not Firebase. Close the AVD in Device Manager, try Cold Boot Now, then retry with: .\run_vop.ps1 -Mode Emulator -EmulatorId '$target' -ColdBoot -SoftwareGraphics. For the underlying error run: & '$emulatorPath' -avd '$target' -verbose -no-snapshot-load -gpu software"
        }
    }

    Write-Host "Waiting for Android AVD $target to finish booting..."
    $selectedRunning = @()
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($emulatorProcess -and $emulatorProcess.HasExited) {
            $exitCode = $emulatorProcess.ExitCode
            if ($exitCode -eq 0) {
                # Some emulator launchers hand off the VM to a child process.
                # An exit-zero launcher is not itself an Android boot failure.
                $emulatorProcess = $null
                continue
            }
            Write-Warning "Android emulator process exited with code $exitCode."
            if (Test-Path -LiteralPath $stdErrPath) {
                Write-Host "Recent emulator diagnostics (stderr):"
                Get-Content -LiteralPath $stdErrPath -Tail 25 | ForEach-Object { Write-Host $_ }
            }
            if (Test-Path -LiteralPath $stdOutPath) {
                Write-Host "Recent emulator diagnostics (stdout):"
                Get-Content -LiteralPath $stdOutPath -Tail 15 | ForEach-Object { Write-Host $_ }
            }
            throw "AVD $target exited before Android boot completed. Fix the reported Android Emulator error; use Android Studio Device Manager for Cold Boot or graphics settings."
        }
        $nowRunning = @(Get-AndroidDevices | Where-Object {
            $_.emulator -eq $true -or $_.id -match '^emulator-\d+$'
        })
        # Never run on an unrelated emulator that happens to come online.
        $selectedRunning = @($nowRunning | Where-Object { $_.emulatorId -eq $target })
        if ($selectedRunning.Count -gt 0) {
            $adb = Resolve-Adb
            $ready = @(& $adb -s ([string]$selectedRunning[0].id) shell getprop sys.boot_completed 2>$null)
            if ($LASTEXITCODE -eq 0 -and @($ready | ForEach-Object { ([string]$_).Trim() }) -contains "1") {
                Write-Host "Android $target is booted and ready."
                break
            }
        }
        $selectedRunning = @()
        Start-Sleep -Seconds 3
    }
    if ($selectedRunning.Count -eq 0) {
        $extra = if ($stdErrPath) { " Emulator error log: $stdErrPath" } else { "" }
        throw "AVD $target did not boot within the allotted time. Check Android Studio Device Manager or try -ColdBoot -SoftwareGraphics.$extra"
    }
    Start-Native (Select-Target $selectedRunning $DeviceId "Android emulator")
}

function Show-Targets {
    Write-Host "--- Flutter devices ---"
    & flutter devices
    Write-Host "--- Android emulators ---"
    & flutter emulators
    Write-Host "--- Android Debug Bridge devices ---"
    try {
        $adb = Resolve-Adb
        & $adb devices -l
    } catch {
        Write-Warning $_.Exception.Message
    }
}

if ($Mode -eq "Menu") {
    Write-Host ""
    Write-Host "VOP: choose a run target"
    Write-Host "  1  Android phone (USB)"
    Write-Host "  2  Android phone (Wi-Fi / wireless debugging)"
    Write-Host "  3  Android Studio emulator"
    Write-Host "  4  VOP web portal in browser (not the native APK)"
    Write-Host "  5  Android APK in a cloud browser emulator"
    Write-Host "  6  List connected devices and emulators"
    Write-Host "  0  Exit"
    $selection = Read-Host "Option"
    $Mode = switch ($selection) {
        "1" { "USB" }
        "2" { "WiFi" }
        "3" { "Emulator" }
        "4" { "Browser" }
        "5" { "Cloud" }
        "6" { "List" }
        "0" { return }
        default { throw "Invalid option." }
    }
}

if ($Mode -ne "Browser") { Require-Flutter }

switch ($Mode) {
    "USB" {
        $targets = @(Get-AndroidDevices | Where-Object {
            $_.emulator -ne $true -and !(Test-WirelessDeviceId ([string]$_.id))
        })
        Start-Native (Select-Target $targets $DeviceId "USB Android")
    }
    "WiFi" { Start-Wireless }
    "Emulator" { Start-Emulator }
    "Browser" {
        Write-Host "Opening the deployed VOP web portal, not the Android APK."
        Write-Host "For an actual Android APK in a browser, select -Mode Cloud."
        Start-Browser "https://vopafrica.vercel.app"
    }
    "Cloud" {
        Write-Host "Building the real Android debug APK; an upload to the cloud provider is a separate action."
        & (Join-Path $PSScriptRoot "run_android.ps1") -BuildApk -EnvFile $EnvFile -RepairSharePlus:$RepairSharePlus -UseVercelEnv:$UseVercelEnv -VercelEnvironment $VercelEnvironment
        if (!$?) { throw "VOP APK build failed." }
        $apk = Join-Path $PSScriptRoot "build\app\outputs\flutter-apk\app-debug.apk"
        if (!(Test-Path -LiteralPath $apk)) { throw "APK was not found at $apk" }
        Write-Host "APK ready: $apk"
        Write-Host "Upload it manually. Cloud emulators may not support actual phone biometric or passkey hardware."
        $uploadUrl = if ($CloudProvider -eq "BrowserStack") {
            "https://www.browserstack.com/app-live"
        } else {
            "https://appetize.io/upload"
        }
        Start-Browser $uploadUrl
    }
    "List" { Show-Targets }
}
