# AGENTS.md

## Purpose
This document is the operating guide for coding agents working in this repository.
It defines how to implement changes, validate them, and report results in a way that matches the current toolchain.

## Repository Snapshot
- Stack: React + TypeScript + Vite frontend, Tauri + Rust backend shell.
- Package manager and task runner: npm scripts from `package.json`.
- TypeScript is strict; frontend tests run with Vitest.
- Path alias in frontend code: `@/* -> ./*`.

## Source of Truth Precedence
When instructions conflict, use this order:
1. Direct user instruction.
2. This `AGENTS.md`.
3. Existing patterns in the files being edited.
4. Language/framework defaults.

If a higher-priority source is incomplete, use the next source and note assumptions in your final report.

## Current Commands (from package.json)
Use scripts as the primary interface for routine work:

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run tauri:dev
npm run tauri:build
npm run tauri:build:linux
npm run tauri:build:macos
npm run check:rust
```

## Build, Lint, and Test Guidance

### Core commands
- Local frontend dev: `npm run dev`
- Production frontend build: `npm run build`
- Local build preview: `npm run preview`
- Frontend lint: `npm run lint`
- Frontend type checks: `npm run typecheck`
- Frontend tests: `npm run test`
- Frontend tests in watch mode: `npm run test:watch`
- Rust checks (via npm): `npm run check:rust`
- Tauri integration dev loop: `npm run tauri:dev`

### Single-test commands (Vitest)
- Single test file: `npx vitest run src/path/to/file.test.ts`
- Single test by name: `npx vitest run -t "test name"`
- Single file + single test name: `npx vitest run src/path/to/file.test.ts -t "test name"`

Notes:
- There is no dedicated npm script for a single test; use `npx vitest run ...`.
- Rust validation in this repo is exposed through `npm run check:rust`.

## Code Style Guidelines

### Imports
- Keep imports grouped: external packages first, then internal alias (`@/...`), then relative imports.
- Separate import groups with one blank line.
- Prefer type-only imports when possible: `import type { Foo } from "...";`.
- Avoid unused imports; remove them while editing nearby code.

### Formatting and structure
- Match existing file style; do not reformat unrelated code.
- Maintain concise modules and focused functions.
- Prefer small diffs that solve the task directly.
- Keep JSX/TSX readable with consistent prop and conditional layout.

### Types and API boundaries
- Respect strict TypeScript settings; do not bypass type errors casually.
- Avoid `any`; prefer concrete types, unions, generics, and narrowing.
- Validate and narrow unknown external data at boundaries.
- Keep public function/component contracts explicit when it improves clarity.

### Naming
- React components, exported types/interfaces, and enums: `PascalCase`.
- Functions, variables, hooks: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` only when truly constant across scope.
- Boolean names should read as predicates (`isReady`, `hasError`, `shouldRetry`).

### Error handling
- Do not swallow errors silently.
- TypeScript: catch at meaningful boundaries, return actionable user messages, and log technical context.
- Rust: use `Result`-based flows and attach context to propagated errors.
- Avoid `panic!` for normal runtime failures.

## Validation Matrix by Change Scope

### Frontend-only changes
Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

### Rust-only changes
Run:

```bash
npm run check:rust
```

If Rust changes affect Tauri runtime behavior, also run:

```bash
npm run tauri:dev
```

### Cross-stack changes (frontend + Rust/Tauri bridge)
Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:rust
npm run tauri:dev
```

Use packaging builds only when relevant to the task:
- `npm run tauri:build`
- `npm run tauri:build:linux`
- `npm run tauri:build:macos`

## Definition of Done
A task is done when all of the following are true:
- The requested behavior/code change is implemented.
- Validation commands for the change scope were run and passed, or failures are documented.
- Code follows local style, naming, and typing expectations.
- No unrelated refactors or speculative tooling changes were introduced.
- Final report clearly states results, risks, and any follow-up work.

## Reporting Expectations for Agents
Keep final reporting concise and factual.

Always include:
- What changed and why (1-3 short bullets).
- Files touched.
- Commands actually run and outcome.
- Commands not run (if any) with a reason.
- Known risks, assumptions, or follow-up checks.

Avoid:
- Long execution logs.
- Claiming a command passed if it was not run.
- Broad recommendations unrelated to the requested task.

## Cursor/Copilot Rules Status
Status checked for these paths:
- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status in this repository:
- `.cursor/rules/`: not found.
- `.cursorrules`: not found.
- `.github/copilot-instructions.md`: not found.

Operational implication:
- This `AGENTS.md` is the primary local agent policy document.
- Use existing code patterns in touched files as secondary guidance.
