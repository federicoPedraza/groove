$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  Write-Host "[check-windows-sidecars] $Message"
}

function Write-Fail {
  param([string]$Message)
  Write-Error "[check-windows-sidecars] $Message"
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

$candidates = @(
  "src-tauri/binaries/groove-x86_64-pc-windows-msvc.exe",
  "src-tauri/binaries/groove-aarch64-pc-windows-msvc.exe"
)

$existing = @()
foreach ($relativePath in $candidates) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (Test-Path -Path $fullPath -PathType Leaf) {
    Write-Log "PASS present: $relativePath"
    $existing += $relativePath
  }
  else {
    Write-Log "MISS not found: $relativePath"
  }
}

if ($existing.Count -eq 0) {
  Write-Fail "FAIL missing Windows sidecar. Add one of: $($candidates -join ', ')"
}

Write-Log "PASS Windows sidecar check passed"
