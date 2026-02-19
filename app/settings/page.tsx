"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { AppNavigation } from "@/components/app-navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const WORKSPACE_VERSION = 1;
const ACTIVE_WORKSPACE_SESSION_KEY = "groove.active-workspace-session.v1";
const WORKSPACE_ROOT_OVERRIDE_STORAGE_PREFIX = "groove.workspace-root-override.v2";
const LEGACY_WORKSPACE_ROOT_OVERRIDE_STORAGE_PREFIX =
  "groove.workspace-root-override.v1";
const DIRECTORY_HANDLE_DB_NAME = "groove.workspace-handles.v1";
const DIRECTORY_HANDLE_STORE_NAME = "handles";
const ACTIVE_DIRECTORY_HANDLE_RECORD_ID = "active";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
};

type ActiveWorkspaceSession = {
  rootName: string;
  activatedAt: string;
};

type PersistedDirectoryRecord = {
  id: string;
  handle: FileSystemDirectoryHandle;
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

function makeWorkspaceIdentity(workspaceMeta: WorkspaceMeta): string {
  const parts = [
    `root=${workspaceMeta.rootName}`,
    `createdAt=${workspaceMeta.createdAt}`,
    `version=${String(workspaceMeta.version)}`,
  ];

  return parts.join("|");
}

function makeWorkspaceRootOverrideStorageKey(workspaceIdentity: string): string {
  return `${WORKSPACE_ROOT_OVERRIDE_STORAGE_PREFIX}:${encodeURIComponent(workspaceIdentity)}`;
}

function makeLegacyWorkspaceRootOverrideStorageKey(rootName: string): string {
  return `${LEGACY_WORKSPACE_ROOT_OVERRIDE_STORAGE_PREFIX}:${encodeURIComponent(rootName)}`;
}

function readWorkspaceRootOverride(workspaceIdentity: string, rootName: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const v2Key = makeWorkspaceRootOverrideStorageKey(workspaceIdentity);
  const v2Value = window.localStorage.getItem(v2Key);
  if (v2Value !== null) {
    return v2Value;
  }

  const legacyKey = makeLegacyWorkspaceRootOverrideStorageKey(rootName);
  const legacyValue = window.localStorage.getItem(legacyKey);
  if (legacyValue === null) {
    return "";
  }

  window.localStorage.setItem(v2Key, legacyValue);
  window.localStorage.removeItem(legacyKey);
  return legacyValue;
}

function persistWorkspaceRootOverride(
  workspaceIdentity: string,
  rootName: string,
  overrideValue: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    makeWorkspaceRootOverrideStorageKey(workspaceIdentity),
    overrideValue,
  );
  window.localStorage.removeItem(
    makeLegacyWorkspaceRootOverrideStorageKey(rootName),
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

async function parseJsonFile(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<
  { status: "missing" } | { status: "ok"; value: unknown } | { status: "corrupt" }
> {
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

async function loadWorkspaceMeta(
  rootDirectory: FileSystemDirectoryHandle,
): Promise<WorkspaceMeta> {
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

  if (workspaceFile.status === "missing") {
    workspaceMeta = defaultWorkspace;
    await writeJsonFile(grooveDirectory, "workspace.json", workspaceMeta);
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
  } else {
    workspaceMeta = defaultWorkspace;
    await writeJsonFile(grooveDirectory, "workspace.json", workspaceMeta);
  }

  return workspaceMeta;
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

export default function SettingsPage() {
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [workspaceRootName, setWorkspaceRootName] = useState<string | null>(null);
  const [workspaceRootOverride, setWorkspaceRootOverride] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const workspaceIdentity = useMemo(
    () => (workspaceMeta ? makeWorkspaceIdentity(workspaceMeta) : null),
    [workspaceMeta],
  );

  const showSettingsWarning =
    workspaceRootName !== null && workspaceRootOverride.trim().length === 0;

  useEffect(() => {
    let cancelled = false;

    const loadActiveWorkspace = async (): Promise<void> => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const session = readActiveWorkspaceSession();
        if (!session) {
          if (!cancelled) {
            setWorkspaceMeta(null);
            setWorkspaceRootName(null);
            setWorkspaceRootOverride("");
          }
          return;
        }

        const handle = await readPersistedActiveWorkspaceHandle();
        if (!handle) {
          if (!cancelled) {
            setWorkspaceMeta(null);
            setWorkspaceRootName(null);
            setWorkspaceRootOverride("");
          }
          return;
        }

        const loadedWorkspaceMeta = await loadWorkspaceMeta(handle);
        const identity = makeWorkspaceIdentity(loadedWorkspaceMeta);
        const rootName = loadedWorkspaceMeta.rootName;
        const overrideValue = readWorkspaceRootOverride(identity, rootName);

        if (!cancelled) {
          setWorkspaceMeta(loadedWorkspaceMeta);
          setWorkspaceRootName(rootName);
          setWorkspaceRootOverride(overrideValue);
        }
      } catch {
        if (!cancelled) {
          setWorkspaceMeta(null);
          setWorkspaceRootName(null);
          setWorkspaceRootOverride("");
          setErrorMessage("Failed to load the active workspace context.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadActiveWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const inputDisabled = workspaceRootName === null;

  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation showSettingsWarning={showSettingsWarning} />

        <div className="min-w-0 flex-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>
                Configure workspace-specific options used by restore and remove actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label
                  htmlFor="workspace-root-override"
                  className="block text-sm font-medium text-foreground"
                >
                  Workspace root override (absolute path)
                </label>
                <Input
                  id="workspace-root-override"
                  value={workspaceRootOverride}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const nextOverride = event.target.value;
                    setWorkspaceRootOverride(nextOverride);

                    if (workspaceIdentity && workspaceRootName) {
                      persistWorkspaceRootOverride(
                        workspaceIdentity,
                        workspaceRootName,
                        nextOverride,
                      );
                    }
                  }}
                  placeholder="/home/you/path/to/workspace"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={inputDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Leave empty to auto-resolve from workspace context.
                </p>
              </div>

              {isLoading && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Loading active workspace...
                </p>
              )}

              {!isLoading && inputDisabled && (
                <p className="rounded-md border border-amber-700/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
                  No active workspace selected. Open Dashboard and select a directory to configure
                  this setting.
                </p>
              )}

              {workspaceRootName && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Active workspace: <span className="font-medium text-foreground">{workspaceRootName}</span>
                </p>
              )}

              {errorMessage && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
