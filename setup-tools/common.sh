#!/usr/bin/env bash
# Shared helpers for interactive setup scripts.

set -o pipefail

VERBOSE="${VERBOSE:-0}"
NO_COLOR="${NO_COLOR:-0}"

setup_colors() {
  if [[ "$NO_COLOR" == "1" ]]; then
    C_RESET=''
    C_BOLD=''
    C_DIM=''
    C_BLUE=''
    C_GREEN=''
    C_YELLOW=''
    C_RED=''
  elif [[ -t 1 ]]; then
    C_RESET='\033[0m'
    C_BOLD='\033[1m'
    C_DIM='\033[2m'
    C_BLUE='\033[34m'
    C_GREEN='\033[32m'
    C_YELLOW='\033[33m'
    C_RED='\033[31m'
  else
    C_RESET=''
    C_BOLD=''
    C_DIM=''
    C_BLUE=''
    C_GREEN=''
    C_YELLOW=''
    C_RED=''
  fi
}

setup_colors

SETUP_NAME="${SETUP_NAME:-setup}"
STEP_INDEX=0
STEP_FAIL=0
CURRENT_STEP=""
FAILED_STEP=""
FAILED_CMD=""
FAILED_LOG=""
LAST_CMD_LOG=""

print_header() {
  local title="$1"
  printf "\n${C_BOLD}${C_BLUE}== %s ==${C_RESET}\n" "$title"
}

info() {
  printf "${C_DIM}[%s]${C_RESET} %s\n" "$SETUP_NAME" "$*"
}

warn() {
  printf "${C_YELLOW}[%s][warn]${C_RESET} %s\n" "$SETUP_NAME" "$*"
}

err() {
  printf "${C_RED}[%s][error]${C_RESET} %s\n" "$SETUP_NAME" "$*" >&2
}

step() {
  STEP_INDEX=$((STEP_INDEX + 1))
  CURRENT_STEP="$*"
  printf "\n${C_BOLD}%d) %s${C_RESET}\n" "$STEP_INDEX" "$*"
}

pass() {
  printf "   ${C_GREEN}✔ %s${C_RESET}\n" "$*"
}

fail_msg() {
  printf "   ${C_RED}✖ %s${C_RESET}\n" "$*" >&2
}

run_check() {
  local label="$1"
  shift
  printf "   • %s ... " "$label"
  if "$@" >/dev/null 2>&1; then
    printf "${C_GREEN}PASS${C_RESET}\n"
    return 0
  fi
  printf "${C_RED}FAIL${C_RESET}\n"
  return 1
}

run_cmd() {
  local label="$1"
  shift
  printf "   • %s ... " "$label"
  local rc=0
  if [[ "$VERBOSE" == "1" ]]; then
    printf "\n"
    "$@" || rc=$?
    if [[ "$rc" -eq 0 ]]; then
      printf "   ${C_GREEN}DONE${C_RESET}\n"
      return 0
    fi
    printf "   ${C_RED}FAILED${C_RESET} (exit=%d)\n" "$rc"
    FAILED_CMD="$label"
    return "$rc"
  fi

  local log
  log="$(mktemp -t groove-setup.XXXXXX.log)"
  LAST_CMD_LOG="$log"
  "$@" >"$log" 2>&1 || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    printf "${C_GREEN}DONE${C_RESET}\n"
    rm -f "$log"
    LAST_CMD_LOG=""
    return 0
  fi
  printf "${C_RED}FAILED${C_RESET} (exit=%d)\n" "$rc"
  printf "   ${C_DIM}--- last 20 lines of output (full log: %s) ---${C_RESET}\n" "$log"
  tail -n 20 "$log" | sed 's/^/   │ /'
  printf "   ${C_DIM}--- end of output ---${C_RESET}\n"
  FAILED_CMD="$label"
  FAILED_LOG="$log"
  return "$rc"
}

on_error_trap() {
  local line_no="$1"
  STEP_FAIL=1
  FAILED_STEP="${CURRENT_STEP:-(before first step)}"
  err "setup failed at line ${line_no} during step: ${FAILED_STEP}"
  if [[ -n "$FAILED_CMD" ]]; then
    err "failing command: ${FAILED_CMD}"
  fi
  if [[ -n "$FAILED_LOG" && -f "$FAILED_LOG" ]]; then
    err "full output: ${FAILED_LOG}"
  fi
  err "scroll up to the failed step and fix it, then re-run this script."
}

summary() {
  print_header "Summary"
  if [[ "$STEP_FAIL" -eq 0 ]]; then
    pass "${SETUP_NAME} completed successfully"
  else
    fail_msg "${SETUP_NAME} did not complete"
    if [[ -n "$FAILED_STEP" ]]; then
      fail_msg "failed at step: ${FAILED_STEP}"
    fi
    if [[ -n "$FAILED_CMD" ]]; then
      fail_msg "failing command: ${FAILED_CMD}"
    fi
    if [[ -n "$FAILED_LOG" && -f "$FAILED_LOG" ]]; then
      fail_msg "full output: ${FAILED_LOG}"
      info "re-run with --verbose for live output, or inspect the log above"
    else
      info "re-run with --verbose to see live command output"
    fi
  fi
}
