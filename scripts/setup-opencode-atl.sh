#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="setup-opencode-atl"
PROFILE_VERSION="0.1.7"

default_atl_dir() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf '%s' "$HOME/Library/Application Support/agent-teams-lite"
    return
  fi

  printf '%s' "$HOME/.local/share/agent-teams-lite"
}

if [[ $# -lt 1 ]]; then
  printf "Usage: %s <worktree-path>\n" "$SCRIPT_NAME" >&2
  exit 1
fi

WORKTREE_PATH="$1"
if [[ ! -d "$WORKTREE_PATH" ]]; then
  printf "error: worktree path does not exist: %s\n" "$WORKTREE_PATH" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  printf "error: git is not available on PATH\n" >&2
  exit 1
fi

if [[ ! -d "$WORKTREE_PATH/.git" ]] && ! git -C "$WORKTREE_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf "error: path is not a git worktree: %s\n" "$WORKTREE_PATH" >&2
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  if [[ -x "$HOME/.opencode/bin/opencode" ]]; then
    printf "warning: opencode found at %s but not on PATH\n" "$HOME/.opencode/bin/opencode"
    printf "         add ~/.opencode/bin to PATH for backend flows\n"
  elif [[ "${SETUP_OPENCODE_ATL_ALLOW_MISSING_OPENCODE:-0}" == "1" ]]; then
    printf "warning: opencode binary is not available; continuing ATL setup only\n"
  else
    printf "error: opencode binary is not available\n" >&2
    exit 1
  fi
fi

ATL_DIR="${AGENT_TEAMS_LITE_DIR:-$(default_atl_dir)}"
ATL_REPO_URL="${ATL_REPO_URL:-https://github.com/Gentleman-Programming/agent-teams-lite}"
mkdir -p "$ATL_DIR"

if [[ -d "$ATL_DIR/.git" ]]; then
  printf "Updating Agent Teams Lite in %s\n" "$ATL_DIR"
  git -C "$ATL_DIR" fetch --all --tags
  git -C "$ATL_DIR" pull --ff-only
else
  if [[ -n "$(ls -A "$ATL_DIR")" ]]; then
    printf "error: target ATL dir is not empty and not a git repo: %s\n" "$ATL_DIR" >&2
    exit 1
  fi
  printf "Installing Agent Teams Lite into %s\n" "$ATL_DIR"
  git clone "$ATL_REPO_URL" "$ATL_DIR"
fi

GROOVE_DIR="$WORKTREE_PATH/.groove"
PROFILE_PATH="$GROOVE_DIR/opencode-profile.json"
mkdir -p "$GROOVE_DIR"

if [[ ! -f "$PROFILE_PATH" ]]; then
  cat > "$PROFILE_PATH" <<EOF
{
  "version": "$PROFILE_VERSION",
  "enabled": true,
  "artifact_store": "none",
  "default_flow": "sdd",
  "commands": {
    "init": "/sdd-init",
    "new_change": "/sdd-new",
    "continue": "/sdd-continue",
    "apply": "/sdd-apply",
    "verify": "/sdd-verify",
    "archive": "/sdd-archive"
  },
  "timeouts": {
    "phase_seconds": 900
  },
  "safety": {
    "require_user_approval_between_phases": true,
    "allow_parallel_spec_design": true
  }
}
EOF
  printf "Created %s\n" "$PROFILE_PATH"
else
  printf "Profile already exists: %s\n" "$PROFILE_PATH"
fi

printf "\nNext backend steps:\n"
printf "1) check_opencode_status(worktree_path=\"%s\")\n" "$WORKTREE_PATH"
printf "2) sync_opencode_config(worktree_path=\"%s\")\n" "$WORKTREE_PATH"
printf "3) run_opencode_flow(worktree_path=\"%s\", phase=\"init\", args=[])\n" "$WORKTREE_PATH"
printf "\nDone.\n"
