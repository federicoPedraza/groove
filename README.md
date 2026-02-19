# Groove

Groove is a Next.js app that manages lightweight workspace state directly inside a user-selected local directory.

## What Groove does

- Lets the user pick a local folder with the File System Access API.
- Creates and uses a hidden `.groove` directory inside that folder.
- Stores workspace metadata in `.groove/workspace.json`.
- Includes a simple save/retrieve demo for notes in `.groove/data.json`.

## Browser requirement

Groove requires the File System Access API, currently available in modern Chromium-based browsers (for example Chrome, Edge, or Brave).

Browsers without this API can load the app UI but cannot select directories or persist local workspace files.

## Workspace files

After selecting a directory, Groove ensures these files exist:

- `.groove/workspace.json`
  - `version` (number)
  - `rootName` (string)
  - `createdAt` (ISO datetime string)
  - `updatedAt` (ISO datetime string)
- `.groove/data.json`
  - `notes` (string)
  - `updatedAt` (ISO datetime string)

If `workspace.json` or `data.json` is missing or corrupt, Groove recreates it safely with defaults.

## CLI restore command

Use `groove restore` to repair Groove workspace metadata for a specific worktree or branch.

```bash
groove restore <worktree-or-branch> [--dir <worktrees_dir>] [--opencode-log-file <path>]
```

`restore` is a maintenance command: it fixes missing/corrupt Groove files and records diagnostics, but it does not launch editor or coding tools.

The web UI worktree table can also run restore locally through the app server process (same command and flags), so you can trigger it directly from Actions.

The web UI also includes a destructive `Cut groove` action that maps to:

```bash
groove rm <branch> [--dir <worktrees_dir>]
```

When restore is triggered from the UI, Groove auto-resolves the workspace root from selected workspace context (`rootName`, known worktree list, and workspace metadata when available) by default.

If auto-resolve is ambiguous or fails, you can set **Workspace root override (absolute path)** in the UI. When provided, this absolute `workspaceRoot` is sent to the restore API and used directly instead of auto-resolution.

## Realtime workspace updates

- The app also exposes an SSE endpoint at `GET /api/groove/events`.
- It watches active workspace filesystem paths (`.worktrees` and `.groove`, plus known worktree `.groove` paths) and triggers UI rescans on change.
- Groove currently does not expose a formal event bus API from the CLI script, so realtime updates are filesystem-driven.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` in a supported browser.

## Current limitations

- Workspace handles are kept in memory only (no persisted handle between sessions).
- The demo data model is intentionally minimal and currently stores only notes text.
- Non-Chromium browsers do not support directory access yet.
