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

step "Detect package manager"
detect_pm() {
  if command -v pacman >/dev/null 2>&1; then echo "pacman"
  elif command -v dnf >/dev/null 2>&1; then echo "dnf"
  elif command -v apt-get >/dev/null 2>&1; then echo "apt"
  elif command -v zypper >/dev/null 2>&1; then echo "zypper"
  else echo "unknown"; fi
}
PM="$(detect_pm)"
if [[ "$PM" == "unknown" ]]; then
  err "No supported package manager found (apt, pacman, dnf, zypper)"
  exit 1
fi
pass "Using $PM"

get_sudo() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then echo ""
  elif command -v sudo >/dev/null 2>&1; then echo "sudo"
  else err "Need root or sudo to install packages"; exit 1; fi
}
SUDO_CMD="$(get_sudo)"

DEPS_JSON="$repo_root/scripts/linux-deps.json"

read_packages() {
  node -e "
    const d = require('$DEPS_JSON');
    const libs = d.required_libraries.map(l => l.packages['$PM']).filter(Boolean);
    const tools = d.build_toolchains.packages['$PM'] || [];
    console.log([...tools, ...libs].join('\n'));
  "
}

step "Install system dependencies via $PM"
packages=()
while IFS= read -r pkg; do
  [[ -n "$pkg" ]] && packages+=("$pkg")
done < <(read_packages)

if [[ ${#packages[@]} -eq 0 ]]; then
  warn "No packages found for $PM in linux-deps.json"
else
  info "Installing ${#packages[@]} packages: ${packages[*]}"
  case "$PM" in
    apt)
      run_cmd "apt-get update" $SUDO_CMD apt-get update -qq
      run_cmd "apt-get install" $SUDO_CMD apt-get install -y "${packages[@]}"
      ;;
    pacman)
      run_cmd "pacman install" $SUDO_CMD pacman -Syu --needed --noconfirm "${packages[@]}"
      ;;
    dnf)
      run_cmd "dnf install" $SUDO_CMD dnf install -y "${packages[@]}"
      ;;
    zypper)
      run_cmd "zypper install" $SUDO_CMD zypper install -y "${packages[@]}"
      ;;
  esac
  pass "System packages installed"
fi

step "Verify system dependencies"

# Refresh ldconfig cache after package installs
$SUDO_CMD ldconfig 2>/dev/null || true

check_targets="$(node -e "
  const d = require('$DEPS_JSON');
  for (const lib of d.required_libraries) {
    const apt = lib.packages.apt || '';
    const pac = lib.packages.pacman || '';
    const dnf = lib.packages.dnf || '';
    console.log([lib.name, lib.runtime_so, lib.pkg_config, apt, pac, dnf].join('|'));
  }
")"

# Check if a .so is present via ldconfig, pkg-config, or direct filesystem search
check_so() {
  local so_name="$1" pkg_config="$2"
  # 1) ldconfig cache
  if ldconfig -p 2>/dev/null | grep -q "$so_name"; then return 0; fi
  # 2) pkg-config
  if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists "$pkg_config" 2>/dev/null; then return 0; fi
  # 3) direct filesystem search (covers stale ldconfig cache)
  if find /usr/lib /lib -name "${so_name}*" -print -quit 2>/dev/null | grep -q .; then return 0; fi
  return 1
}

missing_count=0
missing_pkgs=()
while IFS='|' read -r name so_name pkg_config apt_pkg pacman_pkg dnf_pkg; do
  if check_so "$so_name" "$pkg_config"; then
    pass "$name ($so_name)"
  else
    fail_msg "$name ($so_name) — not found"
    case "$PM" in
      apt) [[ -n "$apt_pkg" ]] && missing_pkgs+=("$apt_pkg") ;;
      pacman) [[ -n "$pacman_pkg" ]] && missing_pkgs+=("$pacman_pkg") ;;
      dnf) [[ -n "$dnf_pkg" ]] && missing_pkgs+=("$dnf_pkg") ;;
    esac
    missing_count=$((missing_count + 1))
  fi
done <<< "$check_targets"

if [[ $missing_count -gt 0 && ${#missing_pkgs[@]} -gt 0 ]]; then
  info "Attempting to install $missing_count missing dep(s): ${missing_pkgs[*]}"
  case "$PM" in
    apt)    $SUDO_CMD apt-get update -qq && $SUDO_CMD apt-get install -y "${missing_pkgs[@]}" ;;
    pacman) $SUDO_CMD pacman -Syu --needed --noconfirm "${missing_pkgs[@]}" ;;
    dnf)    $SUDO_CMD dnf install -y "${missing_pkgs[@]}" ;;
    zypper) $SUDO_CMD zypper install -y "${missing_pkgs[@]}" ;;
  esac
  $SUDO_CMD ldconfig 2>/dev/null || true

  # Re-verify
  still_missing=0
  while IFS='|' read -r name so_name pkg_config apt_pkg pacman_pkg dnf_pkg; do
    check_so "$so_name" "$pkg_config" || still_missing=$((still_missing + 1))
  done <<< "$check_targets"

  if [[ $still_missing -gt 0 ]]; then
    err "$still_missing dependency(ies) still missing after install attempt"
    exit 1
  fi
  pass "All missing dependencies installed successfully"
elif [[ $missing_count -gt 0 ]]; then
  err "$missing_count dependency(ies) missing and no packages found for $PM"
  exit 1
fi
pass "All system dependencies present"

step "Install project dependencies"
cd "$repo_root"
run_cmd "npm install" npm install
pass "npm dependencies installed"

step "Rust sanity check"
run_cmd "cargo check" npm run check:rust
pass "Rust check passed"

step "Validate Linux sidecar readiness"
run_cmd "executing ./scripts/check-linux-sidecars" ./scripts/check-linux-sidecars
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

step "Install groove CLI"
cli_dir="$HOME/.local/bin"
mkdir -p "$cli_dir"
cp -f "$repo_root/scripts/groove" "$cli_dir/groove"
chmod +x "$cli_dir/groove"
pass "Installed: $cli_dir/groove"
if ! echo "$PATH" | tr ':' '\n' | grep -Fxq "$cli_dir"; then
  info "Add $cli_dir to your PATH if it is not already (e.g. export PATH=\"\$HOME/.local/bin:\$PATH\")"
fi

step "Next actions"
info "Artifacts available at: $linux_bundle_dir"
info "Launch Groove from your app menu by searching: Groove"
info "Run: npm run tauri:dev (development mode)"
pass "You're ready on Linux"
