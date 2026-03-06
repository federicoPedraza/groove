# Changelog 0.1.7 — OpenCode Integration via Agent Teams Lite (Backend Plan)

## Goal
Enable Groove to manage and launch **OpenCode + Agent Teams Lite** workflows from backend commands, so OpenCode configuration is centralized and easy to apply per workspace/worktree.

---

## What Agent Teams Lite contributes
From `agent-teams-lite`, the useful part for Groove is the **orchestrated skill workflow** (`/sdd-init`, `/sdd-new`, `/sdd-continue`, `/sdd-apply`, `/sdd-verify`, etc.) and its **OpenCode support**.

At backend level, Groove should treat this as:
1. A local toolchain to bootstrap in repo/worktree.
2. A set of deterministic commands to execute.
3. A config contract Groove can read/write safely.

---

## Backend Integration Architecture

### 1) Capability detection (per worktree)
Add backend command:
- `check_opencode_status(worktree_path) -> OpenCodeStatus`

Detect:
- git repo present
- `opencode` binary on PATH
- agent-teams-lite installed (global skill dir or local cloned path)
- required skill files available
- repo-level config present (for selected mode)
- optional persistence backend readiness (`engram` / `openspec` / `none`)

### 2) Config profile model in Groove backend
Create a backend-managed file in repo:
- `.groove/opencode-profile.json`

This profile is the single source Groove edits, then syncs to OpenCode-facing config files.

Example:
```json
{
  "version": "0.1.7",
  "enabled": true,
  "artifact_store": "engram",
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
```

### 3) Config sync adapter (Groove backend → OpenCode files)
Add command:
- `sync_opencode_config(worktree_path)`

Responsibilities:
- Read `.groove/opencode-profile.json`
- Materialize/update OpenCode-compatible config/context files
- Ensure required skill references are present
- Keep sync idempotent (safe repeated runs)

### 4) Command execution gateway
Add backend command family:
- `run_opencode_flow(worktree_path, phase, args)`

Maps requested phase to configured command alias, for example:
- `init` → `/sdd-init`
- `new_change add-x` → `/sdd-new add-x`
- `continue` → `/sdd-continue`
- `apply` → `/sdd-apply`
- `verify` → `/sdd-verify`

Execution requirements:
- fixed `cwd` to worktree path
- timeout + cancellation
- structured stdout/stderr capture
- typed errors for missing tools/config

### 5) Artifact-store aware behavior
Support the three persistence modes mentioned by Agent Teams Lite:
- `engram` (preferred default)
- `openspec`
- `none`

Backend rule:
- If profile says `engram`, verify availability; otherwise return actionable error.
- If profile says `openspec`, ensure directory structure exists.
- If `none`, run ephemeral flow with no writes beyond runtime/logs.

---

## How this makes OpenCode settings “easily accessible” in Groove

Backend-side accessibility means Groove can expose/read these values without frontend complexity:
- active command aliases (`/sdd-*` mapping)
- selected persistence mode
- phase timeout policy
- approval gate policy between phases
- last sync status + diagnostics

All of that lives in `.groove/opencode-profile.json`, and backend commands provide read/write APIs. Any UI (current or future) just calls these APIs.

---

## Suggested Tauri/Rust Commands

```rust
// status + diagnostics
check_opencode_status(worktree_path) -> OpenCodeStatus

// profile management
get_opencode_profile(worktree_path) -> OpenCodeProfile
set_opencode_profile(worktree_path, patch) -> OpenCodeProfile
sync_opencode_config(worktree_path) -> SyncResult

// workflow execution
run_opencode_flow(worktree_path, phase, args) -> OpenCodeRunResult
cancel_opencode_flow(run_id) -> CancelResult
```

Data contracts:

```rust
pub struct OpenCodeStatus {
    pub opencode_available: bool,
    pub agent_teams_lite_available: bool,
    pub profile_present: bool,
    pub sync_ok: bool,
    pub artifact_store: Option<String>, // engram | openspec | none
    pub warnings: Vec<String>,
}

pub struct OpenCodeRunResult {
    pub run_id: String,
    pub phase: String,
    pub status: String, // ok | warning | blocked | failed | timeout
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub summary: Option<String>,
    pub stdout: String,
    pub stderr: String,
}
```

---

## Error Handling

Typed backend errors:
- `OpencodeMissing`
- `AgentTeamsLiteMissing`
- `ProfileInvalid`
- `SyncFailed`
- `ArtifactStoreUnavailable`
- `PhaseTimeout`

Each error should include:
- machine code
- human remediation hint
- relevant path(s)

---

## Rollout Plan (0.1.7)

### Phase A (required)
- Add profile model + status detection.
- Add config sync adapter.
- Add command gateway for `init/new/continue/apply/verify/archive`.

### Phase B (recommended)
- Add run cancellation + event streaming.
- Add last-run snapshot cache in `.groove/`.

### Phase C (optional)
- Add multi-worktree orchestration queue.
- Add policy templates (strict/planning-heavy/fast-iterate).

---

## Acceptance Criteria

- Groove backend can persist and retrieve OpenCode integration settings per worktree.
- Groove backend can sync those settings into OpenCode-compatible context/config.
- Groove backend can execute `/sdd-*` flows deterministically with timeout-safe process handling.
- Persistence mode (`engram|openspec|none`) is validated and enforced before runs.
- Failures are actionable and typed.

---

## Practical Minimal Setup (for Groove repo)

1. Install Agent Teams Lite and OpenCode tooling on host.
2. Create `.groove/opencode-profile.json` with defaults (`artifact_store=engram`).
3. Run `sync_opencode_config` once per worktree.
4. Execute `run_opencode_flow(..., phase="init")`.
5. Start normal lifecycle with `new -> continue -> apply -> verify -> archive`.

This keeps integration backend-first, reusable, and independent of UI changes.