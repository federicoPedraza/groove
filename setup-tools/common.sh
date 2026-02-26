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
  if [[ "$VERBOSE" == "1" ]]; then
    printf "\n"
    if "$@"; then
      printf "   ${C_GREEN}DONE${C_RESET}\n"
      return 0
    fi
    printf "   ${C_RED}FAILED${C_RESET}\n"
    return 1
  fi

  if "$@"; then
    printf "${C_GREEN}DONE${C_RESET}\n"
    return 0
  fi
  printf "${C_RED}FAILED${C_RESET}\n"
  return 1
}

on_error_trap() {
  local line_no="$1"
  STEP_FAIL=1
  err "setup failed at line ${line_no}."
  err "scroll up to the failed step and fix it, then re-run this script."
}

summary() {
  print_header "Summary"
  if [[ "$STEP_FAIL" -eq 0 ]]; then
    pass "${SETUP_NAME} completed successfully"
  else
    fail_msg "${SETUP_NAME} did not complete"
  fi
}
