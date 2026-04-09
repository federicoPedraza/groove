import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ActiveWorkspace,
  RestoreApiResponse,
  WorkspaceMeta,
  WorktreeRow,
} from "@/src/components/pages/dashboard/types";
import { toast } from "@/src/lib/toast";
import type { GroupedWorktreeItem } from "@/src/lib/utils/time/grouping";
import { buildGroupedWorktreeItems } from "@/src/lib/utils/time/grouping";
import { clearNotifiedWorktree } from "@/src/lib/utils/notified-worktrees";
import {
  setNotificationMutedWorktrees,
  setNotificationViewingWorktree,
  startNotificationListener,
} from "@/src/lib/notification-sound-listener";
import { describeWorkspaceContextError } from "@/src/lib/utils/workspace/context";
import { shouldPromptForceCutRetry } from "@/src/lib/utils/worktree/status";
import { playGrooveHookSound } from "@/src/lib/groove-sound-system";
import {
  grooveTerminalActiveWorktrees,
  grooveNew,
  grooveRestore,
  grooveRm,
  grooveTerminalClose,
  grooveTerminalListSessions,
  listenGrooveTerminalLifecycle,
  listenWorkspaceChange,
  listenWorkspaceReady,
  workspaceClearActive,
  workspaceEvents,
  workspaceGetActive,
  workspaceGitignoreSanityApply,
  workspaceGitignoreSanityCheck,
  workspaceOpen,
  workspaceOpenWorkspaceTerminal,
  workspaceOpenTerminal,
  workspacePickAndOpen,
  GROOVE_PLAY_COMMAND_SENTINEL,
  isTelemetryEnabled,
  type WorkspaceContextResponse,
  type WorkspaceGitignoreSanityResponse,
} from "@/src/lib/ipc";

const DEBUG_CLIENT_LOGS = import.meta.env.VITE_GROOVE_DEBUG_LOGS === "true";
const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const EVENT_RESCAN_DEBOUNCE_MS = 700;
const EVENT_RESCAN_MIN_INTERVAL_MS = 2200;
const WORKSPACE_RESCAN_REQUEST_TTL_MS = 2500;
const RUNTIME_FETCH_DEBOUNCE_MS = 200;
const RUNTIME_FETCH_REQUEST_TTL_MS = 2000;
const RECENT_DIRECTORIES_STORAGE_KEY = "groove:recent-directories";
const MAX_RECENT_DIRECTORIES = 5;

type DashboardWorkspaceSnapshot = {
  activeWorkspace: ActiveWorkspace | null;
};

type CreateWorktreeActionOptions = {
  branchOverride?: string;
  baseOverride?: string;
};

const dashboardWorkspaceSnapshot: DashboardWorkspaceSnapshot = {
  activeWorkspace: null,
};

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

    const deduplicated = normalized.filter(
      (candidate, index) => normalized.indexOf(candidate) === index,
    );
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
    window.localStorage.setItem(
      RECENT_DIRECTORIES_STORAGE_KEY,
      JSON.stringify(directories),
    );
  } catch {
    return;
  }
}

function buildRecentDirectories(
  nextDirectory: string,
  previousDirectories: string[],
): string[] {
  const normalizedDirectory = nextDirectory.trim();
  if (!normalizedDirectory) {
    return previousDirectories;
  }

  const deduplicated = previousDirectories.filter(
    (candidate) => candidate !== normalizedDirectory,
  );
  return [normalizedDirectory, ...deduplicated].slice(
    0,
    MAX_RECENT_DIRECTORIES,
  );
}

function isSameWorkspaceMeta(
  left: WorkspaceMeta | null,
  right: WorkspaceMeta | null,
): boolean {
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
    left.terminalCustomCommand === right.terminalCustomCommand &&
    left.playGrooveCommand === right.playGrooveCommand &&
    left.openTerminalAtWorktreeCommand ===
      right.openTerminalAtWorktreeCommand &&
    left.runLocalCommand === right.runLocalCommand
  );
}

