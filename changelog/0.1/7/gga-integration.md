# Changelog 0.1.7 — GGA Backend Integration Plan

## Goal
Integrate **Gentleman Guardian Angel (GGA)** into Groove at the backend/runtime layer so commit-time AI review can be orchestrated from Tauri commands, without requiring frontend-specific logic.

---

## Scope (Backend Only)
This document covers:
- Rust/Tauri command surface
- Process execution model
- Repo/worktree detection
- Hook/bootstrap automation
- Error handling and observability

This document does **not** cover UI components or frontend wiring.

---

## Integration Model

### 1) Backend capability detection
Add backend checks to determine if GGA can run in the current workspace/worktree:
- Is this path a Git repo?
- Is `gga` available on `PATH`?
- Does `.gga` exist in repo root?
- Is the target rules file present (default `AGENTS.md`)?
- Is the pre-commit hook installed (`.git/hooks/pre-commit` contains gga invocation)?

Expose this as a single command:
- `check_gga_status(worktree_path) -> GgaStatus`

### 2) Backend command execution wrapper
Implement a shared safe runner for GGA subprocesses:
- Execute with worktree directory as `cwd`
- Capture stdout/stderr + exit code
- Enforce timeout (configurable, e.g. 300s)
- Stream progress events to Tauri event bus (optional but recommended)
- Normalize failures into typed backend errors

This wrapper is reused for:
- `gga init`
- `gga install`
- `gga run`
- `gga run --ci`
- `gga run --pr-mode --diff-only`

### 3) Hook/bootstrap orchestration
Add backend flows to initialize and enforce consistency:

- `gga_init(worktree_path)`
  - Runs `gga init` only if `.gga` is missing.

- `gga_install_hook(worktree_path, mode)`
  - Runs `gga install` (or `--commit-msg`).
  - Verifies hook file updated.

- `gga_sync_rules(worktree_path)`
  - Ensures `.gga` points to `RULES_FILE="AGENTS.md"` (or configured file).
  - Patches/creates `.gga` keys idempotently.

### 4) Review execution endpoints
Expose backend commands to trigger reviews from any caller:

- `gga_run_staged(worktree_path, no_cache: bool)`
  - Executes `gga run [--no-cache]`

- `gga_run_ci(worktree_path)`
  - Executes `gga run --ci`

- `gga_run_pr(worktree_path, diff_only: bool)`
  - Executes `gga run --pr-mode [--diff-only]`

Each command returns structured output:
- status: passed | failed | error | timeout
- violations summary (parsed from stdout when possible)
- raw logs (trimmed for size)
- duration_ms

### 5) Optional auto-guard in backend commit path
If Groove backend already exposes commit orchestration commands, add a pre-commit guard:
1. Run `gga_run_staged`
2. If failed, block commit command with actionable error
3. If passed, continue commit flow

This keeps behavior consistent even if local hook is missing.

---

## Suggested Rust Contracts

```rust
pub struct GgaStatus {
    pub available: bool,
    pub version: Option<String>,
    pub repo_detected: bool,
    pub config_present: bool,
    pub rules_file: Option<String>,
    pub rules_present: bool,
    pub hook_installed: bool,
    pub provider: Option<String>,
}

pub enum GgaRunState {
    Passed,
    Failed,
    Error,
    Timeout,
}

pub struct GgaRunResult {
    pub state: GgaRunState,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub summary: Option<String>,
    pub violations: Vec<String>,
    pub stdout: String,
    pub stderr: String,
}
```

Tauri commands (example names):
- `check_gga_status`
- `gga_init`
- `gga_install_hook`
- `gga_sync_rules`
- `gga_run_staged`
- `gga_run_ci`
- `gga_run_pr`

---

## Process & Security Considerations

- Never execute in a non-repo path.
- Resolve worktree path canonically before command execution.
- Reject path traversal inputs.
- Use explicit timeout + cancellation support.
- Redact sensitive env vars from logs.
- Prefer allowlisted command args over free-form shell strings.
- Keep subprocess execution local-only (no backend-initiated network calls except what provider CLIs do on user machine).

---

## Failure Modes and Backend Responses

1. `gga` not installed
- Return typed `DependencyMissing("gga")`
- Suggest installation command in message metadata.

2. Provider CLI unavailable (e.g., claude/codex/opencode missing)
- Return `ProviderUnavailable`
- Include detected provider from `.gga`.

3. `.gga` missing or malformed
- Return `ConfigInvalid`
- Include `gga init` remediation hint.

4. Rules file missing
- Return `RulesFileMissing`
- Include expected path.

5. Timeout
- Return `Timeout`
- Include elapsed time and suggest smaller review scope (`--diff-only`, cache enabled).

---

## Logging & Observability

Backend should emit structured logs per run:
- `run_id`
- worktree path hash/id
- command mode (`staged|ci|pr`)
- exit code/state
- duration
- violation count (if parsable)

Recommended event names:
- `gga://run-start`
- `gga://run-progress`
- `gga://run-complete`
- `gga://run-error`

---

## Rollout Plan (0.1.7)

### Phase 1 (required)
- Add status detection + staged run command.
- Add init/install/sync backend commands.
- Add typed errors and timeout handling.

### Phase 2 (recommended)
- Add CI/PR mode commands.
- Add commit-path auto-guard fallback.
- Add event streaming for long-running reviews.

### Phase 3 (optional)
- Cache awareness surfaced from backend.
- Multi-worktree batch review command.
- Policy profiles per repository.

---

## Acceptance Criteria

- Backend can detect and report GGA readiness for any Groove worktree.
- Backend can initialize config and install hook idempotently.
- Backend can run staged review and return structured result.
- Failures are typed, actionable, and non-crashing.
- Commands are path-safe and timeout-safe.

---

## Notes
This backend-first design keeps GGA integration portable and testable. Any frontend or automation surface can consume the same Tauri commands without duplicating process logic.