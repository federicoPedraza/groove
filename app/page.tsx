"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const WORKSPACE_VERSION = 1;
const ACTIVE_WORKSPACE_SESSION_KEY = "groove.active-workspace-session.v1";
const DIRECTORY_HANDLE_DB_NAME = "groove.workspace-handles.v1";
const DIRECTORY_HANDLE_STORE_NAME = "handles";
const ACTIVE_DIRECTORY_HANDLE_RECORD_ID = "active";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceLoadResult = {
  workspaceMeta: WorkspaceMeta;
  workspaceMessage: string;
};

type WorktreeRow = {
  worktree: string;
  branchGuess: string;
  path: string;
  status: "ready" | "missing .groove";
};

type WorktreeScanResult = {
  hasWorktreesDirectory: boolean;
  rows: WorktreeRow[];
};

type ActiveWorkspaceSession = {
  rootName: string;
  activatedAt: string;
};

type PersistedDirectoryRecord = {
  id: string;
  handle: FileSystemDirectoryHandle;
};

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

function isoNow(): string {
  return new Date().toISOString();
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isWorkspaceMeta(value: unknown): value is WorkspaceMeta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkspaceMeta>;
  return (
    typeof candidate.version === "number" &&
    typeof candidate.rootName === "string" &&
    isIsoTimestamp(candidate.createdAt) &&
    isIsoTimestamp(candidate.updatedAt)
  );
}

