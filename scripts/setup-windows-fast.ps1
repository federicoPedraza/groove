$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  Write-Host "[setup-windows-fast] $Message"
}

function Write-Warn {
  param([string]$Message)
  Write-Warning "[setup-windows-fast] $Message"
}

function Throw-Fail {
  param([string]$Message)
  throw "[setup-windows-fast] $Message"
}

function Show-Usage {
  Write-Host "usage: .\powershell\setup-windows-fast.ps1"
  Write-Host ""
  Write-Host "quickly validates Windows dev prerequisites for Groove."
}

function Assert-Command {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$InstallHint
  )

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Throw-Fail "$Name is required but missing. $InstallHint"
  }

  Write-Log "found $Name at $($cmd.Source)"
}

function Test-WebView2Runtime {
  $paths = @(
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )

  foreach ($path in $paths) {
    if (Test-Path $path) {
      return $true
    }
  }

  return $false
}

if ($args.Count -gt 0) {
  if ($args[0] -in @("-h", "--help")) {
    Show-Usage
    exit 0
  }

  Show-Usage
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

try {
  Write-Log "starting Windows fast setup"

  Assert-Command -Name "node" -InstallHint "Install Node.js LTS: https://nodejs.org/en/download"
  Assert-Command -Name "npm" -InstallHint "Install Node.js LTS: https://nodejs.org/en/download"
  Assert-Command -Name "rustc" -InstallHint "Install Rust with rustup: https://rustup.rs/"
  Assert-Command -Name "cargo" -InstallHint "Install Rust with rustup: https://rustup.rs/"

  if (Test-WebView2Runtime) {
    Write-Log "WebView2 Runtime appears to be installed"
  }
  else {
    Write-Warn "WebView2 Runtime was not detected. Install it if Tauri app startup fails: https://developer.microsoft.com/en-us/microsoft-edge/webview2/"
  }

  Push-Location $repoRoot
  try {
    Write-Log "installing project dependencies with npm"
    npm install

    Write-Log "running rust sanity check"
    npm run check:rust

    Write-Log "checking Windows sidecars"
    & "$repoRoot\powershell\check-windows-sidecars.ps1"
  }
  finally {
    Pop-Location
  }

  Write-Log "setup complete"
  Write-Log "next step: npm run tauri:dev"
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
