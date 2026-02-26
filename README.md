# Groove

Groove now runs as a **Tauri 2 + Vite + React** desktop app with a Rust command layer and bundled `groove` sidecar support.

## Current app stack

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Native backend: Rust Tauri commands
- Routing: `react-router-dom`
- The active dev/build path is Tauri + Vite.

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

## Unified setup command

From the repo root, use the cross-platform setup entrypoint:

```bash
npm run setup
```

Checker-repair mode runs sidecar checks first, then applies minimal safe repair steps where possible (currently executable-bit fixes on Unix-like systems), and reruns the checks:

```bash
npm run setup -- --mode=checker-repair
# optional positional mode form:
npm run setup -- checker-repair
```

## macOS quick setup

From the repo root, run:

```bash
./bash/setup-macos-fast
# or: npm run setup:macos
```

Prerequisites: install Node.js (with npm) and Rust (cargo/rustc) manually before running this.

This script does not install Node.js or Rust; it verifies they are available, then installs/verifies Homebrew, installs `create-dmg`, installs project dependencies, and runs `npm run check:rust`.

## Linux quick setup

From the repo root, run:

```bash
./bash/setup-linux-fast
# or: npm run setup:linux
```

Prerequisites: install Node.js (with npm) and Rust (cargo/rustc) manually before running this.

This script does not install Node.js or Rust; it verifies they are available, attempts a best-effort install of minimal Tauri Linux system dependencies via `apt` when available, installs project dependencies, runs `npm run check:rust`, and validates Linux sidecars.

## Guided setup scripts (visual step-by-step)

For a robust, interactive setup flow with numbered steps and PASS/FAIL status output, use:

```bash
# Linux
./setup-linux.sh

# macOS
./setup-macos.sh

# Optional flags
./setup-linux.sh --verbose
./setup-macos.sh --no-color
```

These wrappers are intentionally focused on setup UX and do not modify app/runtime code.

What they do:
- validate OS compatibility
- run visible preflight checks (node, npm, rustc, cargo)
- show detected tool versions
- run the existing fast setup scripts (`bash/setup-*-fast`)
- run sidecar checks (`bash/check-*-sidecars`)
- build distributables (`tauri:build:linux` on Linux, `tauri:build:macos` on macOS)
- ensure Linux AppImage outputs are executable
- on Linux, install/update a runnable local app at `~/Applications/Groove.AppImage`
- on Linux, create/update a desktop launcher at `~/.local/share/applications/groove.desktop`
- on macOS, install/update a runnable local app at `~/Applications/Groove.app` from the built DMG
- print a clear summary and artifact location

Troubleshooting tips:
- If preflight fails, install the missing tool and re-run.
- If sidecar checks fail, place required files in `src-tauri/binaries/` and make them executable.
- If Homebrew/apt steps fail, run the OS package manager command manually and retry.

## Windows quick setup

From the repo root (PowerShell), run:

```powershell
.\powershell\setup-windows-fast.ps1
# or: npm run setup:windows
```

Prerequisites: install Node.js (with npm) and Rust (cargo/rustc) manually before running this.

This script does not install Node.js or Rust; it verifies they are available, checks for WebView2 Runtime presence (best effort), installs project dependencies, runs `npm run check:rust`, and validates Windows sidecars.

## Universal macOS sidecars

Groove requires both macOS sidecar binaries so builds and runtime resolution work on Apple Silicon and Intel Macs:

- `src-tauri/binaries/groove-aarch64-apple-darwin`
- `src-tauri/binaries/groove-x86_64-apple-darwin`

Both files must exist and be executable in `src-tauri/binaries/`.
Run `npm run sidecar:check:macos` to validate local sidecar readiness.

## Linux sidecars

Groove requires a Linux sidecar in `src-tauri/binaries/` for your host architecture:

- `groove-x86_64-unknown-linux-gnu` (x86_64)
- `groove-aarch64-unknown-linux-gnu` (arm64)

The checked sidecar must exist and be executable.
Run `npm run sidecar:check:linux` to validate local sidecar readiness.

## Windows sidecars

Groove requires at least one Windows sidecar in `src-tauri/binaries/`:

- `groove-x86_64-pc-windows-msvc.exe`
- `groove-aarch64-pc-windows-msvc.exe` (optional, for arm64)

Run `npm run sidecar:check:windows` to validate local sidecar readiness.

## Run locally

```bash
npm install
npm run tauri:dev
```

For frontend-only iteration:

```bash
npm run dev
```

## Quality gates

Before opening a PR, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run check:rust
```

## Contributor pre-PR checklist

- [ ] Run all quality gate commands locally and confirm they pass.
- [ ] If your change affects desktop/runtime behavior, do a smoke run with `npm run tauri:dev`.
- [ ] Update relevant docs when behavior, setup, or commands change.

## CI builds (Linux + macOS)

A GitHub Actions workflow is included at:

- `.github/workflows/build-desktop.yml`

It builds desktop artifacts on:
- `ubuntu-latest` → Linux bundles (`AppImage`, `deb`)
- `macos-latest` → macOS bundle (`dmg`)

It runs the guided setup scripts in CI (`--no-color`) before building, then uploads artifacts from `src-tauri/target/release/bundle/**`.

You can run it manually from GitHub Actions via **workflow_dispatch**, or it runs on push/PR.

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

Installer-focused packaging:

```bash
# Linux installers (AppImage + deb)
npm run tauri:build:linux

# macOS installer (dmg)
npm run tauri:build:macos
```

## Known limitations (0.1.4)

- RPM and PKG installer outputs are intentionally deferred in 0.1.4.

## Notes

- Workspace root for Groove commands is inferred from the selected active workspace, with metadata-based auto-resolution as fallback.
- Active workspace is persisted as a path string under Tauri app data (`active-workspace.json`) for restore on reopen.
- Path-safety and payload validation in Rust mirror the previous API route semantics as closely as possible.
- Realtime updates are filesystem-driven and emitted as Tauri events.
