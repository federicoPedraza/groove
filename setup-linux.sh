#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$script_dir"

SETUP_NAME="setup-linux"
# shellcheck disable=SC1091
source "$repo_root/setup-tools/common.sh"

trap 'on_error_trap $LINENO' ERR
trap 'summary' EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      cat <<'EOF'
usage:
  ./setup-linux.sh [--verbose] [--no-color]

Step-by-step Linux setup with visible checks and status output.
Builds Linux distributables as part of setup.

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

print_header "Groove Linux Setup"
info "Repository: $repo_root"

step "Validate operating system"
if [[ "$(uname -s)" != "Linux" ]]; then
  fail_msg "this script only supports Linux"
  exit 1
fi
pass "Linux detected"

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

step "Run fast Linux setup"
cd "$repo_root"
run_cmd "executing ./bash/setup-linux-fast" ./bash/setup-linux-fast
pass "Fast setup completed"

step "Validate Linux sidecar readiness"
run_cmd "executing ./bash/check-linux-sidecars" ./bash/check-linux-sidecars
pass "Linux sidecar check passed"

step "Build Linux distributables"
run_cmd "running npm run tauri:build:linux" npm run tauri:build:linux

linux_bundle_dir="$repo_root/src-tauri/target/release/bundle"
if find "$linux_bundle_dir" -type f \( -name "*.AppImage" -o -name "*.deb" \) | grep -q .; then
  pass "Linux build artifacts generated in $linux_bundle_dir"
else
  fail_msg "No Linux build artifacts found in $linux_bundle_dir"
  exit 1
fi

step "Ensure AppImage executables are marked executable"
appimage_count=0
while IFS= read -r appimage; do
  chmod +x "$appimage"
  appimage_count=$((appimage_count + 1))
done < <(find "$linux_bundle_dir" -type f -name "*.AppImage")
pass "Validated executable bit for $appimage_count AppImage file(s)"

step "Install/update local runnable Groove application"
latest_appimage="$(find "$linux_bundle_dir" -type f -name "*.AppImage" | sort | tail -n 1)"
if [[ -z "$latest_appimage" ]]; then
  fail_msg "Could not locate a built AppImage to install"
  exit 1
fi

app_dir="$HOME/Applications"
appimage_target="$app_dir/Groove.AppImage"
desktop_dir="$HOME/.local/share/applications"
desktop_file="$desktop_dir/groove.desktop"

mkdir -p "$app_dir" "$desktop_dir"
cp -f "$latest_appimage" "$appimage_target"
chmod +x "$appimage_target"

cat > "$desktop_file" <<EOF
[Desktop Entry]
Name=Groove
Comment=Worktree control center
Exec=$appimage_target %u
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=groove
MimeType=x-scheme-handler/groove;
Icon=applications-development
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi

pass "Installed/updated: $appimage_target"
pass "Desktop entry: $desktop_file"

step "Next actions"
info "Artifacts available at: $linux_bundle_dir"
info "Launch Groove from your app menu by searching: Groove"
info "Run: npm run tauri:dev (development mode)"
pass "You're ready on Linux"
