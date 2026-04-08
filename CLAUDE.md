# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Groove

A Tauri 2 desktop app for managing Git multi-worktree development. It discovers worktrees in `.worktrees/`, launches terminals and build commands per worktree, monitors runtime processes, and persists workspace settings.

## Commands

```bash
# Development
npm run dev              # Frontend only (Vite on :1420)
npm run tauri:dev        # Full desktop app with hot reload

# Quality
npm run lint             # ESLint
npm run typecheck        # TypeScript noEmit check
npm run test             # Vitest (unit/component)
npm run test:watch       # Vitest watch mode
npm run check:rust       # Cargo check on Rust backend

# Single test
npx vitest run src/path/to/file.test.ts
npx vitest run -t "test name"
npx vitest run src/path/to/file.test.ts -t "test name"

# Build
npm run build                # Frontend production build
npm run tauri:build          # Desktop bundle (all platforms)
npm run tauri:build:linux    # Linux AppImage + deb
npm run tauri:build:macos    # macOS dmg

# Setup (installs platform deps + validates sidecars)
npm run setup:linux
npm run setup:macos
npm run setup:windows
```

### Validation by change scope

- **Frontend-only:** `npm run lint && npm run typecheck && npm run test && npm run build`
- **Rust-only:** `npm run check:rust` (add `npm run tauri:dev` if Tauri runtime behavior affected)
- **Cross-stack:** all of the above

## Architecture

**3-layer structure:**

1. **React UI** (`src/`) — React 19 + TypeScript + Vite 7 SPA. Routes in `src/app/`, components in `src/components/`, shadcn primitives in `src/components/ui/`. Tailwind CSS 4 for styling. Path alias: `@/*` maps to `./`.

2. **Typed IPC bridge** (`src/lib/ipc/`) — All frontend-to-backend communication goes through typed command signatures in `commands-core.ts` and `commands-features.ts`, with types in `types-*.ts`. The `invoke.ts` helper wraps Tauri's IPC.

3. **Rust backend** (`src-tauri/src/backend/`) — Domain-organized modules:
   - `groove_worktree_lifecycle/` — create/restore/remove/play/stop worktrees
   - `pty_terminal_sessions/` — terminal spawning via portable-pty
   - `diagnostics_process_control/` — process inspection/killing
   - `git_github_bridge/` — Git/GitHub integration
   - `workspace_discovery_context/` — `.worktrees/` scanning
   - `workspace_metadata_settings/` — `.groove/workspace.json` persistence
   - `app_state_management/` — workspace/worktree state
   - `startup_health_checks_binary_validation/` — sidecar validation

**Data flow:** React UI --> typed IPC invoke --> Tauri command --> Rust backend --> Git/filesystem/terminal, with Rust emitting events back to the frontend via Tauri's event system.

**State management:** `useSyncExternalStore` subscriptions for global and workspace settings. No Redux/Zustand.

**Sidecar binaries:** Platform-specific `groove` binaries in `src-tauri/binaries/`. Runtime resolution checks `GROOVE_BIN` env, then bundled paths.

## Code Style

- **Imports:** external packages first, then `@/...` aliases, then relative. Separate groups with blank lines. Prefer `import type { Foo }` when possible.
- **Naming:** PascalCase for components/types/enums, camelCase for functions/variables/hooks, UPPER_SNAKE_CASE for true constants, boolean predicates (`isReady`, `hasError`).
- **TypeScript:** Strict mode. No `any`. Prefer concrete types, unions, generics.
- **Rust:** `Result`-based error handling, no `panic!` for runtime failures.
- **Tests:** Colocated with source files (`*.test.ts`, `*.test.tsx`). Vitest + Testing Library React + jsdom.
- **Style matching:** Match existing file style. Small, focused diffs. No unrelated reformatting.
