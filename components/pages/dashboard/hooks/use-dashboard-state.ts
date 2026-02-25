import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ActiveWorkspace,
  RestoreApiResponse,
  RuntimeListApiResponse,
  RuntimeStateRow,
  StopApiResponse,
  TestingEnvironmentColor,
  TestingEnvironmentState,
  WorkspaceMeta,
  WorktreeRow,
} from "@/components/pages/dashboard/types";
import { getTestingEnvironmentColor } from "@/components/pages/dashboard/constants";
import { toast } from "@/lib/toast";
import type { GroupedWorktreeItem } from "@/lib/utils/time/grouping";
import { buildGroupedWorktreeItems } from "@/lib/utils/time/grouping";
import { describeWorkspaceContextError } from "@/lib/utils/workspace/context";
import { shouldPromptForceCutRetry } from "@/lib/utils/worktree/status";
import {
  grooveList,
  grooveNew,
  grooveRestore,
  grooveRm,
  grooveStop,
  listenWorkspaceChange,
  listenWorkspaceReady,
  testingEnvironmentGetStatus,
  testingEnvironmentSetTarget,
  testingEnvironmentStart,
  testingEnvironmentStartSeparateTerminal,
  testingEnvironmentStop,
  workspaceClearActive,
  workspaceEvents,
  workspaceGetActive,
  workspaceGitignoreSanityApply,
  workspaceGitignoreSanityCheck,
  workspaceOpen,
  workspaceOpenTerminal,
  workspacePickAndOpen,
  type WorkspaceContextResponse,
  type WorkspaceGitignoreSanityResponse,
  type TestingEnvironmentEntry,
} from "@/src/lib/ipc";

const DEBUG_CLIENT_LOGS = import.meta.env.VITE_GROOVE_DEBUG_LOGS === "true";
const EVENT_RESCAN_DEBOUNCE_MS = 700;
const EVENT_RESCAN_MIN_INTERVAL_MS = 2200;
const WORKSPACE_RESCAN_REQUEST_TTL_MS = 2500;
const RUNTIME_FETCH_DEBOUNCE_MS = 200;
const RUNTIME_FETCH_REQUEST_TTL_MS = 2000;
const RECENT_DIRECTORIES_STORAGE_KEY = "groove:recent-directories";
const MAX_RECENT_DIRECTORIES = 5;

function readStoredRecentDirectories(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_DIRECTORIES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .filter((candidate): candidate is string => typeof candidate === "string")
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0);

    const deduplicated = normalized.filter((candidate, index) => normalized.indexOf(candidate) === index);
    return deduplicated.slice(0, MAX_RECENT_DIRECTORIES);
  } catch {
    return [];
  }
}

function persistRecentDirectories(directories: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RECENT_DIRECTORIES_STORAGE_KEY, JSON.stringify(directories));
  } catch {
    return;
  }
}

function buildRecentDirectories(nextDirectory: string, previousDirectories: string[]): string[] {
  const normalizedDirectory = nextDirectory.trim();
  if (!normalizedDirectory) {
    return previousDirectories;
  }

  const deduplicated = previousDirectories.filter((candidate) => candidate !== normalizedDirectory);
  return [normalizedDirectory, ...deduplicated].slice(0, MAX_RECENT_DIRECTORIES);
}

function isSameWorkspaceMeta(left: WorkspaceMeta | null, right: WorkspaceMeta | null): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.version === right.version &&
    left.rootName === right.rootName &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.defaultTerminal === right.defaultTerminal &&
    left.terminalCustomCommand === right.terminalCustomCommand
  );
}

