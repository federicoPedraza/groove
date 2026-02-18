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
