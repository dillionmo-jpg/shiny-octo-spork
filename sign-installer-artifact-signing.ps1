param(
  [string]$InstallerPath = "downloads\NittoLegendsV2Setup.exe",
  [string]$MetadataPath = ".artifact-signing\metadata.json",
  [string]$SignToolPath = "",
  [string]$DlibPath = "",
  [string]$TimestampUrl = "http://timestamp.acs.microsoft.com"
)

$ErrorActionPreference = "Stop"

function Resolve-SignTool {
  if ($SignToolPath) {
    return (Resolve-Path -LiteralPath $SignToolPath).Path
  }

  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $kitRoots = @(
    "C:\Program Files (x86)\Windows Kits\10\bin",
    "C:\Program Files\Windows Kits\10\bin"
  )

  foreach ($root in $kitRoots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "signtool.exe was not found. Install the Windows SDK or Visual Studio Build Tools."
}

function Resolve-ArtifactSigningDlib {
  if ($DlibPath) {
    return (Resolve-Path -LiteralPath $DlibPath).Path
  }

  $candidates = @()

  if ($env:ARTIFACT_SIGNING_DLIB_PATH) {
    $candidates += $env:ARTIFACT_SIGNING_DLIB_PATH
  }

  $candidates += @(
    "$env:LOCALAPPDATA\Microsoft\MicrosoftArtifactSigningClientTools\Azure.CodeSigning.Dlib.dll",
    "$env:LOCALAPPDATA\Microsoft\ArtifactSigningTools\Azure.CodeSigning.Dlib.dll"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "Azure.CodeSigning.Dlib.dll was not found. Install Microsoft.Azure.ArtifactSigningClientTools or pass -DlibPath."
}

function Test-ArtifactSigningMetadata {
  param([string]$Path)

  $metadata = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  foreach ($requiredKey in @("Endpoint", "CodeSigningAccountName", "CertificateProfileName")) {
    if (-not $metadata.$requiredKey -or [string]::IsNullOrWhiteSpace([string]$metadata.$requiredKey)) {
      throw "Artifact Signing metadata is missing required key '$requiredKey'."
    }
  }
}

$resolvedInstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$resolvedMetadataPath = (Resolve-Path -LiteralPath $MetadataPath).Path
$signTool = Resolve-SignTool
$dlib = Resolve-ArtifactSigningDlib

Test-ArtifactSigningMetadata -Path $resolvedMetadataPath

$args = @(
  "sign",
  "/v",
  "/debug",
  "/fd", "SHA256",
  "/tr", $TimestampUrl,
  "/td", "SHA256",
  "/dlib", $dlib,
  "/dmdf", $resolvedMetadataPath,
  $resolvedInstallerPath
)

& $signTool @args
if ($LASTEXITCODE -ne 0) {
  throw "signtool sign failed with exit code $LASTEXITCODE"
}

& $signTool verify /pa /v $resolvedInstallerPath
if ($LASTEXITCODE -ne 0) {
  throw "signtool verify failed with exit code $LASTEXITCODE"
}

Get-AuthenticodeSignature $resolvedInstallerPath | Format-List Status,Subject,SignerCertificate,StatusMessage
