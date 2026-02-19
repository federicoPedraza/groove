# Groove

Groove now runs as a **Tauri 2 + Vite + React** desktop app with a Rust command layer and bundled `groove` sidecar support.

## Current app stack

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Native backend: Rust Tauri commands
- Routing: `react-router-dom`
- Existing Next.js files remain in the repo for reference/parity migration, but the active dev/build path is Tauri + Vite.

## What Groove does

- Lets users pick a local folder and maintain `.groove/workspace.json` metadata.
- Scans `.worktrees`, shows status/runtime state, and offers Restore / Play / Stop / Remove actions.
- Uses native desktop workspace selection/storage (Rust + Tauri command layer), not browser File System Access APIs.
- Calls the `groove` CLI through Rust commands:
  - `groove_list`
  - `groove_restore`
  - `groove_rm`
  - `groove_stop`
  - `workspace_events` (filesystem polling emitter)

## Sidecar bundling

Tauri is configured to bundle the sidecar from `src-tauri/binaries/groove` via `externalBin`.

Expected sidecar filenames at build time include target triples, for example:

- Linux: `groove-x86_64-unknown-linux-gnu`
- macOS Intel: `groove-x86_64-apple-darwin`
- macOS Apple Silicon: `groove-aarch64-apple-darwin`
- Windows: `groove-x86_64-pc-windows-msvc.exe`

At runtime, backend command resolution checks `GROOVE_BIN` first, then bundled/resource paths.

## Run locally

```bash
npm install
npm run tauri:dev
```

For frontend-only iteration:

```bash
npm run dev
```

## Build

Frontend build:

```bash
npm run build
```

Rust check:

```bash
npm run check:rust
```

Desktop bundles:

```bash
npm run tauri:build
```

## Notes

- Workspace root for Groove commands is inferred from the selected active workspace, with metadata-based auto-resolution as fallback.
- Active workspace is persisted as a path string under Tauri app data (`active-workspace.json`) for restore on reopen.
- Path-safety and payload validation in Rust mirror the previous API route semantics as closely as possible.
- Realtime updates are filesystem-driven and emitted as Tauri events.
