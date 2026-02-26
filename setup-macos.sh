#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$script_dir"

SETUP_NAME="setup-macos"
# shellcheck disable=SC1091
source "$repo_root/setup-tools/common.sh"

trap 'on_error_trap $LINENO' ERR
trap 'summary' EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      cat <<'EOF'
usage:
  ./setup-macos.sh [--verbose] [--no-color]

Step-by-step macOS setup with visible checks and status output.
Builds macOS distributables as part of setup.

options:
  --verbose   show full command output while running steps
  --no-color  disable ANSI color output
EOF
      exit 0
      ;;
    --verbose)
      VERBOSE=1
      export VERBOSE
      shift
      ;;
    --no-color)
      NO_COLOR=1
      export NO_COLOR
      shift
      ;;
    *)
      err "unexpected argument: $1"
      exit 1
      ;;
  esac
done

setup_colors

print_header "Groove macOS Setup"
info "Repository: $repo_root"

step "Validate operating system"
if [[ "$(uname -s)" != "Darwin" ]]; then
  fail_msg "this script only supports macOS"
  exit 1
fi
pass "macOS detected"

step "Preflight checks"
run_check "node is available" command -v node || { err "Install Node.js LTS: https://nodejs.org/en/download"; exit 1; }
run_check "npm is available" command -v npm || { err "Install npm (bundled with Node.js)"; exit 1; }
run_check "rustc is available" command -v rustc || { err "Install Rust via rustup: https://rustup.rs/"; exit 1; }
run_check "cargo is available" command -v cargo || { err "Install Rust via rustup: https://rustup.rs/"; exit 1; }
pass "Prerequisites look good"

step "Show detected versions"
info "node:  $(node -v)"
info "npm:   $(npm -v)"
info "rustc: $(rustc --version)"

step "Run fast macOS setup"
cd "$repo_root"
run_cmd "executing ./bash/setup-macos-fast" ./bash/setup-macos-fast
pass "Fast setup completed"

step "Validate macOS sidecar readiness"
run_cmd "executing ./bash/check-macos-sidecars" ./bash/check-macos-sidecars
pass "macOS sidecar check passed"

step "Build macOS distributables"
run_cmd "running npm run tauri:build:macos" npm run tauri:build:macos

macos_bundle_dir="$repo_root/src-tauri/target/release/bundle"
if find "$macos_bundle_dir" -type f -name "*.dmg" | grep -q .; then
  pass "macOS build artifacts generated in $macos_bundle_dir"
else
  fail_msg "No macOS dmg artifact found in $macos_bundle_dir"
  exit 1
fi

step "Install/update local runnable Groove application"
latest_dmg="$(find "$macos_bundle_dir" -type f -name "*.dmg" | sort | tail -n 1)"
if [[ -z "$latest_dmg" ]]; then
  fail_msg "Could not locate a built dmg to install"
  exit 1
fi

mountpoint="$(mktemp -d /tmp/groove-dmg.XXXXXX)"
cleanup_mount() {
  hdiutil detach "$mountpoint" >/dev/null 2>&1 || true
  rmdir "$mountpoint" >/dev/null 2>&1 || true
}

hdiutil attach "$latest_dmg" -mountpoint "$mountpoint" -nobrowse -quiet
app_in_dmg="$(find "$mountpoint" -maxdepth 1 -type d -name "*.app" | head -n 1)"
if [[ -z "$app_in_dmg" ]]; then
  cleanup_mount
  fail_msg "No .app bundle found inside dmg"
  exit 1
fi

app_dir="$HOME/Applications"
mkdir -p "$app_dir"
rsync -a --delete "$app_in_dmg/" "$app_dir/Groove.app/"
cleanup_mount

pass "Installed/updated: $app_dir/Groove.app"

step "Next actions"
info "Artifacts available at: $macos_bundle_dir"
info "Launch Groove from Spotlight/Launchpad or: open \"$app_dir/Groove.app\""
info "Run: npm run tauri:dev (development mode)"
pass "You're ready on macOS"
