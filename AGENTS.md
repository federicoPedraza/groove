# AGENTS.md

## Purpose
This file defines how autonomous coding agents should operate in this repository.
Follow these rules for planning, editing, validating, and reporting changes.

## Repository Snapshot
- Frontend: npm + Vite + React + TypeScript.
- Desktop shell/backend: Tauri + Rust.
- TypeScript is configured in strict mode.
- Path alias: `@/* -> ./*`.
- No test framework is currently configured.
- No test files are currently detected.

## Source of Truth
When there is a conflict, use this order:
1. Explicit user instruction.
2. This `AGENTS.md`.
3. Existing code patterns in the touched area.
4. Tool defaults and language ecosystem conventions.

## Available Project Scripts
Use npm scripts as the primary interface:
```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run tauri:dev
npm run tauri:build
npm run tauri:build:linux
npm run tauri:build:macos
npm run check:rust
```

## Build / Lint / Test Commands

### Core validation commands
- Frontend dev: `npm run dev`
- Frontend production build: `npm run build`
- Frontend preview build: `npm run preview`
- Frontend lint: `npm run lint`
- Rust checks: `npm run check:rust`
- Tauri full dev (frontend + Rust): `npm run tauri:dev`
- Tauri full build: `npm run tauri:build`

### Tests (current status)
- JavaScript/TypeScript tests: currently unavailable.
- Rust tests via workspace npm script: currently unavailable.
- Repository currently has no test files detected.

### Running a single test (currently unavailable)
There is no supported single-test command today because no test framework is installed/configured.
Do not invent or claim test execution that cannot run.

### Future patterns (if adopted later)
- Future (Vitest):
  - All tests: `npx vitest run`
  - Single file: `npx vitest run src/path/to/file.test.ts`
  - Single test name: `npx vitest run -t "test name"`
- Future (Jest):
  - All tests: `npx jest`
  - Single file: `npx jest src/path/to/file.test.ts`
  - Single test name: `npx jest -t "test name"`
- Future (Rust):
  - All tests: `cargo test`
  - Single crate/package: `cargo test -p <crate_name>`
  - Single test target/name: `cargo test <test_name>`

## Code Style Conventions

### Formatting
- TypeScript/TSX formatting in this repo uses double quotes, semicolons, and 2-space indentation.
- Match surrounding style exactly in edited files.
- Keep diffs minimal and focused.

### Import ordering
- Order imports as external packages, then one blank line, then internal alias (`@/...`) and relative imports.
- Prefer type-only imports where applicable: `import type { Foo } from "...";`.

### Types and strictness
- Respect strict mode; do not suppress errors without strong reason.
- Avoid `any`; prefer specific types, unions, and generics.
- Narrow unknown values safely.
- Keep component props and return types clear when beneficial.
- Encode domain constraints in types, not comments.

### Naming
- Components and exported types/interfaces: `PascalCase`.
- Functions, variables, hooks: `camelCase`.
- Constants and immutable globals: `UPPER_SNAKE_CASE`.
- Boolean variables should read as predicates (`is`, `has`, `should`).

### Error handling (TypeScript)
- Use `try/catch` around fallible async boundaries where user impact exists.
- Provide actionable and concise user-facing error messages.
- Preserve technical context for logs/debugging.
- Do not swallow errors silently.

### Error handling (Rust)
- Use `Result`-based flows.
- Prefer `map_err` (or equivalent) to attach context.
- Return meaningful errors instead of panicking in normal paths.
- Keep error context close to the failing operation.

## Agent Workflow by Change Scope

### 1) Plan before edits
- Identify whether scope is frontend-only, Rust-only, or cross-stack.
- Read nearby files to match local patterns before implementing.

### 2) Implement minimally
- Make the smallest change that fully resolves the task.
- Avoid broad refactors unless requested or required for correctness.

### 3) Validate by scope

#### Frontend-only change
Run:
```bash
npm run lint
npm run build
```

#### Rust-only change
Run:
```bash
npm run check:rust
```
If runtime integration is affected, also run:
```bash
npm run tauri:dev
```

#### Cross-stack (frontend + Rust bridge/Tauri)
Run:
```bash
npm run lint
npm run build
npm run check:rust
npm run tauri:dev
```
Use `npm run tauri:build` when release/build behavior is part of the task.

### 4) Report clearly
Final agent output should:
- State what changed and why.
- List validation commands actually run.
- Note commands not run and why.
- Highlight risks/follow-ups if validation is partial.

## Cursor / Copilot Rules Status
- `.cursor/rules`: not found.
- `.cursorrules`: not found.
- `.github/copilot-instructions.md`: not found.

## Behavior in Absence of Cursor/Copilot Rules
- Follow this `AGENTS.md` and existing code patterns as primary guidance.
- Be conservative and prefer consistency over novelty.
- Do not invent hidden policy files or undocumented constraints.
- If conventions are unclear, infer from adjacent files and keep changes minimal.
- Document assumptions when they materially affect implementation choices.

## Definition of Done
A task is done when:
- Requested behavior/code change is implemented.
- Relevant lint/build/check commands pass for the affected scope.
- Changes follow repository style and naming conventions.
- Final report is concise, accurate, and explicit about validation status.
