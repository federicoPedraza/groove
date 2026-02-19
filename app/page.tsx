"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleStop,
  Play,
  Copy,
  CircleCheck,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { AppNavigation } from "@/components/app-navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type RescanOptions = {
  showBusy?: boolean;
  clearStatusMessage?: boolean;
  showStatusMessage?: boolean;
  surfaceErrors?: boolean;
};

type RestoreRequestPayload = {
  workspaceRoot?: string;
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  action?: "restore" | "go";
  target?: string;
  dir?: string;
  opencodeLogFile?: string;
};

type RestoreApiResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type CutGrooveRequestPayload = {
  workspaceRoot?: string;
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  target: string;
  worktree: string;
  dir?: string;
  force?: boolean;
};

type CutGrooveApiResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type StopRequestPayload = {
  workspaceRoot?: string;
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  instanceId?: string;
};

type StopApiResponse = {
  requestId?: string;
  ok: boolean;
  alreadyStopped?: boolean;
  pid?: number;
  source?: "request" | "runtime";
  error?: string;
};

type OpencodeState = "running" | "not-running" | "unknown";
type LogState = "latest" | "broken-latest" | "none" | "unknown";

type RuntimeStateRow = {
  branch: string;
  worktree: string;
  opencodeState: OpencodeState;
  opencodeInstanceId?: string;
  logState: LogState;
  logTarget?: string;
};

type RuntimeListApiResponse = {
  requestId?: string;
  ok: boolean;
  rows: Record<string, RuntimeStateRow>;
  stdout: string;
  stderr: string;
  error?: string;
};

const DEBUG_CLIENT_LOGS = process.env.NEXT_PUBLIC_GROOVE_DEBUG_LOGS === "true";

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

const READY_STATUS_CLASSES =
  "border-emerald-700/30 bg-emerald-500/15 text-emerald-800";
const MISSING_STATUS_CLASSES =
  "border-amber-700/35 bg-amber-500/15 text-amber-900";
const OPENCODE_RUNNING_CLASSES =
  "border-emerald-700/30 bg-emerald-500/15 text-emerald-800";
const OPENCODE_NOT_RUNNING_CLASSES =
  "border-slate-600/25 bg-slate-400/10 text-slate-700";
const OPENCODE_UNKNOWN_CLASSES =
  "border-amber-700/35 bg-amber-500/15 text-amber-900";

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