function areWorktreeRowsEqual(
  left: WorktreeRow[],
  right: WorktreeRow[],
): boolean {
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

function clientDebugLog(
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!DEBUG_CLIENT_LOGS) {
    return;
  }
  console.debug("[groove-ui]", {
    timestamp: new Date().toISOString(),
    event,
    ...(details ?? {}),
  });
}

function logPlayTelemetry(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) {
    return;
  }
  console.info(`${UI_TELEMETRY_PREFIX} ${event}`, payload);
}

export function useDashboardState(viewingWorktree?: string) {
  const [activeWorkspace, setActiveWorkspace] =
    useState<ActiveWorkspace | null>(
      () => dashboardWorkspaceSnapshot.activeWorkspace,
    );
  const [isWorkspaceHydrating, setIsWorkspaceHydrating] = useState(true);
  const [worktreeRows, setWorktreeRows] = useState<WorktreeRow[]>([]);
  const [hasWorktreesDirectory, setHasWorktreesDirectory] = useState<
    boolean | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingRestoreActions, setPendingRestoreActions] = useState<string[]>(
    [],
  );
  const [pendingCutGrooveActions, setPendingCutGrooveActions] = useState<
    string[]
  >([]);
  const [
    isForgetAllDeletedWorktreesPending,
    setIsForgetAllDeletedWorktreesPending,
  ] = useState(false);
  const [pendingStopActions, setPendingStopActions] = useState<string[]>([]);
  const [pendingPlayActions, setPendingPlayActions] = useState<string[]>([]);
  const [copiedBranchPath, setCopiedBranchPath] = useState<string | null>(null);
  const [mutedWorktrees, setMutedWorktrees] = useState<Set<string>>(new Set());
  const mutedWorktreesRef = useRef(mutedWorktrees);
  mutedWorktreesRef.current = mutedWorktrees;
  const viewingWorktreeRef = useRef(viewingWorktree);
  viewingWorktreeRef.current = viewingWorktree;
  const [isCloseWorkspaceConfirmOpen, setIsCloseWorkspaceConfirmOpen] =
    useState(false);
  const [cutConfirmRow, setCutConfirmRow] = useState<WorktreeRow | null>(null);
  const [forceCutConfirmRow, setForceCutConfirmRow] =
    useState<WorktreeRow | null>(null);
  const [activeTerminalWorktrees, setActiveTerminalWorktrees] = useState<
    Set<string>
  >(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createBranch, setCreateBranch] = useState("");
  const [createBase, setCreateBase] = useState("");
  const [isCreatePending, setIsCreatePending] = useState(false);
  const [recentDirectories, setRecentDirectories] = useState<string[]>([]);
  const [gitignoreSanity, setGitignoreSanity] =
    useState<WorkspaceGitignoreSanityResponse | null>(null);
  const [gitignoreSanityStatusMessage, setGitignoreSanityStatusMessage] =
    useState<string | null>(null);
  const [gitignoreSanityErrorMessage, setGitignoreSanityErrorMessage] =
    useState<string | null>(null);
  const [isGitignoreSanityChecking, setIsGitignoreSanityChecking] =
    useState(false);
  const [isGitignoreSanityApplyPending, setIsGitignoreSanityApplyPending] =
    useState(false);

  const runtimeFetchCounterRef = useRef(0);
  const eventRescanTimeoutRef = useRef<number | null>(null);
  const runtimeFetchTimeoutRef = useRef<number | null>(null);
  const copiedBranchResetTimeoutRef = useRef<number | null>(null);
  const rescanInFlightRef = useRef(false);
  const rescanQueuedRef = useRef(false);
  const workspaceRescanLastRequestRef = useRef<{
    key: string;
    at: number;
  } | null>(null);
  const lastRescanAtRef = useRef<number>(0);
  const runtimeFetchInFlightRef = useRef(false);
  const runtimeFetchQueuedRef = useRef(false);
  const runtimeFetchLastRequestRef = useRef<{ key: string; at: number } | null>(
    null,
  );
  const runtimeFetchScheduledRef = useRef<{ key: string; at: number } | null>(
    null,
  );
  const realtimeUnavailableRef = useRef(false);

  const workspaceMeta = activeWorkspace?.workspaceMeta ?? null;
  const workspaceRoot = activeWorkspace?.workspaceRoot ?? null;
  const forceCutActionKey = forceCutConfirmRow
    ? `${forceCutConfirmRow.path}:cut`
    : null;
  const forceCutConfirmLoading =
    forceCutActionKey !== null &&
    pendingCutGrooveActions.includes(forceCutActionKey);
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

    return [
      workspaceRoot,
      workspaceMeta.rootName,
      workspaceMeta.updatedAt ?? "",
      knownWorktreesKey,
    ].join("::");
  }, [knownWorktrees.length, knownWorktreesKey, workspaceMeta, workspaceRoot]);

  const workspaceRescanRequestKey = useMemo<string | null>(() => {
    if (!workspaceRoot) {
      return null;
    }
    return [
      workspaceRoot,
      workspaceMeta?.updatedAt ?? "",
      knownWorktreesKey,
    ].join("::");
  }, [knownWorktreesKey, workspaceMeta?.updatedAt, workspaceRoot]);

  const applyWorkspaceContext = useCallback(
    (result: WorkspaceContextResponse): void => {
      if (
        !result.workspaceRoot ||
        !result.workspaceMeta ||
        typeof result.hasWorktreesDirectory !== "boolean"
      ) {
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
          previous.hasWorktreesDirectory ===
            nextWorkspace.hasWorktreesDirectory &&
          isSameWorkspaceMeta(
            previous.workspaceMeta,
            nextWorkspace.workspaceMeta,
          ) &&
          areWorktreeRowsEqual(previous.rows, nextWorkspace.rows)
        ) {
          return previous;
        }
        return nextWorkspace;
      });
      setWorktreeRows((previous) =>
        areWorktreeRowsEqual(previous, result.rows) ? previous : result.rows,
      );
      setHasWorktreesDirectory((previous) =>
        previous === hasWorktreesDirectory ? previous : hasWorktreesDirectory,
      );
    },
    [],
  );

  useEffect(() => {
    setRecentDirectories(readStoredRecentDirectories());
  }, []);

  useEffect(() => {
    dashboardWorkspaceSnapshot.activeWorkspace = activeWorkspace;
  }, [activeWorkspace]);

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
      if (
        nextDirectories.length === previous.length &&
        nextDirectories.every(
          (candidate, index) => candidate === previous[index],
        )
      ) {
        return previous;
      }

      persistRecentDirectories(nextDirectories);
      return nextDirectories;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsWorkspaceHydrating(true);
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
          setActiveWorkspace(null);
          setHasWorktreesDirectory(null);
          setWorktreeRows((prev) => (prev.length === 0 ? prev : []));
          return;
        }
        applyWorkspaceContext(result);
        pushRecentDirectory(result.workspaceRoot);
      } catch {
        if (!cancelled) {
          setErrorMessage("Failed to restore active workspace.");
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceHydrating(false);
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
      setStatusMessage(
        `Workspace is active (${result.workspaceMeta?.rootName ?? "unknown"}).`,
      );
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
        setStatusMessage(
          `Workspace is active (${result.workspaceMeta?.rootName ?? "unknown"}).`,
        );
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
          setGitignoreSanityErrorMessage(
            result.error ?? "Failed to check .gitignore sanity.",
          );
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
        setGitignoreSanityErrorMessage(
          result.error ?? "Failed to apply .gitignore sanity patch.",
        );
        return;
      }

      setGitignoreSanity(result);
      if (!result.isApplicable) {
        setGitignoreSanityStatusMessage(
          "No .gitignore found in the active workspace.",
        );
      } else if (result.patched) {
        if (result.patchedWorktree) {
          setGitignoreSanityStatusMessage(
            `Applied Groove .gitignore sanity patch in ${result.patchedWorktree} and started Play Groove.`,
          );
        } else {
          setGitignoreSanityStatusMessage(
            "Applied Groove .gitignore sanity patch.",
          );
        }
      } else {
        setGitignoreSanityStatusMessage(
          "Groove .gitignore sanity patch is already applied.",
        );
      }
    } catch {
      setGitignoreSanityErrorMessage(
        "Failed to apply .gitignore sanity patch.",
      );
    } finally {
      setIsGitignoreSanityApplyPending(false);
    }
  }, [workspaceRoot]);

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

  const rescanWorktrees = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (!workspaceRoot) {
        return;
      }

      if (!options?.force && workspaceRescanRequestKey) {
        const now = Date.now();
        const previousRescan = workspaceRescanLastRequestRef.current;
        if (
          previousRescan &&
          previousRescan.key === workspaceRescanRequestKey &&
          now - previousRescan.at < WORKSPACE_RESCAN_REQUEST_TTL_MS
        ) {
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
    },
    [applyWorkspaceContext, workspaceRescanRequestKey, workspaceRoot],
  );

  const fetchRuntimeState = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (
        !workspaceRoot ||
        !workspaceMeta ||
        knownWorktrees.length === 0 ||
        !runtimeFetchRequestKey
      ) {
        setActiveTerminalWorktrees(new Set());
        return;
      }
      if (runtimeFetchInFlightRef.current) {
        runtimeFetchQueuedRef.current = true;
        if (options?.force) {
          runtimeFetchLastRequestRef.current = null;
        }
        return;
      }

      if (!options?.force) {
        const now = Date.now();
        const previousRuntimeFetch = runtimeFetchLastRequestRef.current;
        if (
          previousRuntimeFetch &&
          previousRuntimeFetch.key === runtimeFetchRequestKey &&
          now - previousRuntimeFetch.at < RUNTIME_FETCH_REQUEST_TTL_MS
        ) {
          return;
        }
        runtimeFetchLastRequestRef.current = {
          key: runtimeFetchRequestKey,
          at: now,
        };
      } else {
        runtimeFetchLastRequestRef.current = {
          key: runtimeFetchRequestKey,
          at: Date.now(),
        };
      }
      runtimeFetchInFlightRef.current = true;

      const fetchId = runtimeFetchCounterRef.current + 1;
      runtimeFetchCounterRef.current = fetchId;

      try {
        const result = await grooveTerminalActiveWorktrees({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
        });

        if (runtimeFetchCounterRef.current !== fetchId) {
          return;
        }
        if (!result.ok) {
          setActiveTerminalWorktrees(new Set());
          return;
        }
        setActiveTerminalWorktrees(new Set(result.worktrees));
      } catch {
        if (runtimeFetchCounterRef.current === fetchId) {
          setActiveTerminalWorktrees(new Set());
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
    },
    [knownWorktrees, runtimeFetchRequestKey, workspaceMeta, workspaceRoot],
  );

  const scheduleRuntimeStateFetch = useCallback(
    (
      delayMs = RUNTIME_FETCH_DEBOUNCE_MS,
      options?: { force?: boolean },
    ): void => {
      const nextKey = runtimeFetchRequestKey;
      if (!nextKey) {
        return;
      }

      const pending = runtimeFetchScheduledRef.current;
      if (
        !options?.force &&
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
        void fetchRuntimeState(options);
      }, delayMs);
    },
    [fetchRuntimeState, runtimeFetchRequestKey],
  );

  const rescanWorktreesRef = useRef(rescanWorktrees);
  rescanWorktreesRef.current = rescanWorktrees;
  const scheduleRuntimeStateFetchRef = useRef(scheduleRuntimeStateFetch);
  scheduleRuntimeStateFetchRef.current = scheduleRuntimeStateFetch;
  const knownWorktreesRef = useRef(knownWorktrees);
  knownWorktreesRef.current = knownWorktrees;
  const workspaceMetaRef = useRef(workspaceMeta);
  workspaceMetaRef.current = workspaceMeta;

  useEffect(() => {
    scheduleRuntimeStateFetchRef.current(0);
  }, [
    knownWorktreesKey,
    workspaceMeta?.rootName,
    workspaceMeta?.updatedAt,
    workspaceRoot,
  ]);

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
      const minIntervalDelay = Math.max(
        0,
        EVENT_RESCAN_MIN_INTERVAL_MS - elapsedSinceLastRescan,
      );
      const delayMs = Math.max(EVENT_RESCAN_DEBOUNCE_MS, minIntervalDelay);

      if (eventRescanTimeoutRef.current !== null) {
        return;
      }
      eventRescanTimeoutRef.current = window.setTimeout(() => {
        eventRescanTimeoutRef.current = null;
        void (async () => {
          await rescanWorktreesRef.current();
          scheduleRuntimeStateFetchRef.current(0);
        })();
      }, delayMs);
    };

    const currentWorkspaceMeta = workspaceMeta;
    const currentKnownWorktrees = knownWorktreesRef.current;

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
          rootName: currentWorkspaceMeta.rootName,
          knownWorktrees: currentKnownWorktrees,
          workspaceMeta: currentWorkspaceMeta,
        });
        if (!response.ok) {
          throw new Error(response.error ?? "Workspace events unavailable.");
        }
      } catch {
        cleanupListeners();
        realtimeUnavailableRef.current = true;
        if (!closed) {
          setStatusMessage(
            (prev) =>
              prev ??
              "Realtime updates are unavailable. Use Refresh for manual rescans.",
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-subscribe when rootName changes, not on every meta update
  }, [workspaceMeta?.rootName, workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot || !workspaceMeta) {
      return;
    }

    let mounted = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      unlisten = await listenGrooveTerminalLifecycle((event) => {
        if (!mounted || event.workspaceRoot !== workspaceRoot) {
          return;
        }

        scheduleRuntimeStateFetch(0, { force: true });
      });
    })();

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [scheduleRuntimeStateFetch, workspaceMeta, workspaceRoot]);

  useEffect(() => {
    if (workspaceRoot) {
      startNotificationListener(workspaceRoot);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    setNotificationViewingWorktree(viewingWorktree);
    if (viewingWorktree) {
      clearNotifiedWorktree(viewingWorktree);
    }
    return () => {
      setNotificationViewingWorktree(undefined);
    };
  }, [viewingWorktree]);

  useEffect(() => {
    setNotificationMutedWorktrees(mutedWorktrees);
  }, [mutedWorktrees]);

  const refreshWorktrees = useCallback(async (): Promise<void> => {
    await rescanWorktrees({ force: true });
    scheduleRuntimeStateFetch(0);
  }, [rescanWorktrees, scheduleRuntimeStateFetch]);

  const copyBranchName = useCallback(
    async (row: WorktreeRow): Promise<void> => {
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
    },
    [],
  );

  const runRestoreAction = useCallback(
    async (row: WorktreeRow): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:restore`;
      setPendingRestoreActions((prev) =>
        prev.includes(actionKey) ? prev : [...prev, actionKey],
      );

      try {
        const result = (await grooveRestore({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: row.worktree,
        })) as RestoreApiResponse;
        if (result.ok) {
          toast.success("Restore completed.", { command: "groove_restore" });
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          return;
        }
        toast.error("Restore failed.", { command: "groove_restore" });
      } catch {
        toast.error("Restore request failed.", { command: "groove_restore" });
      } finally {
        setPendingRestoreActions((prev) =>
          prev.filter((candidate) => candidate !== actionKey),
        );
      }
    },
    [knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  const runCreateWorktreeAction = useCallback(
    async (options?: CreateWorktreeActionOptions): Promise<void> => {
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
          toast.success("Worktree created.", { command: "groove_new" });
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          return;
        }

        toast.error("Create worktree failed.", { command: "groove_new" });
      } catch {
        toast.error("Create worktree request failed.", {
          command: "groove_new",
        });
      } finally {
        setIsCreatePending(false);
      }
    },
    [
      createBase,
      createBranch,
      knownWorktrees,
      rescanWorktrees,
      scheduleRuntimeStateFetch,
      workspaceMeta,
    ],
  );

  const runCutGrooveAction = useCallback(
    async (row: WorktreeRow, force = false): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:cut`;
      setPendingCutGrooveActions((prev) =>
        prev.includes(actionKey) ? prev : [...prev, actionKey],
      );

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
          playGrooveHookSound("remove");
          toast.success(
            force
              ? "Cut groove completed with force deletion."
              : "Cut groove completed.",
            { command: "groove_rm" },
          );
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          return;
        }

        if (!force && shouldPromptForceCutRetry(result)) {
          setForceCutConfirmRow(row);
          return;
        }
        toast.error("Cut groove failed.", { command: "groove_rm" });
      } catch {
        toast.error("Cut groove request failed.", { command: "groove_rm" });
      } finally {
        setPendingCutGrooveActions((prev) =>
          prev.filter((candidate) => candidate !== actionKey),
        );
      }
    },
    [knownWorktrees, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta],
  );

  const runForgetAllDeletedWorktreesAction =
    useCallback(async (): Promise<void> => {
      const deletedRows = worktreeRows.filter(
        (row) => row.status === "deleted",
      );
      if (deletedRows.length === 0 || isForgetAllDeletedWorktreesPending) {
        return;
      }

      setIsForgetAllDeletedWorktreesPending(true);
      try {
        for (const row of deletedRows) {
          await runCutGrooveAction(row);
        }
      } finally {
        setIsForgetAllDeletedWorktreesPending(false);
      }
    }, [isForgetAllDeletedWorktreesPending, runCutGrooveAction, worktreeRows]);

  const runStopAction = useCallback(
    async (row: WorktreeRow): Promise<boolean> => {
      if (!workspaceMeta) {
        return false;
      }
      const actionKey = `${row.path}:stop`;
      setPendingStopActions((prev) =>
        prev.includes(actionKey) ? prev : [...prev, actionKey],
      );

      try {
        const terminalPayloadBase = {
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: row.worktree,
        };

        const sessionListResult =
          await grooveTerminalListSessions(terminalPayloadBase);
        if (!sessionListResult.ok) {
          toast.error(
            sessionListResult.error ?? "Failed to list terminal sessions.",
            { command: "groove_stop" },
          );
          return false;
        }

        for (const session of sessionListResult.sessions) {
          await grooveTerminalClose({
            ...terminalPayloadBase,
            sessionId: session.sessionId,
          });
        }

        playGrooveHookSound("pause");
        return true;
      } catch {
        toast.error("Stop request failed.", { command: "groove_stop" });
        return false;
      } finally {
        setPendingStopActions((prev) =>
          prev.filter((candidate) => candidate !== actionKey),
        );
      }
    },
    [knownWorktrees, workspaceMeta],
  );

  const runPlayGrooveAction = useCallback(
    async (row: WorktreeRow): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const isGrooveInAppTemplate =
        workspaceMeta.playGrooveCommand?.trim() ===
        GROOVE_PLAY_COMMAND_SENTINEL;
      logPlayTelemetry("play_groove.start", {
        workspaceRoot,
        worktree: row.worktree,
        targetBranch: row.branchGuess,
        mode: isGrooveInAppTemplate ? "sentinel" : "custom",
      });
      const actionKey = `${row.path}:play`;
      setPendingPlayActions((prev) =>
        prev.includes(actionKey) ? prev : [...prev, actionKey],
      );

      try {
        const result = (await grooveRestore({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: row.worktree,
          action: "go",
          target: row.branchGuess,
        })) as RestoreApiResponse;
        logPlayTelemetry("play_groove.invoke_result", {
          workspaceRoot,
          worktree: row.worktree,
          targetBranch: row.branchGuess,
          mode: isGrooveInAppTemplate ? "sentinel" : "custom",
          ok: result.ok,
          error: result.error ?? null,
          exitCode: result.exitCode ?? null,
        });
        if (result.ok) {
          playGrooveHookSound("play");
          toast.success(
            isGrooveInAppTemplate
              ? "Started Groove in-app terminal."
              : "Play Groove succeeded.",
            { command: "groove_restore" },
          );
          logPlayTelemetry("play_groove.refresh_kickoff", {
            workspaceRoot,
            worktree: row.worktree,
            targetBranch: row.branchGuess,
            mode: isGrooveInAppTemplate ? "sentinel" : "custom",
            steps: ["rescanWorktrees", "scheduleRuntimeStateFetch"],
          });
          await rescanWorktrees({ force: true });
          scheduleRuntimeStateFetch(0);
          return;
        }

        if (isGrooveInAppTemplate) {
          toast.error(
            result.error
              ? `Failed to start Groove in-app terminal: ${result.error}`
              : "Failed to start Groove in-app terminal.",
            { command: "groove_restore" },
          );
          return;
        }

        toast.error(
          result.error
            ? `Play groove failed: ${result.error}`
            : "Play groove failed.",
          { command: "groove_restore" },
        );
      } catch (error) {
        logPlayTelemetry("play_groove.invoke_result", {
          workspaceRoot,
          worktree: row.worktree,
          targetBranch: row.branchGuess,
          mode: isGrooveInAppTemplate ? "sentinel" : "custom",
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error(
          isGrooveInAppTemplate
            ? "Groove in-app terminal start request failed."
            : "Play groove request failed.",
          { command: "groove_restore" },
        );
      } finally {
        setPendingPlayActions((prev) =>
          prev.filter((candidate) => candidate !== actionKey),
        );
      }
    },
    [
      knownWorktrees,
      rescanWorktrees,
      scheduleRuntimeStateFetch,
      workspaceMeta,
      workspaceRoot,
    ],
  );

  const runOpenWorktreeTerminalAction = useCallback(
    async (worktree?: string): Promise<void> => {
      if (!workspaceMeta || !worktree) {
        toast.error("Select a worktree before opening a terminal.");
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
          toast.success("Opened terminal.", { command: "groove_restore" });
          return;
        }

        toast.error("Failed to open terminal.", { command: "groove_restore" });
      } catch {
        toast.error("Terminal open request failed.", {
          command: "groove_restore",
        });
      }
    },
    [knownWorktrees, workspaceMeta],
  );

  const runOpenWorkspaceTerminalAction =
    useCallback(async (): Promise<void> => {
      if (!workspaceMeta) {
        toast.error("Select a directory before opening a terminal.");
        return;
      }

      try {
        const result = (await workspaceOpenWorkspaceTerminal({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
        })) as RestoreApiResponse;
        if (result.ok) {
          toast.success("Opened terminal.", { command: "workspace_open" });
          return;
        }

        toast.error("Failed to open terminal.", { command: "workspace_open" });
      } catch {
        toast.error("Terminal open request failed.", {
          command: "workspace_open",
        });
      }
    }, [knownWorktrees, workspaceMeta]);

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
      setCopiedBranchPath(null);
      setActiveTerminalWorktrees(new Set());
      realtimeUnavailableRef.current = false;
      setStatusMessage("Workspace closed. Select a directory to continue.");
      toast.success("Current workspace closed.", {
        command: "workspace_clear_active",
      });
    } catch {
      setErrorMessage("Failed to fully clear workspace session. Try again.");
      toast.error("Failed to close current workspace.", {
        command: "workspace_clear_active",
      });
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
    isWorkspaceHydrating,
    pendingRestoreActions,
    pendingCutGrooveActions,
    isForgetAllDeletedWorktreesPending,
    pendingStopActions,
    pendingPlayActions,
    copiedBranchPath,
    isCloseWorkspaceConfirmOpen,
    cutConfirmRow,
    forceCutConfirmRow,
    activeTerminalWorktrees,
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
    runForgetAllDeletedWorktreesAction,
    runStopAction,
    runPlayGrooveAction,
    runOpenWorktreeTerminalAction,
    runOpenWorkspaceTerminalAction,
    closeCurrentWorkspace,
    mutedWorktrees,
    toggleWorktreeMute: useCallback((worktree: string) => {
      setMutedWorktrees((prev) => {
        const next = new Set(prev);
        if (next.has(worktree)) {
          next.delete(worktree);
        } else {
          next.add(worktree);
        }
        return next;
      });
    }, []),
  };
}
