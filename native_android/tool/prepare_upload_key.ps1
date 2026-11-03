<#
Run locally on Windows only when the existing upload keystore cannot be recovered.
Java prompts for the new password directly; no password is written to this script,
the command line, Git, or the console output. This does not register or reset a key.
#>
[CmdletBinding()]
param(
    [string]$Directory = (Join-Path $env:LOCALAPPDATA 'Pamtech\VOP\Signing')
)

$ErrorActionPreference = 'Stop'
$keytool = Get-Command keytool -CommandType Application -ErrorAction SilentlyContinue
if (!$keytool) { throw 'Install a trusted Java JDK or add its bin directory to PATH, then run again.' }

$directoryPath = [IO.Path]::GetFullPath($Directory)
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ($directoryPath.Equals($repository, [StringComparison]::OrdinalIgnoreCase) -or
    $directoryPath.StartsWith($repository.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Keep the private signing directory outside the repository.'
}
$keystore = Join-Path $directoryPath 'vop-upload-key.jks'
$certificate = Join-Path $directoryPath 'vop-upload-certificate.pem'
if ((Test-Path -LiteralPath $keystore) -or (Test-Path -LiteralPath $certificate)) {
    throw 'A key or certificate already exists here. Preserve it; choose a new directory only if a replacement is needed.'
}
New-Item -ItemType Directory -Path $directoryPath -Force | Out-Null

Write-Host 'Create a strong upload-keystore password in the Java prompt and keep it in your password manager.'
& $keytool.Source -genkeypair -keystore $keystore -storetype JKS -alias upload -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=VOP Upload'
if ($LASTEXITCODE -ne 0) { throw 'Key creation failed. No reset was submitted.' }
& $keytool.Source -exportcert -rfc -keystore $keystore -alias upload -file $certificate
if ($LASTEXITCODE -ne 0) { throw 'Certificate export failed. Preserve the keystore and retry the export with its password.' }

Write-Host "Public certificate for Play Console: $certificate"
Write-Host 'Upload only the PEM certificate to the upload-key reset form, and await Google approval.'
Write-Host 'Keep the JKS and its password in a separate encrypted backup. Never upload either to chat or Git.'
Write-Host 'After approval, configure the six Actions secrets described in PLAY_RELEASE_RECOVERY.md.'
