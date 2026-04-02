# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Groove

A Tauri 2 desktop app for managing Git multi-worktree development. It discovers `.worktrees/` directories, launches terminals/processes at the correct worktree path, and provides diagnostics/cleanup for stale processes.

## Architecture

3-layer model:
1. **UI** — React 19 + TypeScript + Vite frontend. Route pages in `app/`, reusable components in `components/`, shared libs in `src/` and `lib/`.
2. **Native commands** — Tauri 2 + Rust backend in `src-tauri/`. IPC commands defined in `src-tauri/src/backend/frontend_command_registry/`. Frontend calls them via typed IPC bridge at `src/lib/ipc.ts`.
3. **Local runtime** — Git worktrees, groove sidecar binary (platform-specific binaries in `src-tauri/binaries/`), PTY terminal sessions, process lifecycle.

Key frontend patterns:
- Path alias: `@/*` maps to `./*`
- Lazy-loaded route pages with React Router + Suspense
- shadcn-style components (Radix UI + Tailwind CSS 4)
- Vitest + Testing Library + jsdom for tests

Rust backend modules under `src-tauri/src/backend/` are organized by domain (e.g., `groove_worktree_lifecycle/`, `pty_terminal_sessions/`, `diagnostics_process_control/`).

## Commands

```bash
# Dev
npm run dev              # Frontend only (Vite on port 1420)
npm run tauri:dev        # Full app (frontend + Rust)

# Quality
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit (strict)
npm run test             # Vitest
npm run check:rust       # cargo check

# Build
npm run build            # Production frontend
npm run tauri:build:linux   # AppImage + deb
npm run tauri:build:macos   # dmg

# Single test
npx vitest run src/path/to/file.test.ts
npx vitest run -t "test name"
npx vitest run src/path/to/file.test.ts -t "test name"

# Setup (first time)
npm install && npm run setup
```

## Validation by change scope

- **Frontend only:** `lint` -> `typecheck` -> `test` -> `build`
- **Rust only:** `check:rust` (+ `tauri:dev` if it affects runtime behavior)
- **Cross-stack:** all of the above

## Code style

- Strict TypeScript; no `any`. Prefer unions, generics, narrowing.
- Imports: external -> `@/` alias -> relative, separated by blank lines. Use `import type` when possible.
- Naming: PascalCase for components/types, camelCase for functions/variables/hooks, UPPER_SNAKE_CASE for true constants, predicates for booleans (`isReady`, `hasError`).
- Rust: `Result`-based error flows with context; no `panic!` for runtime failures.
- Match existing file style; small focused diffs.