function areWorktreeRowsEqual(left: WorktreeRow[], right: WorktreeRow[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((row, index) => {
    const candidate = right[index];
    return (
      row.worktree === candidate.worktree &&
      row.branchGuess === candidate.branchGuess &&
      row.path === candidate.path &&
      row.status === candidate.status &&
      row.lastExecutedAt === candidate.lastExecutedAt
    );
  });
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

export function useDashboardState() {
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace | null>(null);
  const [worktreeRows, setWorktreeRows] = useState<WorktreeRow[]>([]);
  const [hasWorktreesDirectory, setHasWorktreesDirectory] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingRestoreActions, setPendingRestoreActions] = useState<string[]>([]);
  const [pendingCutGrooveActions, setPendingCutGrooveActions] = useState<string[]>([]);
  const [pendingStopActions, setPendingStopActions] = useState<string[]>([]);
  const [pendingPlayActions, setPendingPlayActions] = useState<string[]>([]);
  const [pendingTestActions, setPendingTestActions] = useState<string[]>([]);
  const [copiedBranchPath, setCopiedBranchPath] = useState<string | null>(null);
  const [isCloseWorkspaceConfirmOpen, setIsCloseWorkspaceConfirmOpen] = useState(false);
  const [cutConfirmRow, setCutConfirmRow] = useState<WorktreeRow | null>(null);
  const [forceCutConfirmRow, setForceCutConfirmRow] = useState<WorktreeRow | null>(null);
  const [runtimeStateByWorktree, setRuntimeStateByWorktree] = useState<Record<string, RuntimeStateRow>>({});
  const [testingEnvironment, setTestingEnvironment] = useState<TestingEnvironmentState | null>(null);
  const [unsetTestingEnvironmentConfirm, setUnsetTestingEnvironmentConfirm] = useState<TestingEnvironmentEntry | null>(null);
  const [isTestingInstancePending, setIsTestingInstancePending] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createBranch, setCreateBranch] = useState("");
  const [createBase, setCreateBase] = useState("");
  const [isCreatePending, setIsCreatePending] = useState(false);
  const [recentDirectories, setRecentDirectories] = useState<string[]>([]);
  const [gitignoreSanity, setGitignoreSanity] = useState<WorkspaceGitignoreSanityResponse | null>(null);
  const [gitignoreSanityStatusMessage, setGitignoreSanityStatusMessage] = useState<string | null>(null);
  const [gitignoreSanityErrorMessage, setGitignoreSanityErrorMessage] = useState<string | null>(null);
  const [isGitignoreSanityChecking, setIsGitignoreSanityChecking] = useState(false);
  const [isGitignoreSanityApplyPending, setIsGitignoreSanityApplyPending] = useState(false);

  const runtimeFetchCounterRef = useRef(0);
  const eventRescanTimeoutRef = useRef<number | null>(null);
  const runtimeFetchTimeoutRef = useRef<number | null>(null);
  const copiedBranchResetTimeoutRef = useRef<number | null>(null);
  const rescanInFlightRef = useRef(false);
  const rescanQueuedRef = useRef(false);
  const workspaceRescanLastRequestRef = useRef<{ key: string; at: number } | null>(null);
  const lastRescanAtRef = useRef<number>(0);
  const runtimeFetchInFlightRef = useRef(false);
  const runtimeFetchQueuedRef = useRef(false);
  const runtimeFetchLastRequestRef = useRef<{ key: string; at: number } | null>(null);
  const runtimeFetchScheduledRef = useRef<{ key: string; at: number } | null>(null);
  const realtimeUnavailableRef = useRef(false);

  const workspaceMeta = activeWorkspace?.workspaceMeta ?? null;
  const workspaceRoot = activeWorkspace?.workspaceRoot ?? null;
  const forceCutActionKey = forceCutConfirmRow ? `${forceCutConfirmRow.path}:cut` : null;
  const forceCutConfirmLoading = forceCutActionKey !== null && pendingCutGrooveActions.includes(forceCutActionKey);
  const testingEnvironments = useMemo<TestingEnvironmentEntry[]>(() => {
    return testingEnvironment?.environments ?? [];
  }, [testingEnvironment]);
  const testingTargetWorktrees = useMemo<string[]>(() => {
    return testingEnvironments.filter((environment) => environment.isTarget).map((environment) => environment.worktree);
  }, [testingEnvironments]);
  const testingRunningWorktrees = useMemo<string[]>(() => {
    return testingEnvironments.filter((environment) => environment.status === "running").map((environment) => environment.worktree);
  }, [testingEnvironments]);
  const testingEnvironmentColorByWorktree = useMemo<Record<string, TestingEnvironmentColor>>(() => {
    return testingEnvironments.reduce<Record<string, TestingEnvironmentColor>>((colors, environment) => {
      colors[environment.worktree] = getTestingEnvironmentColor(environment.worktree);
      return colors;
    }, {});
  }, [testingEnvironments]);

  const groupedWorktreeItems = useMemo<GroupedWorktreeItem[]>(() => {
    return buildGroupedWorktreeItems(worktreeRows);
  }, [worktreeRows]);

  const knownWorktrees = useMemo<string[]>(() => {
    return worktreeRows
      .filter((row) => row.status !== "deleted")
      .map((row) => row.worktree)
      .sort((left, right) => left.localeCompare(right));
  }, [worktreeRows]);

  const knownWorktreesKey = useMemo<string>(() => {
    return knownWorktrees.join("|");
  }, [knownWorktrees]);

  const runtimeFetchRequestKey = useMemo<string | null>(() => {
    if (!workspaceRoot || !workspaceMeta || knownWorktrees.length === 0) {
      return null;
    }

    return [workspaceRoot, workspaceMeta.rootName, workspaceMeta.updatedAt ?? "", knownWorktreesKey].join("::");
  }, [knownWorktrees.length, knownWorktreesKey, workspaceMeta, workspaceRoot]);

  const workspaceRescanRequestKey = useMemo<string | null>(() => {
    if (!workspaceRoot) {
      return null;
    }
    return [workspaceRoot, workspaceMeta?.updatedAt ?? "", knownWorktreesKey].join("::");
  }, [knownWorktreesKey, workspaceMeta?.updatedAt, workspaceRoot]);

  const applyWorkspaceContext = useCallback((result: WorkspaceContextResponse): void => {
    if (!result.workspaceRoot || !result.workspaceMeta || typeof result.hasWorktreesDirectory !== "boolean") {
      return;
    }
    const hasWorktreesDirectory = result.hasWorktreesDirectory;
    const nextWorkspace = {
      workspaceRoot: result.workspaceRoot,
      repositoryRemoteUrl: result.repositoryRemoteUrl,
      workspaceMeta: result.workspaceMeta,
      hasWorktreesDirectory,
      rows: result.rows,
    };
    setActiveWorkspace((previous) => {
      if (
        previous &&
        previous.workspaceRoot === nextWorkspace.workspaceRoot &&
        previous.repositoryRemoteUrl === nextWorkspace.repositoryRemoteUrl &&
        previous.hasWorktreesDirectory === nextWorkspace.hasWorktreesDirectory &&
        isSameWorkspaceMeta(previous.workspaceMeta, nextWorkspace.workspaceMeta) &&
        areWorktreeRowsEqual(previous.rows, nextWorkspace.rows)
      ) {
        return previous;
      }
      return nextWorkspace;
    });
    setWorktreeRows((previous) => (areWorktreeRowsEqual(previous, result.rows) ? previous : result.rows));
    setHasWorktreesDirectory((previous) => (previous === hasWorktreesDirectory ? previous : hasWorktreesDirectory));
  }, []);

  useEffect(() => {
    setRecentDirectories(readStoredRecentDirectories());
  }, []);

  useEffect(() => {
    return () => {
      if (eventRescanTimeoutRef.current !== null) {
        window.clearTimeout(eventRescanTimeoutRef.current);
      }
      if (runtimeFetchTimeoutRef.current !== null) {
        window.clearTimeout(runtimeFetchTimeoutRef.current);
      }
      if (copiedBranchResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedBranchResetTimeoutRef.current);
      }
    };
  }, []);

  const pushRecentDirectory = useCallback((directoryPath: string): void => {
    setRecentDirectories((previous) => {
      const nextDirectories = buildRecentDirectories(directoryPath, previous);
      if (nextDirectories.length === previous.length && nextDirectories.every((candidate, index) => candidate === previous[index])) {
        return previous;
      }

      persistRecentDirectories(nextDirectories);
      return nextDirectories;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await workspaceGetActive();
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setErrorMessage(describeWorkspaceContextError(result));
          return;
        }
        if (!result.workspaceRoot) {
          return;
        }
        applyWorkspaceContext(result);
        pushRecentDirectory(result.workspaceRoot);
      } catch {
        if (!cancelled) {
          setErrorMessage("Failed to restore active workspace.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyWorkspaceContext, pushRecentDirectory]);

  const pickDirectory = useCallback(async (): Promise<void> => {
    try {
      setIsBusy(true);
      setErrorMessage(null);
      setStatusMessage(null);
      const result = await workspacePickAndOpen();
      if (result.cancelled) {
        return;
      }
      if (!result.ok) {
        setErrorMessage(describeWorkspaceContextError(result));
        return;
      }
      applyWorkspaceContext(result);
      if (result.workspaceRoot) {
        pushRecentDirectory(result.workspaceRoot);
      }
      realtimeUnavailableRef.current = false;
      setStatusMessage(`Workspace is active (${result.workspaceMeta?.rootName ?? "unknown"}).`);
    } catch {
      setErrorMessage("Unable to pick workspace directory.");
    } finally {
      setIsBusy(false);
    }
  }, [applyWorkspaceContext, pushRecentDirectory]);

  const openRecentDirectory = useCallback(
    async (directoryPath: string): Promise<void> => {
      const normalizedPath = directoryPath.trim();
      if (!normalizedPath) {
        return;
      }

      try {
        setIsBusy(true);
        setErrorMessage(null);
        setStatusMessage(null);
        const result = await workspaceOpen(normalizedPath);
        if (!result.ok) {
          setErrorMessage(describeWorkspaceContextError(result));
          return;
        }
        applyWorkspaceContext(result);
        pushRecentDirectory(normalizedPath);
        realtimeUnavailableRef.current = false;
        setStatusMessage(`Workspace is active (${result.workspaceMeta?.rootName ?? "unknown"}).`);
      } catch {
        setErrorMessage("Unable to open selected recent directory.");
      } finally {
        setIsBusy(false);
      }
    },
    [applyWorkspaceContext, pushRecentDirectory],
  );

  const loadGitignoreSanityCheck = useCallback(
    async (options?: { showPending?: boolean }): Promise<void> => {
      if (!workspaceRoot) {
        setGitignoreSanity(null);
        setGitignoreSanityErrorMessage(null);
        return;
      }

      const showPending = options?.showPending !== false;

      try {
        if (showPending) {
          setIsGitignoreSanityChecking(true);
        }
        const result = await workspaceGitignoreSanityCheck();
        if (!result.ok) {
          setGitignoreSanity(null);
          setGitignoreSanityErrorMessage(result.error ?? "Failed to check .gitignore sanity.");
          return;
        }

        setGitignoreSanity(result);
        setGitignoreSanityErrorMessage(null);
      } catch {
        setGitignoreSanity(null);
        setGitignoreSanityErrorMessage("Failed to check .gitignore sanity.");
      } finally {
        if (showPending) {
          setIsGitignoreSanityChecking(false);
        }
      }
    },
    [workspaceRoot],
  );

  const applyGitignoreSanityPatch = useCallback(async (): Promise<void> => {
    if (!workspaceRoot) {
      return;
    }

    try {
      setIsGitignoreSanityApplyPending(true);
      setGitignoreSanityStatusMessage(null);
      setGitignoreSanityErrorMessage(null);

      const result = await workspaceGitignoreSanityApply();
      if (!result.ok) {
        setGitignoreSanityErrorMessage(result.error ?? "Failed to apply .gitignore sanity patch.");
        return;
      }

      setGitignoreSanity(result);
      if (!result.isApplicable) {
        setGitignoreSanityStatusMessage("No .gitignore found in the active workspace.");
      } else if (result.patched) {
        setGitignoreSanityStatusMessage("Applied Groove .gitignore sanity patch.");
      } else {
        setGitignoreSanityStatusMessage("Groove .gitignore sanity patch is already applied.");
      }

      await loadGitignoreSanityCheck({ showPending: false });
    } catch {
      setGitignoreSanityErrorMessage("Failed to apply .gitignore sanity patch.");
    } finally {
      setIsGitignoreSanityApplyPending(false);
    }
  }, [loadGitignoreSanityCheck, workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot) {
      setGitignoreSanity(null);
      setGitignoreSanityStatusMessage(null);
      setGitignoreSanityErrorMessage(null);
      setIsGitignoreSanityChecking(false);
      setIsGitignoreSanityApplyPending(false);
      return;
    }

    setGitignoreSanityStatusMessage(null);

    void (async () => {
      await loadGitignoreSanityCheck();
    })();
  }, [loadGitignoreSanityCheck, workspaceRoot]);

  const rescanWorktrees = useCallback(async (options?: { force?: boolean }): Promise<void> => {
    if (!workspaceRoot) {
      return;
    }

    if (!options?.force && workspaceRescanRequestKey) {
      const now = Date.now();
      const previousRescan = workspaceRescanLastRequestRef.current;
      if (previousRescan && previousRescan.key === workspaceRescanRequestKey && now - previousRescan.at < WORKSPACE_RESCAN_REQUEST_TTL_MS) {
        return;
      }
      workspaceRescanLastRequestRef.current = {
        key: workspaceRescanRequestKey,
        at: now,
      };
    }

    if (rescanInFlightRef.current) {
      rescanQueuedRef.current = true;
      return;
    }
    try {
      rescanInFlightRef.current = true;
      lastRescanAtRef.current = Date.now();
      setIsBusy(true);
      setErrorMessage(null);
      const result = await workspaceOpen(workspaceRoot);
      if (!result.ok) {
        setErrorMessage(describeWorkspaceContextError(result));
        return;
      }
      applyWorkspaceContext(result);
    } catch {
      setErrorMessage("Failed to rescan workspace worktrees.");
    } finally {
      rescanInFlightRef.current = false;
      setIsBusy(false);
      if (rescanQueuedRef.current) {
        rescanQueuedRef.current = false;
        window.setTimeout(() => {
          void rescanWorktrees();
        }, 120);
      }
    }
  }, [applyWorkspaceContext, workspaceRescanRequestKey, workspaceRoot]);

  const fetchRuntimeState = useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !workspaceMeta || knownWorktrees.length === 0 || !runtimeFetchRequestKey) {
      setRuntimeStateByWorktree({});
      return;
    }
    if (runtimeFetchInFlightRef.current) {
      runtimeFetchQueuedRef.current = true;
      return;
    }

    const now = Date.now();
    const previousRuntimeFetch = runtimeFetchLastRequestRef.current;
    if (
      previousRuntimeFetch &&
      previousRuntimeFetch.key === runtimeFetchRequestKey &&
      now - previousRuntimeFetch.at < RUNTIME_FETCH_REQUEST_TTL_MS
    ) {
      return;
    }
    runtimeFetchInFlightRef.current = true;
    runtimeFetchLastRequestRef.current = {
      key: runtimeFetchRequestKey,
      at: now,
    };

    const fetchId = runtimeFetchCounterRef.current + 1;
    runtimeFetchCounterRef.current = fetchId;

    try {
      const result = (await grooveList({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
      }, {
        intent: "background",
      })) as RuntimeListApiResponse;

      if (runtimeFetchCounterRef.current !== fetchId) {
        return;
      }
      if (!result.ok) {
        setRuntimeStateByWorktree({});
        return;
      }
      setRuntimeStateByWorktree(result.rows);
    } catch {
      if (runtimeFetchCounterRef.current === fetchId) {
        setRuntimeStateByWorktree({});
      }
    } finally {
      runtimeFetchInFlightRef.current = false;
      if (runtimeFetchQueuedRef.current) {
        runtimeFetchQueuedRef.current = false;
        window.setTimeout(() => {
          void fetchRuntimeState();
        }, 120);
      }
    }
  }, [knownWorktrees, runtimeFetchRequestKey, workspaceMeta, workspaceRoot]);

  const scheduleRuntimeStateFetch = useCallback(
    (delayMs = RUNTIME_FETCH_DEBOUNCE_MS): void => {
      const nextKey = runtimeFetchRequestKey;
      if (!nextKey) {
        return;
      }

      const pending = runtimeFetchScheduledRef.current;
      if (
        pending &&
        pending.key === nextKey &&
        Date.now() - pending.at < RUNTIME_FETCH_REQUEST_TTL_MS
      ) {
        return;
      }

      if (runtimeFetchTimeoutRef.current !== null) {
        window.clearTimeout(runtimeFetchTimeoutRef.current);
      }
      runtimeFetchScheduledRef.current = { key: nextKey, at: Date.now() };
      runtimeFetchTimeoutRef.current = window.setTimeout(() => {
        runtimeFetchTimeoutRef.current = null;
        runtimeFetchScheduledRef.current = null;
        void fetchRuntimeState();
      }, delayMs);
    },
    [fetchRuntimeState, runtimeFetchRequestKey],
  );

  const fetchTestingEnvironmentState = useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !workspaceMeta) {
      setTestingEnvironment(null);
      return;
    }

    try {
      const result = await testingEnvironmentGetStatus({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
      });
      if (!result.ok) {
        setTestingEnvironment(null);
        return;
      }
      setTestingEnvironment(result);
    } catch {
      setTestingEnvironment(null);
    }
  }, [knownWorktrees, workspaceMeta, workspaceRoot]);

  useEffect(() => {
    scheduleRuntimeStateFetch(0);
  }, [knownWorktreesKey, scheduleRuntimeStateFetch, workspaceMeta?.rootName, workspaceMeta?.updatedAt, workspaceRoot]);

  useEffect(() => {
    void fetchTestingEnvironmentState();
  }, [fetchTestingEnvironmentState, knownWorktreesKey, workspaceMeta?.rootName, workspaceMeta?.updatedAt, workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot || !workspaceMeta || realtimeUnavailableRef.current) {
      return;
    }

    let closed = false;
    const unlistenHandlers: Array<() => void> = [];

    const cleanupListeners = (): void => {
      for (const unlisten of unlistenHandlers.splice(0)) {
        try {
          unlisten();
        } catch {
          // Ignore listener cleanup errors during unmount.
        }
      }
    };

    const trackUnlisten = (unlisten: () => void): void => {
      if (closed) {
        unlisten();
        return;
      }
      unlistenHandlers.push(unlisten);
    };

    const scheduleRescan = (): void => {
      if (closed) {
        return;
      }

      const elapsedSinceLastRescan = Date.now() - lastRescanAtRef.current;
      const minIntervalDelay = Math.max(0, EVENT_RESCAN_MIN_INTERVAL_MS - elapsedSinceLastRescan);
      const delayMs = Math.max(EVENT_RESCAN_DEBOUNCE_MS, minIntervalDelay);

      if (eventRescanTimeoutRef.current !== null) {
        return;
      }
      eventRescanTimeoutRef.current = window.setTimeout(() => {
        eventRescanTimeoutRef.current = null;
        void (async () => {
          await rescanWorktrees();
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
        })();
      }, delayMs);
    };

    void (async () => {
      try {
        const unlistenReady = await listenWorkspaceReady((payload) => {
          clientDebugLog("events.ready", payload);
        });
        trackUnlisten(unlistenReady);

        const unlistenChange = await listenWorkspaceChange((payload) => {
          clientDebugLog("events.workspace-change", payload);
          scheduleRescan();
        });
        trackUnlisten(unlistenChange);

        const response = await workspaceEvents({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
        });
        if (!response.ok) {
          throw new Error(response.error ?? "Workspace events unavailable.");
        }
      } catch {
        cleanupListeners();
        realtimeUnavailableRef.current = true;
        if (!closed) {
          setStatusMessage((prev) => prev ?? "Realtime updates are unavailable. Use Refresh for manual rescans.");
        }
      }
    })();

    return () => {
      closed = true;
      cleanupListeners();
      if (eventRescanTimeoutRef.current !== null) {
        window.clearTimeout(eventRescanTimeoutRef.current);
        eventRescanTimeoutRef.current = null;
      }
    };
  }, [fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, workspaceRoot]);

  const refreshWorktrees = useCallback(async (): Promise<void> => {
    await rescanWorktrees({ force: true });
    scheduleRuntimeStateFetch(0);
    await fetchTestingEnvironmentState();
  }, [fetchTestingEnvironmentState, rescanWorktrees, scheduleRuntimeStateFetch]);

  const copyBranchName = useCallback(async (row: WorktreeRow): Promise<void> => {
    try {
      await navigator.clipboard.writeText(row.branchGuess);
      setCopiedBranchPath(row.path);
      if (copiedBranchResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedBranchResetTimeoutRef.current);
      }
      copiedBranchResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedBranchPath((prev) => (prev === row.path ? null : prev));
        copiedBranchResetTimeoutRef.current = null;
      }, 1500);
    } catch {
      toast.error("Failed to copy branch name.");
    }
  }, []);

  const runRestoreAction = useCallback(
    async (row: WorktreeRow): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:restore`;
      setPendingRestoreActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

      try {
        const result = (await grooveRestore({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: row.worktree,
        })) as RestoreApiResponse;
        if (result.ok) {
          toast.success("Restore completed.");
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
          return;
        }
        toast.error("Restore failed.");
      } catch {
        toast.error("Restore request failed.");
      } finally {
        setPendingRestoreActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  const runCreateWorktreeAction = useCallback(async (options?: { branchOverride?: string; baseOverride?: string }): Promise<void> => {
    if (!workspaceMeta) {
      return;
    }

    const branch = (options?.branchOverride ?? createBranch).trim();
    const base = (options?.baseOverride ?? createBase).trim();
    if (!branch) {
      toast.error("Branch name is required.");
      return;
    }

    setIsCreatePending(true);
    try {
        const result = await grooveNew({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          branch,
          ...(base ? { base } : {}),
      });
      if (result.ok) {
        setIsCreateModalOpen(false);
        setCreateBranch("");
        setCreateBase("");
        toast.success("Worktree created.");
        await rescanWorktrees({ force: true });
        scheduleRuntimeStateFetch(0);
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Create worktree failed.");
    } catch {
      toast.error("Create worktree request failed.");
    } finally {
      setIsCreatePending(false);
    }
  }, [createBase, createBranch, fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta]);

  const runCutGrooveAction = useCallback(
    async (row: WorktreeRow, force = false): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:cut`;
      setPendingCutGrooveActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

      try {
        const result = await grooveRm({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          target: row.worktree,
          worktree: row.worktree,
          ...(force ? { force: true } : {}),
        });

        if (result.ok) {
          toast.success(
            force ? "Cut groove completed with force deletion." : "Cut groove completed.",
          );
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
          return;
        }

        if (!force && shouldPromptForceCutRetry(result)) {
          setForceCutConfirmRow(row);
          return;
        }
        toast.error("Cut groove failed.");
      } catch {
        toast.error("Cut groove request failed.");
      } finally {
        setPendingCutGrooveActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  const runStopAction = useCallback(
    async (row: WorktreeRow, runtimeRow: RuntimeStateRow | undefined): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:stop`;
      setPendingStopActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

      try {
        const result = (await grooveStop({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: row.worktree,
          ...(runtimeRow?.opencodeInstanceId ? { instanceId: runtimeRow.opencodeInstanceId } : {}),
        })) as StopApiResponse;

        if (result.ok) {
          if (result.alreadyStopped) {
            toast.info("Opencode is already stopped.");
          } else {
            toast.success("Stopped opencode.");
          }
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
          return;
        }

        toast.error("Stop failed.");
      } catch {
        toast.error("Stop request failed.");
      } finally {
        setPendingStopActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  const runPlayGrooveAction = useCallback(
    async (row: WorktreeRow): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:play`;
      setPendingPlayActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

      try {
        const result = (await grooveRestore({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: row.worktree,
          action: "go",
          target: row.branchGuess,
        })) as RestoreApiResponse;
        if (result.ok) {
          toast.success("Opened opencode in terminal.");
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
          return;
        }

        toast.error("Play groove failed.");
      } catch {
        toast.error("Play groove request failed.");
      } finally {
        setPendingPlayActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  type TestingTargetActionTarget = Pick<WorktreeRow, "worktree" | "path">;

  const runSetTestingTargetAction = useCallback(
    async (
      row: TestingTargetActionTarget,
      enabled = true,
      autoStartIfCurrentRunning = false,
      stopRunningProcessesWhenUnset = true,
      workspaceRoot?: string,
    ): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:test`;
      setPendingTestActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

      try {
        const result = await testingEnvironmentSetTarget({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          workspaceRoot,
          worktree: row.worktree,
          enabled,
          autoStartIfCurrentRunning,
          stopRunningProcessesWhenUnset,
        });

        if (result.ok) {
          setTestingEnvironment(result);
          toast.success(enabled ? "Added testing target." : "Removed testing target.");
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
          return;
        }

        toast.error("Failed to set testing target.");
      } catch {
        toast.error("Testing target request failed.");
      } finally {
        setPendingTestActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [fetchTestingEnvironmentState, knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  const runUnsetTestingTargetAction = useCallback(
    async (environment: TestingEnvironmentEntry, stopRunningProcessesWhenUnset: boolean): Promise<void> => {
      await runSetTestingTargetAction(
        {
          worktree: environment.worktree,
          path: environment.worktreePath,
        },
        false,
        false,
        stopRunningProcessesWhenUnset,
        environment.workspaceRoot,
      );
    },
    [runSetTestingTargetAction],
  );

  const onSelectTestingTarget = useCallback(
    (row: WorktreeRow): void => {
      const enabled = !testingTargetWorktrees.includes(row.worktree);
      if (!enabled) {
        const matchedEnvironment = testingEnvironments.find((environment) => environment.worktree === row.worktree);
        const selectedEnvironment =
          matchedEnvironment ?? {
            worktree: row.worktree,
            worktreePath: row.path,
            isTarget: true,
            status: testingRunningWorktrees.includes(row.worktree) ? "running" : "stopped",
          };

        if (selectedEnvironment.status !== "running") {
          void runUnsetTestingTargetAction(selectedEnvironment, true);
          return;
        }

        setUnsetTestingEnvironmentConfirm(selectedEnvironment);
        return;
      }
      void runSetTestingTargetAction(row, enabled);
    },
    [runSetTestingTargetAction, runUnsetTestingTargetAction, testingEnvironments, testingRunningWorktrees, testingTargetWorktrees],
  );

  const runStartTestingInstanceAction = useCallback(async (worktree?: string): Promise<void> => {
    if (!workspaceMeta || (testingTargetWorktrees.length === 0 && !worktree)) {
      toast.error("Select a testing target before running locally.");
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStart({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
        ...(worktree ? { worktree } : {}),
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success("Started local testing.");
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Failed to run local testing environment.");
    } catch {
      toast.error("Local testing start request failed.");
    } finally {
      setIsTestingInstancePending(false);
    }
  }, [fetchTestingEnvironmentState, knownWorktrees, testingTargetWorktrees.length, workspaceMeta]);

  const runStartTestingInstanceSeparateTerminalAction = useCallback(async (worktree?: string): Promise<void> => {
    if (!workspaceMeta || (testingTargetWorktrees.length === 0 && !worktree)) {
      toast.error("Select a testing target before running locally.");
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStartSeparateTerminal({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
        ...(worktree ? { worktree } : {}),
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success("Started local testing in a new terminal.");
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Failed to run local testing environment in a new terminal.");
    } catch {
      toast.error("Local testing start request failed.");
    } finally {
      setIsTestingInstancePending(false);
    }
  }, [fetchTestingEnvironmentState, knownWorktrees, testingTargetWorktrees.length, workspaceMeta]);

  const runOpenTestingTerminalAction = useCallback(async (worktree?: string): Promise<void> => {
    if (!workspaceMeta || !worktree) {
      toast.error("Select a testing target before opening a terminal.");
      return;
    }

    try {
      const result = (await workspaceOpenTerminal({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
        worktree,
      })) as RestoreApiResponse;
      if (result.ok) {
        toast.success("Opened terminal.");
        return;
      }

      toast.error("Failed to open terminal.");
    } catch {
      toast.error("Terminal open request failed.");
    }
  }, [knownWorktrees, workspaceMeta]);

  const runStopTestingInstanceAction = useCallback(async (worktree?: string): Promise<void> => {
    if (!workspaceMeta) {
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStop({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
        ...(worktree ? { worktree } : {}),
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success("Stopped local testing.");
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Failed to stop local testing environment.");
    } catch {
      toast.error("Local testing stop request failed.");
    } finally {
      setIsTestingInstancePending(false);
    }
  }, [fetchTestingEnvironmentState, knownWorktrees, workspaceMeta]);

  const closeCurrentWorkspace = useCallback(async (): Promise<void> => {
    try {
      setIsBusy(true);
      setErrorMessage(null);
      const result = await workspaceClearActive();
      if (!result.ok) {
        setErrorMessage(result.error ?? "Failed to clear active workspace.");
        return;
      }
      setActiveWorkspace(null);
      setWorktreeRows([]);
      setHasWorktreesDirectory(null);
      setPendingRestoreActions([]);
      setPendingCutGrooveActions([]);
      setPendingStopActions([]);
      setPendingPlayActions([]);
      setPendingTestActions([]);
      setCopiedBranchPath(null);
      setRuntimeStateByWorktree({});
      setTestingEnvironment(null);
      setUnsetTestingEnvironmentConfirm(null);
      realtimeUnavailableRef.current = false;
      setStatusMessage("Workspace closed. Select a directory to continue.");
      toast.success("Current workspace closed.");
    } catch {
      setErrorMessage("Failed to fully clear workspace session. Try again.");
      toast.error("Failed to close current workspace.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  return {
    activeWorkspace,
    worktreeRows,
    hasWorktreesDirectory,
    statusMessage,
    errorMessage,
    isBusy,
    pendingRestoreActions,
    pendingCutGrooveActions,
    pendingStopActions,
    pendingPlayActions,
    pendingTestActions,
    copiedBranchPath,
    isCloseWorkspaceConfirmOpen,
    cutConfirmRow,
    forceCutConfirmRow,
    runtimeStateByWorktree,
    testingEnvironment,
    testingEnvironments,
    unsetTestingEnvironmentConfirm,
    testingEnvironmentColorByWorktree,
    testingTargetWorktrees,
    testingRunningWorktrees,
    isTestingInstancePending,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceMeta,
    workspaceRoot,
    recentDirectories,
    gitignoreSanity,
    gitignoreSanityStatusMessage,
    gitignoreSanityErrorMessage,
    isGitignoreSanityChecking,
    isGitignoreSanityApplyPending,
    forceCutConfirmLoading,
    groupedWorktreeItems,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setIsCreateModalOpen,
    setUnsetTestingEnvironmentConfirm,
    setCreateBranch,
    setCreateBase,
    pickDirectory,
    openRecentDirectory,
    applyGitignoreSanityPatch,
    refreshWorktrees,
    copyBranchName,
    runRestoreAction,
    runCreateWorktreeAction,
    runCutGrooveAction,
    runStopAction,
    runPlayGrooveAction,
    runSetTestingTargetAction,
    runUnsetTestingTargetAction,
    onSelectTestingTarget,
    runStartTestingInstanceAction,
    runStartTestingInstanceSeparateTerminalAction,
    runOpenTestingTerminalAction,
    runStopTestingInstanceAction,
    closeCurrentWorkspace,
  };
}