async function parseJsonFile(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<{ status: "missing" } | { status: "ok"; value: unknown } | { status: "corrupt" }> {
  try {
    const fileHandle = await directory.getFileHandle(name);
    const file = await fileHandle.getFile();
    const raw = await file.text();

    try {
      const parsed = JSON.parse(raw) as unknown;
      return { status: "ok", value: parsed };
    } catch {
      return { status: "corrupt" };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return { status: "missing" };
    }

    throw error;
  }
}

async function writeJsonFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  value: unknown,
): Promise<void> {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(value, null, 2)}\n`);
  await writable.close();
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "AbortError") {
      return "Directory selection was cancelled.";
    }

    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Permission denied. Groove needs read/write access to the selected folder.";
    }
  }

  return "File operation failed. Try selecting the directory again.";
}

function saveActiveWorkspaceSession(rootName: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const marker: ActiveWorkspaceSession = {
    rootName,
    activatedAt: isoNow(),
  };

  window.sessionStorage.setItem(
    ACTIVE_WORKSPACE_SESSION_KEY,
    JSON.stringify(marker),
  );
}

function readActiveWorkspaceSession(): ActiveWorkspaceSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(ACTIVE_WORKSPACE_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWorkspaceSession>;
    if (
      typeof parsed.rootName === "string" &&
      isIsoTimestamp(parsed.activatedAt)
    ) {
      return {
        rootName: parsed.rootName,
        activatedAt: parsed.activatedAt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function clearActiveWorkspaceSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ACTIVE_WORKSPACE_SESSION_KEY);
}

function openDirectoryHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this environment."));
      return;
    }

    const request = window.indexedDB.open(DIRECTORY_HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DIRECTORY_HANDLE_STORE_NAME)) {
        database.createObjectStore(DIRECTORY_HANDLE_STORE_NAME, {
          keyPath: "id",
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB database."));
    };
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    };
  });
}

async function persistActiveWorkspaceHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const database = await openDirectoryHandleDatabase();

  try {
    const transaction = database.transaction(DIRECTORY_HANDLE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DIRECTORY_HANDLE_STORE_NAME);

    const record: PersistedDirectoryRecord = {
      id: ACTIVE_DIRECTORY_HANDLE_RECORD_ID,
      handle,
    };

    store.put(record);
    await completeTransaction(transaction);
  } finally {
    database.close();
  }
}

async function readPersistedActiveWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openDirectoryHandleDatabase();

  try {
    const transaction = database.transaction(DIRECTORY_HANDLE_STORE_NAME, "readonly");
    const store = transaction.objectStore(DIRECTORY_HANDLE_STORE_NAME);

    const record = await new Promise<PersistedDirectoryRecord | undefined>((resolve, reject) => {
      const request = store.get(ACTIVE_DIRECTORY_HANDLE_RECORD_ID);

      request.onsuccess = () => {
        resolve(request.result as PersistedDirectoryRecord | undefined);
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Failed to read persisted directory handle."));
      };
    });

    await completeTransaction(transaction);
    return record?.handle ?? null;
  } finally {
    database.close();
  }
}

async function clearPersistedActiveWorkspaceHandle(): Promise<void> {
  const database = await openDirectoryHandleDatabase();

  try {
    const transaction = database.transaction(DIRECTORY_HANDLE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DIRECTORY_HANDLE_STORE_NAME);

    store.delete(ACTIVE_DIRECTORY_HANDLE_RECORD_ID);
    await completeTransaction(transaction);
  } finally {
    database.close();
  }
}

async function hasReadWritePermission(
  directory: FileSystemDirectoryHandle,
  requestIfPrompt: boolean,
): Promise<boolean> {
  const permissionAwareDirectory = directory as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };

  if (typeof permissionAwareDirectory.queryPermission !== "function") {
    return true;
  }

  const permission = await permissionAwareDirectory.queryPermission({
    mode: "readwrite",
  });

  if (permission === "granted") {
    return true;
  }

  if (
    permission === "prompt" &&
    requestIfPrompt &&
    typeof permissionAwareDirectory.requestPermission === "function"
  ) {
    const requestedPermission = await permissionAwareDirectory.requestPermission({
      mode: "readwrite",
    });

    return requestedPermission === "granted";
  }

  return false;
}

async function loadWorkspace(
  rootDirectory: FileSystemDirectoryHandle,
): Promise<WorkspaceLoadResult> {
  const grooveDirectory = await rootDirectory.getDirectoryHandle(".groove", {
    create: true,
  });

  const now = isoNow();
  const defaultWorkspace: WorkspaceMeta = {
    version: WORKSPACE_VERSION,
    rootName: rootDirectory.name,
    createdAt: now,
    updatedAt: now,
  };

  const workspaceFile = await parseJsonFile(grooveDirectory, "workspace.json");

  let workspaceMeta: WorkspaceMeta;
  let workspaceMessage: string;

  if (workspaceFile.status === "missing") {
    workspaceMeta = defaultWorkspace;
    await writeJsonFile(grooveDirectory, "workspace.json", workspaceMeta);
    workspaceMessage = "Created .groove/workspace.json.";
  } else if (workspaceFile.status === "ok" && isWorkspaceMeta(workspaceFile.value)) {
    workspaceMeta = workspaceFile.value;

    if (workspaceMeta.rootName !== rootDirectory.name) {
      workspaceMeta = {
        ...workspaceMeta,
        rootName: rootDirectory.name,
      };
      workspaceMeta.updatedAt = isoNow();
      await writeJsonFile(grooveDirectory, "workspace.json", workspaceMeta);
    }

    workspaceMessage = "Loaded existing .groove/workspace.json.";
  } else {
    workspaceMeta = defaultWorkspace;
    await writeJsonFile(grooveDirectory, "workspace.json", workspaceMeta);
    workspaceMessage =
      "Recovered corrupt .groove/workspace.json by recreating defaults.";
  }

  return {
    workspaceMeta,
    workspaceMessage,
  };
}

function guessBranchFromWorktreeName(worktreeName: string): string {
  return worktreeName.replaceAll("_", "/");
}

async function scanWorktrees(
  rootDirectory: FileSystemDirectoryHandle,
): Promise<WorktreeScanResult> {
  let worktreesDirectory: FileSystemDirectoryHandle;

  try {
    worktreesDirectory = await rootDirectory.getDirectoryHandle(".worktrees");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return {
        hasWorktreesDirectory: false,
        rows: [],
      };
    }

    throw error;
  }

  const rows: WorktreeRow[] = [];

  const worktreesDirectoryWithEntries = worktreesDirectory as DirectoryHandleWithEntries;

  for await (const [, entryHandle] of worktreesDirectoryWithEntries.entries()) {
    if (entryHandle.kind !== "directory") {
      continue;
    }

    const worktreeDirectory = entryHandle as FileSystemDirectoryHandle;
    let status: WorktreeRow["status"] = "missing .groove";

    try {
      await worktreeDirectory.getDirectoryHandle(".groove");
      status = "ready";
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    }

    rows.push({
      worktree: worktreeDirectory.name,
      branchGuess: guessBranchFromWorktreeName(worktreeDirectory.name),
      path: `${rootDirectory.name}/.worktrees/${worktreeDirectory.name}`,
      status,
    });
  }

  rows.sort((left, right) => left.worktree.localeCompare(right.worktree));

  return {
    hasWorktreesDirectory: true,
    rows,
  };
}

export default function Home() {
  const [rootDirectory, setRootDirectory] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [worktreeRows, setWorktreeRows] = useState<WorktreeRow[]>([]);
  const [hasWorktreesDirectory, setHasWorktreesDirectory] = useState<boolean | null>(null);
  const [workspaceFileStatus, setWorkspaceFileStatus] = useState("Not initialized.");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [supportsFileSystem, setSupportsFileSystem] = useState<boolean | null>(null);
  const attemptedSessionRestoreRef = useRef(false);

  useEffect(() => {
    setSupportsFileSystem(
      typeof window !== "undefined" && "showDirectoryPicker" in window,
    );
  }, []);

  useEffect(() => {
    if (supportsFileSystem !== true || attemptedSessionRestoreRef.current) {
      return;
    }

    attemptedSessionRestoreRef.current = true;
    const activeSession = readActiveWorkspaceSession();

    if (!activeSession) {
      void clearPersistedActiveWorkspaceHandle().catch(() => {});
      return;
    }

    let cancelled = false;

    const restoreWorkspace = async (): Promise<void> => {
      try {
        setIsBusy(true);
        setErrorMessage(null);
        setStatusMessage("Restoring current workspace session...");

        const sessionHandle = await readPersistedActiveWorkspaceHandle();
        if (!sessionHandle) {
          clearActiveWorkspaceSession();
          await clearPersistedActiveWorkspaceHandle();

          if (!cancelled) {
            setErrorMessage(
              `Workspace session for "${activeSession.rootName}" was cleared because no saved directory handle was found. Select the directory again.`,
            );
            setStatusMessage(null);
          }

          return;
        }

        const permissionGranted = await hasReadWritePermission(sessionHandle, true);
        if (!permissionGranted) {
          clearActiveWorkspaceSession();
          await clearPersistedActiveWorkspaceHandle();

          if (!cancelled) {
            setErrorMessage(
              `Workspace session for "${activeSession.rootName}" expired because directory permission is no longer granted. Select the directory again.`,
            );
            setStatusMessage(null);
          }

          return;
        }

        const loaded = await loadWorkspace(sessionHandle);
        const scanned = await scanWorktrees(sessionHandle);

        if (cancelled) {
          return;
        }

        setRootDirectory(sessionHandle);
        setWorkspaceMeta(loaded.workspaceMeta);
        setWorktreeRows(scanned.rows);
        setHasWorktreesDirectory(scanned.hasWorktreesDirectory);
        setWorkspaceFileStatus(loaded.workspaceMessage);
        setStatusMessage(
          `Current workspace session restored for "${sessionHandle.name}".`,
        );
      } catch (error) {
        clearActiveWorkspaceSession();
        await clearPersistedActiveWorkspaceHandle();

        if (!cancelled) {
          setErrorMessage(describeError(error));
          setStatusMessage(null);
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    };

    void restoreWorkspace();

    return () => {
      cancelled = true;
    };
  }, [supportsFileSystem]);

  const pickDirectory = async (): Promise<void> => {
    if (!supportsFileSystem) {
      setErrorMessage(
        "This browser does not support the File System Access API. Use a recent Chromium-based browser.",
      );
      return;
    }

    try {
      setIsBusy(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const picker = window as unknown as Window & {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      };

      const selectedDirectory = await picker.showDirectoryPicker();
      const loaded = await loadWorkspace(selectedDirectory);
      const scanned = await scanWorktrees(selectedDirectory);

      await persistActiveWorkspaceHandle(selectedDirectory);
      saveActiveWorkspaceSession(selectedDirectory.name);

      setRootDirectory(selectedDirectory);
      setWorkspaceMeta(loaded.workspaceMeta);
      setWorktreeRows(scanned.rows);
      setHasWorktreesDirectory(scanned.hasWorktreesDirectory);
      setWorkspaceFileStatus(loaded.workspaceMessage);
      setStatusMessage(
        `Workspace is active for this browser session (${selectedDirectory.name}).`,
      );
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const refreshWorktrees = async (): Promise<void> => {
    if (!rootDirectory) {
      return;
    }

    try {
      setIsBusy(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const scanned = await scanWorktrees(rootDirectory);
      setWorktreeRows(scanned.rows);
      setHasWorktreesDirectory(scanned.hasWorktreesDirectory);
      setStatusMessage("Rescanned Groove worktrees.");
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-start justify-center p-4 md:p-8">
      {!rootDirectory ? (
        <Card className="w-full max-w-xl" aria-live="polite">
          <CardHeader>
            <CardTitle>No directory selected</CardTitle>
            <CardDescription>
              Select a local folder to create or load its Groove workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              onClick={pickDirectory}
              disabled={isBusy || supportsFileSystem !== true}
            >
              {isBusy ? "Opening picker..." : "Select directory"}
            </Button>
            {supportsFileSystem === false && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This browser is unsupported. Use a recent Chromium-based browser.
              </p>
            )}
            {statusMessage && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                {statusMessage}
              </p>
            )}
            {errorMessage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full" aria-live="polite">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Worktrees</CardTitle>
                <CardDescription>
                  Directory: <span className="font-medium text-foreground">{rootDirectory.name}</span>
                </CardDescription>
                <CardDescription>Workspace file: {workspaceFileStatus}</CardDescription>
                <CardDescription>
                  Last updated: {workspaceMeta ? new Date(workspaceMeta.updatedAt).toLocaleString() : "Not available"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={refreshWorktrees} disabled={isBusy}>
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pickDirectory}
                  disabled={isBusy}
                >
                  Pick another directory
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasWorktreesDirectory ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No <code>.worktrees</code> directory found under this workspace root yet.
              </p>
            ) : worktreeRows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <code>.worktrees</code> exists, but no worktree directories were found.
              </p>
            ) : (
              <div role="region" aria-label="Groove worktrees table" className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worktree</TableHead>
                      <TableHead>Branch (guess)</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {worktreeRows.map((row) => (
                      <TableRow key={row.path}>
                        <TableCell>{row.worktree}</TableCell>
                        <TableCell>{row.branchGuess}</TableCell>
                        <TableCell>
                          <code>{row.path}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.status === "ready" ? "secondary" : "outline"}>
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {statusMessage && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                {statusMessage}
              </p>
            )}
            {errorMessage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
