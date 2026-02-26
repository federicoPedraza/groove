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

step "Next actions"
info "Run: npm run tauri:dev"
pass "You're ready to develop on Linux"
