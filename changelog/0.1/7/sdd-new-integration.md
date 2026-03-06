# Changelog 0.1.7 — `/sdd-new` (or `ssd-new`) in Groove

## What `/sdd-new` is
`/sdd-new <change-name>` starts a **new Spec-Driven Development (SDD) change**.

It is the entry point for a structured workflow:
1. create a named change context (example: `add-dark-mode`)
2. explore current codebase context
3. generate an initial proposal
4. prepare for next phases (`spec`, `design`, `tasks`, then implementation)

> Note: users may type `ssd-new` by mistake; Groove should normalize that to `sdd-new`.

---

## Why this matters for Groove
Groove can expose `/sdd-new` as a backend capability so feature work starts with planning rather than direct coding.

Benefits:
- deterministic “new change” entrypoint
- consistent naming + traceability per worktree
- safer handoff to later phases (`/sdd-continue`, `/sdd-apply`, `/sdd-verify`)

---

## Integration approach (backend-first)

### 1) Command normalization layer
When Groove receives a requested command:
- accept `/sdd-new <name>` as canonical
- accept `/ssd-new <name>` as alias and rewrite to `/sdd-new <name>`
- reject missing change names with validation error

Validation rules for `<change-name>`:
- required
- kebab-case preferred (`[a-z0-9-]+`)
- short but descriptive (e.g., `export-csv-reports`)

### 2) Profile contract extension
In `.groove/opencode-profile.json`, ensure `new_change` mapping is explicit:

```json
{
  "commands": {
    "new_change": "/sdd-new"
  }
}
```

Optional alias table (Groove internal):

```json
{
  "aliases": {
    "ssd-new": "sdd-new"
  }
}
```

### 3) Backend command routing
Expose a typed operation:
- `run_opencode_flow(worktree_path, phase="new_change", args=[change_name])`

Runtime behavior:
- enforce cwd = worktree
- execute `/sdd-new <change-name>`
- collect stdout/stderr
- parse summary (status, created artifacts, next recommended phase)

### 4) Result model expectations
`new_change` should return enough data to continue safely:
- `status`: `ok | warning | blocked | failed`
- `change_name`
- `executive_summary`
- `artifacts` (proposal/explore refs if available)
- `next_recommended` (usually `sdd-continue` or `sdd-ff`)

### 5) UX integration behavior
After successful `/sdd-new`:
- show one-line summary
- show created artifact references
- offer next action buttons/shortcuts:
  - Continue planning (`/sdd-continue`)
  - Fast-forward planning (`/sdd-ff <change-name>`)

---

## Error handling
Typed errors specific to `new_change` flow:
- `InvalidChangeName`
- `MissingChangeName`
- `CommandAliasResolved` (informational)
- `PhaseExecutionFailed`
- `PhaseTimeout`

Each should include:
- machine code
- user-facing fix hint
- original command + normalized command

---

## Acceptance criteria
- Groove accepts both `sdd-new` and `ssd-new` (alias rewrite).
- Groove validates `change-name` before execution.
- Groove executes `/sdd-new <change-name>` deterministically per worktree.
- Groove stores and returns structured run output for downstream phases.
- User can continue directly into `/sdd-continue` or `/sdd-ff` without manual state reconstruction.

---

## Example
Input:
- `ssd-new add-dark-mode`

Groove backend normalization:
- `ssd-new` → `sdd-new`
- executed command: `/sdd-new add-dark-mode`

Output summary:
- status: `ok`
- change: `add-dark-mode`
- next: `sdd-continue`