function readLegacyWorkspaceRootOverride(rootName: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(makeLegacyWorkspaceRootOverrideStorageKey(rootName)) ?? "";
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

function makeRestoreActionKey(pathValue: string): string {
  return `${pathValue}:restore`;
}

function makeCutActionKey(pathValue: string): string {
  return `${pathValue}:cut`;
}

function makeStopActionKey(pathValue: string): string {
  return `${pathValue}:stop`;
}

function summarizeRestoreOutput(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`.trim();
  if (!combined) {
    return undefined;
  }

  const firstLine = combined.split("\n").map((line) => line.trim()).find(Boolean);
  if (!firstLine) {
    return undefined;
  }

  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
}

function clientDebugLog(event: string, details?: Record<string, unknown>): void {
  if (!DEBUG_CLIENT_LOGS) {
    return;
  }

  console.debug("[groove-ui]", {
    timestamp: new Date().toISOString(),
    event,
    ...(details ?? {}),
  });
}

function appendRequestId(detail: string | undefined, requestId: string | undefined): string | undefined {
  if (!requestId) {
    return detail;
  }

  if (!detail || detail.trim().length === 0) {
    return `requestId: ${requestId}`;
  }

  return `${detail} (requestId: ${requestId})`;
}

function shouldPromptForceCutRetry(result: CutGrooveApiResponse): boolean {
  const combinedOutput = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();
  const hasDirtyWorktreeHint = /contains modified or untracked files/.test(combinedOutput);
  const hasForceHint = /use --force to delete it/.test(combinedOutput);
  return hasDirtyWorktreeHint && hasForceHint;
}

function getOpencodeStateLabel(state: OpencodeState): string {
  if (state === "not-running") {
    return "not running";
  }

  return state;
}

function getOpencodeBadgeClasses(state: OpencodeState): string {
  if (state === "running") {
    return OPENCODE_RUNNING_CLASSES;
  }

  if (state === "not-running") {
    return OPENCODE_NOT_RUNNING_CLASSES;
  }

  return OPENCODE_UNKNOWN_CLASSES;
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [supportsFileSystem, setSupportsFileSystem] = useState<boolean | null>(null);
  const attemptedSessionRestoreRef = useRef(false);
  const eventRescanTimeoutRef = useRef<number | null>(null);
  const copiedBranchResetTimeoutRef = useRef<number | null>(null);
  const rescanInFlightRef = useRef(false);
  const realtimeUnavailableRef = useRef(false);
  const [pendingRestoreActions, setPendingRestoreActions] = useState<string[]>([]);
  const [pendingCutGrooveActions, setPendingCutGrooveActions] = useState<string[]>([]);
  const [pendingStopActions, setPendingStopActions] = useState<string[]>([]);
  const [copiedBranchPath, setCopiedBranchPath] = useState<string | null>(null);
  const [workspaceRootOverride, setWorkspaceRootOverride] = useState("");
  const [isCloseWorkspaceConfirmOpen, setIsCloseWorkspaceConfirmOpen] = useState(false);
  const [cutConfirmRow, setCutConfirmRow] = useState<WorktreeRow | null>(null);
  const [forceCutConfirmRow, setForceCutConfirmRow] = useState<WorktreeRow | null>(null);
  const [runtimeStateByWorktree, setRuntimeStateByWorktree] = useState<
    Record<string, RuntimeStateRow>
  >({});
  const runtimeFetchCounterRef = useRef(0);

  const activeWorkspaceIdentity = workspaceMeta
    ? makeWorkspaceIdentity(workspaceMeta)
    : null;
  const activeWorkspaceRootName = workspaceMeta?.rootName ?? rootDirectory?.name ?? null;
  const showSettingsWarning =
    activeWorkspaceRootName !== null && workspaceRootOverride.trim().length === 0;
  const forceCutActionKey = forceCutConfirmRow ? makeCutActionKey(forceCutConfirmRow.path) : null;
  const forceCutConfirmLoading =
    forceCutActionKey !== null && pendingCutGrooveActions.includes(forceCutActionKey);

  useEffect(() => {
    return () => {
      if (eventRescanTimeoutRef.current !== null) {
        window.clearTimeout(eventRescanTimeoutRef.current);
      }

      if (copiedBranchResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedBranchResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSupportsFileSystem(
      typeof window !== "undefined" && "showDirectoryPicker" in window,
    );
  }, []);

  useEffect(() => {
    if (!activeWorkspaceRootName) {
      return;
    }

    if (activeWorkspaceIdentity) {
      setWorkspaceRootOverride(
        readWorkspaceRootOverride(activeWorkspaceIdentity, activeWorkspaceRootName),
      );
      return;
    }

    setWorkspaceRootOverride(readLegacyWorkspaceRootOverride(activeWorkspaceRootName));
  }, [activeWorkspaceIdentity, activeWorkspaceRootName]);

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
        setStatusMessage(null);
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
      realtimeUnavailableRef.current = false;
      setStatusMessage(
        `Workspace is active for this browser session (${selectedDirectory.name}).`,
      );
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsBusy(false);
    }
  };

  const rescanWorktrees = useCallback(
    async (options: RescanOptions = {}): Promise<void> => {
      if (!rootDirectory) {
        clientDebugLog("rescan.skipped", {
          reason: "no-root-directory",
        });
        return;
      }

      if (rescanInFlightRef.current) {
        clientDebugLog("rescan.skipped", {
          reason: "rescan-in-flight",
        });
        return;
      }

      const {
        showBusy = true,
        clearStatusMessage = true,
        showStatusMessage = true,
        surfaceErrors = true,
      } = options;

      try {
        clientDebugLog("rescan.started", {
          rootName: rootDirectory.name,
          options,
        });
        rescanInFlightRef.current = true;
        if (showBusy) {
          setIsBusy(true);
        }

        if (surfaceErrors) {
          setErrorMessage(null);
        }

        if (clearStatusMessage) {
          setStatusMessage(null);
        }

        const scanned = await scanWorktrees(rootDirectory);
        setWorktreeRows(scanned.rows);
        setHasWorktreesDirectory(scanned.hasWorktreesDirectory);
        clientDebugLog("rescan.completed", {
          rootName: rootDirectory.name,
          rowCount: scanned.rows.length,
          hasWorktreesDirectory: scanned.hasWorktreesDirectory,
        });

        if (showStatusMessage) {
          setStatusMessage("Rescanned Groove worktrees.");
        }
      } catch (error) {
        clientDebugLog("rescan.failed", {
          rootName: rootDirectory.name,
          error: error instanceof Error ? error.message : String(error),
        });
        if (surfaceErrors) {
          setErrorMessage(describeError(error));
        }
      } finally {
        rescanInFlightRef.current = false;
        if (showBusy) {
          setIsBusy(false);
        }
      }
    },
    [rootDirectory],
  );

  const fetchRuntimeState = useCallback(
    async (rowsOverride?: WorktreeRow[]): Promise<void> => {
      if (!rootDirectory) {
        setRuntimeStateByWorktree({});
        return;
      }

      const rows = rowsOverride ?? worktreeRows;
      if (rows.length === 0) {
        setRuntimeStateByWorktree({});
        return;
      }

      const fetchId = runtimeFetchCounterRef.current + 1;
      runtimeFetchCounterRef.current = fetchId;

      const params = new URLSearchParams();
      params.set("rootName", workspaceMeta?.rootName ?? rootDirectory.name);

      for (const row of rows) {
        params.append("knownWorktree", row.worktree);
      }

      if (workspaceMeta) {
        params.set("workspaceVersion", String(workspaceMeta.version));
        params.set("workspaceCreatedAt", workspaceMeta.createdAt);
        params.set("workspaceUpdatedAt", workspaceMeta.updatedAt);
      }

      const trimmedWorkspaceRootOverride = workspaceRootOverride.trim();
      if (trimmedWorkspaceRootOverride.startsWith("/")) {
        params.set("workspaceRoot", trimmedWorkspaceRootOverride);
      }

      const requestUrl = `/api/groove/list?${params.toString()}`;
      clientDebugLog("runtime.fetch.started", {
        url: requestUrl,
        rowsCount: rows.length,
      });

      try {
        const response = await fetch(requestUrl, {
          method: "GET",
          cache: "no-store",
        });
        const result = (await response.json()) as RuntimeListApiResponse;

        if (runtimeFetchCounterRef.current !== fetchId) {
          clientDebugLog("runtime.fetch.discarded", {
            requestId: result.requestId,
          });
          return;
        }

        if (response.ok && result.ok) {
          setRuntimeStateByWorktree(result.rows);
          clientDebugLog("runtime.fetch.completed", {
            requestId: result.requestId,
            rowCount: Object.keys(result.rows).length,
          });
          return;
        }

        setRuntimeStateByWorktree({});
        clientDebugLog("runtime.fetch.failed", {
          status: response.status,
          requestId: result.requestId,
          error: result.error,
        });
      } catch (error) {
        if (runtimeFetchCounterRef.current !== fetchId) {
          return;
        }

        setRuntimeStateByWorktree({});
        clientDebugLog("runtime.fetch.exception", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [rootDirectory, worktreeRows, workspaceMeta, workspaceRootOverride],
  );

  useEffect(() => {
    void fetchRuntimeState();
  }, [fetchRuntimeState]);

  const refreshWorktrees = async (): Promise<void> => {
    await rescanWorktrees();
  };

  const copyBranchName = async (row: WorktreeRow): Promise<void> => {
    try {
      await navigator.clipboard.writeText(row.branchGuess);
      setCopiedBranchPath(row.path);

      if (copiedBranchResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedBranchResetTimeoutRef.current);
      }

      copiedBranchResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedBranchPath((previous) => (previous === row.path ? null : previous));
        copiedBranchResetTimeoutRef.current = null;
      }, 1500);
    } catch {
      toast.error(`Failed to copy branch for ${row.worktree}.`);
    }
  };

  useEffect(() => {
    if (!rootDirectory || realtimeUnavailableRef.current) {
      clientDebugLog("sse.skipped", {
        reason: !rootDirectory ? "no-root-directory" : "realtime-marked-unavailable",
      });
      return;
    }

    const params = new URLSearchParams();
    params.set("rootName", workspaceMeta?.rootName ?? rootDirectory.name);

    for (const row of worktreeRows) {
      params.append("knownWorktree", row.worktree);
    }

    if (workspaceMeta) {
      params.set("workspaceVersion", String(workspaceMeta.version));
      params.set("workspaceCreatedAt", workspaceMeta.createdAt);
      params.set("workspaceUpdatedAt", workspaceMeta.updatedAt);
    }

    const trimmedWorkspaceRootOverride = workspaceRootOverride.trim();
    if (trimmedWorkspaceRootOverride.startsWith("/")) {
      params.set("workspaceRoot", trimmedWorkspaceRootOverride);
    }

    const sseUrl = `/api/groove/events?${params.toString()}`;
    clientDebugLog("sse.connecting", {
      url: sseUrl,
      knownWorktreesCount: worktreeRows.length,
    });
    const eventSource = new EventSource(sseUrl);
    let closed = false;

    eventSource.onopen = () => {
      clientDebugLog("sse.open");
    };

    const scheduleRescan = (): void => {
      if (closed) {
        return;
      }

      clientDebugLog("sse.rescan.scheduled", {
        delayMs: 450,
      });

      if (eventRescanTimeoutRef.current !== null) {
        window.clearTimeout(eventRescanTimeoutRef.current);
      }

      eventRescanTimeoutRef.current = window.setTimeout(() => {
        clientDebugLog("sse.rescan.triggered");
        void rescanWorktrees({
          showBusy: false,
          clearStatusMessage: false,
          showStatusMessage: false,
          surfaceErrors: false,
        });
      }, 450);
    };

    eventSource.addEventListener("ready", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          requestId?: string;
          workspaceRoot?: string;
          kind?: string;
        };
        clientDebugLog("sse.ready", payload);
      } catch {
        clientDebugLog("sse.ready", {
          parseError: true,
        });
      }
    });

    eventSource.addEventListener("workspace-change", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          index?: number;
          source?: string;
          kind?: string;
        };
        clientDebugLog("sse.workspace-change", payload);
      } catch {
        clientDebugLog("sse.workspace-change", {
          parseError: true,
        });
      }
      scheduleRescan();
    });

    eventSource.onerror = () => {
      clientDebugLog("sse.error", {
        closed,
      });
      realtimeUnavailableRef.current = true;
      eventSource.close();

      if (!closed) {
        setStatusMessage((previousMessage) =>
          previousMessage ?? "Realtime updates are unavailable. Use Refresh for manual rescans.",
        );
      }
    };

    return () => {
      closed = true;
      clientDebugLog("sse.closing");
      eventSource.close();
      if (eventRescanTimeoutRef.current !== null) {
        window.clearTimeout(eventRescanTimeoutRef.current);
        eventRescanTimeoutRef.current = null;
      }
    };
  }, [rootDirectory, rescanWorktrees, workspaceMeta, workspaceRootOverride, worktreeRows]);

  const closeCurrentWorkspace = async (): Promise<void> => {
    try {
      setIsBusy(true);
      setErrorMessage(null);

      clearActiveWorkspaceSession();
      await clearPersistedActiveWorkspaceHandle();

      setRootDirectory(null);
      setWorkspaceMeta(null);
      setWorktreeRows([]);
      setHasWorktreesDirectory(null);
      setPendingRestoreActions([]);
      setPendingCutGrooveActions([]);
      setPendingStopActions([]);
      setCopiedBranchPath(null);
      setRuntimeStateByWorktree({});
      setWorkspaceRootOverride("");
      realtimeUnavailableRef.current = false;
      setStatusMessage("Workspace closed. Select a directory to continue.");
      toast.success("Current workspace closed.");
    } catch {
      setErrorMessage("Failed to fully clear workspace session. Try again.");
      toast.error("Failed to close current workspace.");
    } finally {
      setIsBusy(false);
    }
  };

  const requestCloseCurrentWorkspace = (): void => {
    setIsCloseWorkspaceConfirmOpen(true);
  };

  const requestCutGrooveAction = (row: WorktreeRow): void => {
    setCutConfirmRow(row);
  };

  const confirmCutGrooveAction = (): void => {
    if (!cutConfirmRow) {
      return;
    }

    const selectedRow = cutConfirmRow;
    setCutConfirmRow(null);
    void runCutGrooveAction(selectedRow);
  };

  const confirmForceCutGrooveAction = (): void => {
    if (!forceCutConfirmRow) {
      return;
    }

    const selectedRow = forceCutConfirmRow;
    setForceCutConfirmRow(null);
    void runCutGrooveAction(selectedRow, true);
  };

  const runRestoreAction = async (
    row: WorktreeRow,
  ): Promise<void> => {
    if (!rootDirectory) {
      toast.error("Select a workspace directory before running restore.");
      return;
    }

    const trimmedWorkspaceRootOverride = workspaceRootOverride.trim();
    if (
      trimmedWorkspaceRootOverride.length > 0 &&
      !trimmedWorkspaceRootOverride.startsWith("/")
    ) {
      toast.error("Workspace root override must be an absolute path starting with '/'.");
      return;
    }

    const actionKey = makeRestoreActionKey(row.path);
    setPendingRestoreActions((previous) =>
      previous.includes(actionKey) ? previous : [...previous, actionKey],
    );

    const payload: RestoreRequestPayload = {
      rootName: workspaceMeta?.rootName ?? rootDirectory.name,
      knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
      ...(workspaceMeta ? { workspaceMeta } : {}),
      ...(trimmedWorkspaceRootOverride.length > 0
        ? { workspaceRoot: trimmedWorkspaceRootOverride }
        : {}),
      worktree: row.worktree,
    };

    clientDebugLog("restore.triggered", {
      worktree: row.worktree,
      rootName: payload.rootName,
      knownWorktreesCount: payload.knownWorktrees.length,
      workspaceRootProvided: typeof payload.workspaceRoot === "string",
    });

    try {
      const response = await fetch("/api/groove/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as RestoreApiResponse;
      const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);
      clientDebugLog("restore.response", {
        status: response.status,
        ok: result.ok,
        requestId: result.requestId,
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        preview: shortOutput,
      });

      if (response.ok && result.ok) {
        toast.success(`Restore completed for ${row.worktree}.`, {
          description: appendRequestId(shortOutput, result.requestId),
        });

        await rescanWorktrees({
          showBusy: false,
          clearStatusMessage: false,
          showStatusMessage: false,
          surfaceErrors: false,
        });
        return;
      }

      toast.error(`Restore failed for ${row.worktree}.`, {
        description: appendRequestId(
          result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`,
          result.requestId,
        ),
      });
    } catch (error) {
      clientDebugLog("restore.request.failed", {
        worktree: row.worktree,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(`Restore request failed for ${row.worktree}.`);
    } finally {
      setPendingRestoreActions((previous) =>
        previous.filter((candidate) => candidate !== actionKey),
      );
    }
  };

  const runCutGrooveAction = async (row: WorktreeRow, force = false): Promise<void> => {
    if (!rootDirectory) {
      toast.error("Select a workspace directory before running Cut groove.");
      return;
    }

    const trimmedWorkspaceRootOverride = workspaceRootOverride.trim();
    if (
      trimmedWorkspaceRootOverride.length > 0 &&
      !trimmedWorkspaceRootOverride.startsWith("/")
    ) {
      toast.error("Workspace root override must be an absolute path starting with '/'.");
      return;
    }

    const actionKey = makeCutActionKey(row.path);
    setPendingCutGrooveActions((previous) =>
      previous.includes(actionKey) ? previous : [...previous, actionKey],
    );

    const payload: CutGrooveRequestPayload = {
      rootName: workspaceMeta?.rootName ?? rootDirectory.name,
      knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
      ...(workspaceMeta ? { workspaceMeta } : {}),
      ...(trimmedWorkspaceRootOverride.length > 0
        ? { workspaceRoot: trimmedWorkspaceRootOverride }
        : {}),
      target: row.worktree,
      worktree: row.worktree,
      ...(force ? { force: true } : {}),
    };

    clientDebugLog("cut.triggered", {
      worktree: row.worktree,
      branchGuess: row.branchGuess,
      force,
      rootName: payload.rootName,
      knownWorktreesCount: payload.knownWorktrees.length,
      workspaceRootProvided: typeof payload.workspaceRoot === "string",
    });

    try {
      const response = await fetch("/api/groove/rm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as CutGrooveApiResponse;
      const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);
      clientDebugLog("cut.response", {
        status: response.status,
        ok: result.ok,
        requestId: result.requestId,
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        preview: shortOutput,
        force,
      });

      if (response.ok && result.ok) {
        toast.success(
          force
            ? `Cut groove completed for ${row.branchGuess} with force deletion.`
            : `Cut groove completed for ${row.branchGuess}.`,
          {
            description: appendRequestId(shortOutput, result.requestId),
          },
        );

        await rescanWorktrees({
          showBusy: false,
          clearStatusMessage: false,
          showStatusMessage: false,
          surfaceErrors: false,
        });
        return;
      }

      if (!force && shouldPromptForceCutRetry(result)) {
        clientDebugLog("cut.force-prompt.shown", {
          branchGuess: row.branchGuess,
          requestId: result.requestId,
        });
        setForceCutConfirmRow(row);
        return;
      }

      toast.error(`Cut groove failed for ${row.branchGuess}.`, {
        description: appendRequestId(
          result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`,
          result.requestId,
        ),
      });
    } catch (error) {
      clientDebugLog("cut.request.failed", {
        branchGuess: row.branchGuess,
        force,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(`Cut groove request failed for ${row.branchGuess}.`);
    } finally {
      setPendingCutGrooveActions((previous) =>
        previous.filter((candidate) => candidate !== actionKey),
      );
    }
  };

  const runStopAction = async (
    row: WorktreeRow,
    runtimeRow: RuntimeStateRow | undefined,
  ): Promise<void> => {
    if (!rootDirectory) {
      toast.error("Select a workspace directory before stopping opencode.");
      return;
    }

    const trimmedWorkspaceRootOverride = workspaceRootOverride.trim();
    if (
      trimmedWorkspaceRootOverride.length > 0 &&
      !trimmedWorkspaceRootOverride.startsWith("/")
    ) {
      toast.error("Workspace root override must be an absolute path starting with '/'.");
      return;
    }

    const actionKey = makeStopActionKey(row.path);
    setPendingStopActions((previous) =>
      previous.includes(actionKey) ? previous : [...previous, actionKey],
    );

    const payload: StopRequestPayload = {
      rootName: workspaceMeta?.rootName ?? rootDirectory.name,
      knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
      ...(workspaceMeta ? { workspaceMeta } : {}),
      ...(trimmedWorkspaceRootOverride.length > 0
        ? { workspaceRoot: trimmedWorkspaceRootOverride }
        : {}),
      worktree: row.worktree,
      ...(runtimeRow?.opencodeInstanceId
        ? { instanceId: runtimeRow.opencodeInstanceId }
        : {}),
    };

    clientDebugLog("stop.triggered", {
      worktree: row.worktree,
      rootName: payload.rootName,
      knownWorktreesCount: payload.knownWorktrees.length,
      workspaceRootProvided: typeof payload.workspaceRoot === "string",
      hasInstanceId: typeof payload.instanceId === "string",
    });

    try {
      const response = await fetch("/api/groove/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as StopApiResponse;
      clientDebugLog("stop.response", {
        status: response.status,
        ok: result.ok,
        requestId: result.requestId,
        alreadyStopped: result.alreadyStopped,
        pid: result.pid,
        source: result.source,
      });

      if (response.ok && result.ok) {
        if (result.alreadyStopped) {
          toast.info(`Opencode is already stopped for ${row.worktree}.`, {
            description: appendRequestId(
              result.pid
                ? `PID ${String(result.pid)} is not running.`
                : "No running PID found for this worktree.",
              result.requestId,
            ),
          });
        } else {
          toast.success(`Stopped opencode for ${row.worktree}.`, {
            description: appendRequestId(
              result.pid ? `Sent SIGTERM to PID ${String(result.pid)}.` : undefined,
              result.requestId,
            ),
          });
        }

        await Promise.all([
          rescanWorktrees({
            showBusy: false,
            clearStatusMessage: false,
            showStatusMessage: false,
            surfaceErrors: false,
          }),
          fetchRuntimeState(),
        ]);
        return;
      }

      toast.error(`Stop failed for ${row.worktree}.`, {
        description: appendRequestId(result.error, result.requestId),
      });
    } catch (error) {
      clientDebugLog("stop.request.failed", {
        worktree: row.worktree,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(`Stop request failed for ${row.worktree}.`);
    } finally {
      setPendingStopActions((previous) =>
        previous.filter((candidate) => candidate !== actionKey),
      );
    }
  };

  const runPlayGrooveAction = async (row: WorktreeRow): Promise<void> => {
    if (!rootDirectory) {
      toast.error("Select a workspace directory before playing groove.");
      return;
    }

    const trimmedWorkspaceRootOverride = workspaceRootOverride.trim();
    if (
      trimmedWorkspaceRootOverride.length > 0 &&
      !trimmedWorkspaceRootOverride.startsWith("/")
    ) {
      toast.error("Workspace root override must be an absolute path starting with '/'.");
      return;
    }

    const actionKey = makeStopActionKey(row.path);
    setPendingStopActions((previous) =>
      previous.includes(actionKey) ? previous : [...previous, actionKey],
    );

    const payload: RestoreRequestPayload = {
      rootName: workspaceMeta?.rootName ?? rootDirectory.name,
      knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
      ...(workspaceMeta ? { workspaceMeta } : {}),
      ...(trimmedWorkspaceRootOverride.length > 0
        ? { workspaceRoot: trimmedWorkspaceRootOverride }
        : {}),
      worktree: row.worktree,
      action: "go",
      target: row.branchGuess,
    };

    clientDebugLog("go.triggered", {
      worktree: row.worktree,
      branchGuess: row.branchGuess,
      rootName: payload.rootName,
      knownWorktreesCount: payload.knownWorktrees.length,
      workspaceRootProvided: typeof payload.workspaceRoot === "string",
    });

    try {
      const response = await fetch("/api/groove/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as RestoreApiResponse;
      const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);
      clientDebugLog("go.response", {
        status: response.status,
        ok: result.ok,
        requestId: result.requestId,
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        preview: shortOutput,
      });

      if (response.ok && result.ok) {
        toast.success(`Play groove completed for ${row.branchGuess}.`, {
          description: appendRequestId(shortOutput, result.requestId),
        });

        await Promise.all([
          rescanWorktrees({
            showBusy: false,
            clearStatusMessage: false,
            showStatusMessage: false,
            surfaceErrors: false,
          }),
          fetchRuntimeState(),
        ]);
        return;
      }

      toast.error(`Play groove failed for ${row.branchGuess}.`, {
        description: appendRequestId(
          result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`,
          result.requestId,
        ),
      });
    } catch (error) {
      clientDebugLog("go.request.failed", {
        worktree: row.worktree,
        branchGuess: row.branchGuess,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(`Play groove request failed for ${row.branchGuess}.`);
    } finally {
      setPendingStopActions((previous) =>
        previous.filter((candidate) => candidate !== actionKey),
      );
    }
  };

  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation showSettingsWarning={showSettingsWarning} />

        <div className="min-w-0 flex-1 space-y-4">
          {!rootDirectory ? (
            <Card className="mx-auto w-full max-w-xl" aria-live="polite">
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
            <div aria-live="polite" className="space-y-3">
              <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
                <div className="space-y-1">
                  <h1 className="text-xl font-semibold tracking-tight">Groove</h1>
                  <p className="text-sm text-muted-foreground">
                    Directory: <span className="font-medium text-foreground">{rootDirectory.name}</span>
                  </p>
                </div>
                <TooltipProvider>
                  <div className="flex flex-wrap gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          onClick={refreshWorktrees}
                          disabled={isBusy}
                          size="sm"
                          className="w-8 px-0"
                          aria-label="Refresh"
                        >
                          {isBusy ? (
                            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                          ) : (
                            <RefreshCw aria-hidden="true" className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={pickDirectory}
                          disabled={isBusy}
                          size="sm"
                          className="w-8 px-0"
                          aria-label="Pick another directory"
                        >
                          <FolderOpen aria-hidden="true" className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Pick another directory</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={requestCloseCurrentWorkspace}
                          disabled={isBusy}
                          size="sm"
                          className="w-8 px-0"
                          aria-label="Close current workspace"
                        >
                          <X aria-hidden="true" className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Close current workspace</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </header>

              <Card>
                <CardContent className="space-y-3 pt-6">
            {!hasWorktreesDirectory ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No <code>.worktrees</code> directory found under this workspace root yet.
              </p>
            ) : worktreeRows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <code>.worktrees</code> exists, but no worktree directories were found.
              </p>
            ) : (
              <>
                <div role="region" aria-label="Groove worktrees table" className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worktree</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Opencode</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {worktreeRows.map((row) => {
                        const restoreActionKey = makeRestoreActionKey(row.path);
                        const cutActionKey = makeCutActionKey(row.path);
                        const stopActionKey = makeStopActionKey(row.path);
                        const branchCopied = copiedBranchPath === row.path;
                        const restorePending = pendingRestoreActions.includes(restoreActionKey);
                        const cutPending = pendingCutGrooveActions.includes(cutActionKey);
                        const stopPending = pendingStopActions.includes(stopActionKey);
                        const rowPending = restorePending || cutPending || stopPending;
                        const runtimeRow = runtimeStateByWorktree[row.worktree];
                        const showRuntimePlaceholder = row.status === "missing .groove";
                        const opencodeState = runtimeRow?.opencodeState ?? "unknown";
                        const opencodeInstanceId = runtimeRow?.opencodeInstanceId;
                        const hasRunningOpencodeInstance =
                          !showRuntimePlaceholder &&
                          opencodeState === "running" &&
                          typeof opencodeInstanceId === "string" &&
                          opencodeInstanceId.trim().length > 0;

                        return (
                          <TableRow key={row.path}>
                        <TableCell>{row.worktree}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => {
                              void copyBranchName(row);
                            }}
                            className="group inline-flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label={`Copy branch name ${row.branchGuess}`}
                          >
                            <span className="truncate">{row.branchGuess}</span>
                            {branchCopied ? (
                              <Check aria-hidden="true" className="size-3.5 shrink-0 text-emerald-700" />
                            ) : (
                              <Copy
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                              />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={row.status === "ready" ? READY_STATUS_CLASSES : MISSING_STATUS_CLASSES}
                          >
                            {row.status === "ready" ? (
                              <CircleCheck aria-hidden="true" />
                            ) : (
                              <AlertTriangle aria-hidden="true" />
                            )}
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {showRuntimePlaceholder ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={getOpencodeBadgeClasses(opencodeState)}
                              >
                                {getOpencodeStateLabel(opencodeState)}
                              </Badge>
                              {opencodeInstanceId ? (
                                <span
                                  className="font-mono text-xs text-muted-foreground"
                                  title={`instance=${opencodeInstanceId}`}
                                >
                                  {opencodeInstanceId}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      void runRestoreAction(row);
                                    }}
                                    aria-label={`Run restore for ${row.worktree}`}
                                    disabled={rowPending}
                                  >
                                    {restorePending ? (
                                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                                    ) : (
                                      <Wrench aria-hidden="true" className="size-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Run restore</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      if (hasRunningOpencodeInstance) {
                                        void runStopAction(row, runtimeRow);
                                      } else {
                                        void runPlayGrooveAction(row);
                                      }
                                    }}
                                    aria-label={`${hasRunningOpencodeInstance ? "Stop opencode" : "Play groove"} for ${row.worktree}`}
                                    disabled={rowPending}
                                  >
                                    {stopPending ? (
                                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                                    ) : (
                                      <>
                                        {hasRunningOpencodeInstance ? (
                                          <CircleStop aria-hidden="true" className="size-4" />
                                        ) : (
                                          <Play aria-hidden="true" className="size-4" />
                                        )}
                                      </>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {hasRunningOpencodeInstance ? "Stop opencode" : "Play groove"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      requestCutGrooveAction(row);
                                    }}
                                    aria-label={`Remove worktree ${row.worktree}`}
                                    disabled={rowPending}
                                  >
                                    {cutPending ? (
                                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                                    ) : (
                                      <Trash2 aria-hidden="true" className="size-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove worktree</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
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
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={cutConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCutConfirmRow(null);
          }
        }}
        title="Cut this groove?"
        description={
          cutConfirmRow
            ? `This removes worktree "${cutConfirmRow.worktree}" (branch "${cutConfirmRow.branchGuess}").`
            : "This removes the selected worktree."
        }
        confirmLabel="Cut groove"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmCutGrooveAction}
        onCancel={() => {
          setCutConfirmRow(null);
        }}
      />

      <ConfirmModal
        open={forceCutConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setForceCutConfirmRow(null);
          }
        }}
        title="Force cut this groove?"
        description={
          forceCutConfirmRow
            ? `Worktree "${forceCutConfirmRow.worktree}" contains modified or untracked files. Force deletion is irreversible and there is no turn back.`
            : "This worktree contains modified or untracked files. Force deletion is irreversible and there is no turn back."
        }
        confirmLabel="Force delete worktree"
        cancelLabel="Keep worktree"
        destructive
        loading={forceCutConfirmLoading}
        onConfirm={confirmForceCutGrooveAction}
        onCancel={() => {
          setForceCutConfirmRow(null);
        }}
      />

      <ConfirmModal
        open={isCloseWorkspaceConfirmOpen}
        onOpenChange={setIsCloseWorkspaceConfirmOpen}
        title="Close current workspace?"
        description="This clears the active workspace session in this browser until you select a directory again."
        confirmLabel="Close workspace"
        cancelLabel="Keep workspace open"
        loading={isBusy}
        onConfirm={() => {
          setIsCloseWorkspaceConfirmOpen(false);
          void closeCurrentWorkspace();
        }}
        onCancel={() => {
          setIsCloseWorkspaceConfirmOpen(false);
        }}
      />
    </main>
  );
}
