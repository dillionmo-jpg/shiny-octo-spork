param(
  [string]$InstallerPath = "downloads\NittoLegendsV2Setup.exe",
  [string]$Thumbprint = "",
  [string]$PfxPath = "",
  [string]$PfxPassword = "",
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

function Resolve-SignTool {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $kitRoots = @(
    "C:\Program Files (x86)\Windows Kits\10\bin",
    "C:\Program Files\Windows Kits\10\bin"
  )

  foreach ($root in $kitRoots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $candidate = Get-ChildItem $root -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "signtool.exe was not found. Install the Windows SDK or Visual Studio Build Tools."
}

$resolvedInstallerPath = Resolve-Path $InstallerPath
$signTool = Resolve-SignTool

if ($PfxPath) {
  $resolvedPfxPath = Resolve-Path $PfxPath
  $args = @(
    "sign",
    "/fd", "SHA256",
    "/tr", $TimestampUrl,
    "/td", "SHA256",
    "/f", $resolvedPfxPath
  )

  if ($PfxPassword) {
    $args += @("/p", $PfxPassword)
  }

  $args += $resolvedInstallerPath
} elseif ($Thumbprint) {
  $args = @(
    "sign",
    "/fd", "SHA256",
    "/tr", $TimestampUrl,
    "/td", "SHA256",
    "/sha1", $Thumbprint,
    $resolvedInstallerPath
  )
} else {
  throw "Provide either -Thumbprint for an installed cert or -PfxPath for a .pfx certificate."
}

& $signTool @args
if ($LASTEXITCODE -ne 0) {
  throw "signtool sign failed with exit code $LASTEXITCODE"
}

& $signTool verify /pa /v $resolvedInstallerPath
if ($LASTEXITCODE -ne 0) {
  throw "signtool verify failed with exit code $LASTEXITCODE"
}

Get-AuthenticodeSignature $resolvedInstallerPath | Format-List Status,Subject,SignerCertificate,StatusMessage
