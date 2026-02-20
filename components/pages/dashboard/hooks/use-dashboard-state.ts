import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
import { appendRequestId } from "@/lib/utils/common/request-id";
import { summarizeRestoreOutput } from "@/lib/utils/output/summarizers";
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
  workspaceOpen,
  workspacePickAndOpen,
  type WorkspaceContextResponse,
} from "@/src/lib/ipc";

const DEBUG_CLIENT_LOGS = import.meta.env.VITE_GROOVE_DEBUG_LOGS === "true";
const EVENT_RESCAN_DEBOUNCE_MS = 500;
const EVENT_RESCAN_MIN_INTERVAL_MS = 1500;
const RUNTIME_FETCH_DEBOUNCE_MS = 200;

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
  const [isTestingInstancePending, setIsTestingInstancePending] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createBranch, setCreateBranch] = useState("");
  const [createBase, setCreateBase] = useState("");
  const [isCreatePending, setIsCreatePending] = useState(false);

  const runtimeFetchCounterRef = useRef(0);
  const eventRescanTimeoutRef = useRef<number | null>(null);
  const runtimeFetchTimeoutRef = useRef<number | null>(null);
  const copiedBranchResetTimeoutRef = useRef<number | null>(null);
  const rescanInFlightRef = useRef(false);
  const rescanQueuedRef = useRef(false);
  const lastRescanAtRef = useRef<number>(0);
  const runtimeFetchInFlightRef = useRef(false);
  const runtimeFetchQueuedRef = useRef(false);
  const realtimeUnavailableRef = useRef(false);

  const workspaceMeta = activeWorkspace?.workspaceMeta ?? null;
  const workspaceRoot = activeWorkspace?.workspaceRoot ?? null;
  const forceCutActionKey = forceCutConfirmRow ? `${forceCutConfirmRow.path}:cut` : null;
  const forceCutConfirmLoading = forceCutActionKey !== null && pendingCutGrooveActions.includes(forceCutActionKey);
  const testingEnvironments = testingEnvironment?.environments ?? [];
  const testingTargetWorktrees = useMemo<string[]>(() => {
    return testingEnvironments.map((environment) => environment.worktree);
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
    return worktreeRows.map((row) => row.worktree);
  }, [worktreeRows]);

  const knownWorktreesKey = useMemo<string>(() => {
    return knownWorktrees.join("|");
  }, [knownWorktrees]);

  const applyWorkspaceContext = useCallback((result: WorkspaceContextResponse): void => {
    if (!result.workspaceRoot || !result.workspaceMeta || typeof result.hasWorktreesDirectory !== "boolean") {
      return;
    }
    const hasWorktreesDirectory = result.hasWorktreesDirectory;
    const nextWorkspace = {
      workspaceRoot: result.workspaceRoot,
      workspaceMeta: result.workspaceMeta,
      hasWorktreesDirectory,
      rows: result.rows,
    };
    setActiveWorkspace((previous) => {
      if (
        previous &&
        previous.workspaceRoot === nextWorkspace.workspaceRoot &&
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setIsBusy(true);
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
      } catch {
        if (!cancelled) {
          setErrorMessage("Failed to restore active workspace.");
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyWorkspaceContext]);

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
      realtimeUnavailableRef.current = false;
      setStatusMessage(`Workspace is active (${result.workspaceMeta?.rootName ?? "unknown"}).`);
    } catch {
      setErrorMessage("Unable to pick workspace directory.");
    } finally {
      setIsBusy(false);
    }
  }, [applyWorkspaceContext]);

  const rescanWorktrees = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    if (!workspaceRoot) {
      return;
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
      if (!options?.silent) {
        setStatusMessage("Rescanned Groove worktrees.");
      }
    } catch {
      setErrorMessage("Failed to rescan workspace worktrees.");
    } finally {
      rescanInFlightRef.current = false;
      setIsBusy(false);
      if (rescanQueuedRef.current) {
        rescanQueuedRef.current = false;
        window.setTimeout(() => {
          void rescanWorktrees({ silent: true });
        }, 120);
      }
    }
  }, [applyWorkspaceContext, workspaceRoot]);

  const fetchRuntimeState = useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !workspaceMeta || knownWorktrees.length === 0) {
      setRuntimeStateByWorktree({});
      return;
    }
    if (runtimeFetchInFlightRef.current) {
      runtimeFetchQueuedRef.current = true;
      return;
    }

    runtimeFetchInFlightRef.current = true;
    const fetchId = runtimeFetchCounterRef.current + 1;
    runtimeFetchCounterRef.current = fetchId;

    try {
      const result = (await grooveList({
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
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
  }, [knownWorktrees, workspaceMeta, workspaceRoot]);

  const scheduleRuntimeStateFetch = useCallback(
    (delayMs = RUNTIME_FETCH_DEBOUNCE_MS): void => {
      if (runtimeFetchTimeoutRef.current !== null) {
        window.clearTimeout(runtimeFetchTimeoutRef.current);
      }
      runtimeFetchTimeoutRef.current = window.setTimeout(() => {
        runtimeFetchTimeoutRef.current = null;
        void fetchRuntimeState();
      }, delayMs);
    },
    [fetchRuntimeState],
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
        window.clearTimeout(eventRescanTimeoutRef.current);
      }
      eventRescanTimeoutRef.current = window.setTimeout(() => {
        eventRescanTimeoutRef.current = null;
        void rescanWorktrees({ silent: true });
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
  }, [knownWorktrees, rescanWorktrees, workspaceMeta, workspaceRoot]);

  const refreshWorktrees = useCallback(async (): Promise<void> => {
    await rescanWorktrees({ silent: false });
    scheduleRuntimeStateFetch(0);
  }, [rescanWorktrees, scheduleRuntimeStateFetch]);

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
      toast.error(`Failed to copy branch for ${row.worktree}.`);
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
          knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
          workspaceMeta,
          worktree: row.worktree,
        })) as RestoreApiResponse;
        const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);
        if (result.ok) {
          toast.success(`Restore completed for ${row.worktree}.`, {
            description: appendRequestId(shortOutput, result.requestId),
          });
          await rescanWorktrees({ silent: true });
          scheduleRuntimeStateFetch(0);
          return;
        }
        toast.error(`Restore failed for ${row.worktree}.`, {
          description: appendRequestId(result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`, result.requestId),
        });
      } catch {
        toast.error(`Restore request failed for ${row.worktree}.`);
      } finally {
        setPendingRestoreActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, worktreeRows],
  );

  const runCreateWorktreeAction = useCallback(async (): Promise<void> => {
    if (!workspaceMeta) {
      return;
    }

    const branch = createBranch.trim();
    const base = createBase.trim();
    if (!branch) {
      toast.error("Branch name is required.");
      return;
    }

    setIsCreatePending(true);
    try {
      const result = await grooveNew({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
        branch,
        ...(base ? { base } : {}),
      });
      const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);
      if (result.ok) {
        setIsCreateModalOpen(false);
        setCreateBranch("");
        setCreateBase("");
        toast.success(`Created worktree for ${branch}.`, {
          description: appendRequestId(shortOutput, result.requestId),
        });
        await rescanWorktrees({ silent: true });
        scheduleRuntimeStateFetch(0);
        return;
      }

      toast.error(`Create worktree failed for ${branch}.`, {
        description: appendRequestId(result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`, result.requestId),
      });
    } catch {
      toast.error(`Create worktree request failed for ${branch}.`);
    } finally {
      setIsCreatePending(false);
    }
  }, [createBase, createBranch, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, worktreeRows]);

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
          knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
          workspaceMeta,
          target: row.worktree,
          worktree: row.worktree,
          ...(force ? { force: true } : {}),
        });

        const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);
        if (result.ok) {
          toast.success(
            force ? `Cut groove completed for ${row.branchGuess} with force deletion.` : `Cut groove completed for ${row.branchGuess}.`,
            { description: appendRequestId(shortOutput, result.requestId) },
          );
          await rescanWorktrees({ silent: true });
          scheduleRuntimeStateFetch(0);
          return;
        }

        if (!force && shouldPromptForceCutRetry(result)) {
          setForceCutConfirmRow(row);
          return;
        }
        toast.error(`Cut groove failed for ${row.branchGuess}.`, {
          description: appendRequestId(result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`, result.requestId),
        });
      } catch {
        toast.error(`Cut groove request failed for ${row.branchGuess}.`);
      } finally {
        setPendingCutGrooveActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, worktreeRows],
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
          knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
          workspaceMeta,
          worktree: row.worktree,
          ...(runtimeRow?.opencodeInstanceId ? { instanceId: runtimeRow.opencodeInstanceId } : {}),
        })) as StopApiResponse;

        if (result.ok) {
          if (result.alreadyStopped) {
            toast.info(`Opencode is already stopped for ${row.worktree}.`, {
              description: appendRequestId(
                result.pid ? `PID ${String(result.pid)} is not running.` : "No running PID found for this worktree.",
                result.requestId,
              ),
            });
          } else {
            toast.success(`Stopped opencode for ${row.worktree}.`, {
              description: appendRequestId(result.pid ? `Sent SIGTERM to PID ${String(result.pid)}.` : undefined, result.requestId),
            });
          }
          await rescanWorktrees({ silent: true });
          scheduleRuntimeStateFetch(0);
          return;
        }

        toast.error(`Stop failed for ${row.worktree}.`, {
          description: appendRequestId(result.error, result.requestId),
        });
      } catch {
        toast.error(`Stop request failed for ${row.worktree}.`);
      } finally {
        setPendingStopActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, worktreeRows],
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
          knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
          workspaceMeta,
          worktree: row.worktree,
          action: "go",
          target: row.branchGuess,
        })) as RestoreApiResponse;
        const shortOutput = summarizeRestoreOutput(result.stdout, result.stderr);

        if (result.ok) {
          toast.success(`Play groove completed for ${row.branchGuess}.`, {
            description: appendRequestId(shortOutput, result.requestId),
          });
          await rescanWorktrees({ silent: true });
          scheduleRuntimeStateFetch(0);
          return;
        }

        toast.error(`Play groove failed for ${row.branchGuess}.`, {
          description: appendRequestId(result.error ?? shortOutput ?? `Exit code: ${String(result.exitCode)}`, result.requestId),
        });
      } catch {
        toast.error(`Play groove request failed for ${row.branchGuess}.`);
      } finally {
        setPendingPlayActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, worktreeRows],
  );

  const runSetTestingTargetAction = useCallback(
    async (row: WorktreeRow, enabled = true, autoStartIfCurrentRunning = false): Promise<void> => {
      if (!workspaceMeta) {
        return;
      }
      const actionKey = `${row.path}:test`;
      setPendingTestActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

      try {
        const result = await testingEnvironmentSetTarget({
          rootName: workspaceMeta.rootName,
          knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
          workspaceMeta,
          worktree: row.worktree,
          enabled,
          autoStartIfCurrentRunning,
        });

        if (result.ok) {
          setTestingEnvironment(result);
          toast.success(enabled ? `Added testing target ${row.worktree}.` : `Removed testing target ${row.worktree}.`);
          await rescanWorktrees({ silent: true });
          scheduleRuntimeStateFetch(0);
          await fetchTestingEnvironmentState();
          return;
        }

        toast.error(`Failed to set testing target for ${row.worktree}.`, {
          description: appendRequestId(result.error, result.requestId),
        });
      } catch {
        toast.error(`Testing target request failed for ${row.worktree}.`);
      } finally {
        setPendingTestActions((prev) => prev.filter((candidate) => candidate !== actionKey));
      }
    },
    [fetchTestingEnvironmentState, rescanWorktrees, scheduleRuntimeStateFetch, workspaceMeta, worktreeRows],
  );

  const onSelectTestingTarget = useCallback(
    (row: WorktreeRow): void => {
      const enabled = !testingTargetWorktrees.includes(row.worktree);
      void runSetTestingTargetAction(row, enabled);
    },
    [runSetTestingTargetAction, testingTargetWorktrees],
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
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
        ...(worktree ? { worktree } : {}),
      });

      if (result.ok) {
        setTestingEnvironment(result);
        const targetPorts = result.environments
          .filter((environment) => environment.status === "running" && typeof environment.port === "number" && environment.port > 0)
          .filter((environment) => (worktree ? environment.worktree === worktree : true))
          .map((environment) => `${environment.worktree}:${String(environment.port)}`);
        toast.success(worktree ? `Started local testing for ${worktree}.` : "Started local testing for selected targets.", {
          description: targetPorts.length > 0 ? `Port${targetPorts.length === 1 ? "" : "s"}: ${targetPorts.join(", ")}` : undefined,
        });
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Failed to run local testing environment.", {
        description: appendRequestId(result.error, result.requestId),
      });
    } catch {
      toast.error("Local testing start request failed.");
    } finally {
      setIsTestingInstancePending(false);
    }
  }, [fetchTestingEnvironmentState, testingTargetWorktrees.length, workspaceMeta, worktreeRows]);

  const runStartTestingInstanceInSeparateTerminalAction = useCallback(async (worktree?: string): Promise<void> => {
    if (!workspaceMeta || (testingTargetWorktrees.length === 0 && !worktree)) {
      toast.error("Select a testing target before running locally on a separate terminal.");
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStartSeparateTerminal({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
        ...(worktree ? { worktree } : {}),
      });

      if (result.ok) {
        setTestingEnvironment(result);
        const targetPorts = result.environments
          .filter((environment) => environment.status === "running" && typeof environment.port === "number" && environment.port > 0)
          .filter((environment) => (worktree ? environment.worktree === worktree : true))
          .map((environment) => `${environment.worktree}:${String(environment.port)}`);
        toast.success(
          worktree
            ? `Launched local testing for ${worktree} in a separate terminal.`
            : "Launched local testing for selected targets in a separate terminal.",
          {
            description: targetPorts.length > 0 ? `Port${targetPorts.length === 1 ? "" : "s"}: ${targetPorts.join(", ")}` : undefined,
          },
        );
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Failed to run local testing environment in a separate terminal.", {
        description: appendRequestId(result.error, result.requestId),
      });
    } catch {
      toast.error("Local testing start request failed for separate terminal.");
    } finally {
      setIsTestingInstancePending(false);
    }
  }, [fetchTestingEnvironmentState, testingTargetWorktrees.length, workspaceMeta, worktreeRows]);

  const runStopTestingInstanceAction = useCallback(async (worktree?: string): Promise<void> => {
    if (!workspaceMeta) {
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStop({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
        ...(worktree ? { worktree } : {}),
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success(worktree ? `Stopped local testing for ${worktree}.` : "Stopped all local testing environments.");
        await fetchTestingEnvironmentState();
        return;
      }

      toast.error("Failed to stop local testing environment.", {
        description: appendRequestId(result.error, result.requestId),
      });
    } catch {
      toast.error("Local testing stop request failed.");
    } finally {
      setIsTestingInstancePending(false);
    }
  }, [fetchTestingEnvironmentState, workspaceMeta, worktreeRows]);

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
    forceCutConfirmLoading,
    groupedWorktreeItems,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setIsCreateModalOpen,
    setCreateBranch,
    setCreateBase,
    pickDirectory,
    refreshWorktrees,
    copyBranchName,
    runRestoreAction,
    runCreateWorktreeAction,
    runCutGrooveAction,
    runStopAction,
    runPlayGrooveAction,
    runSetTestingTargetAction,
    onSelectTestingTarget,
    runStartTestingInstanceAction,
    runStartTestingInstanceInSeparateTerminalAction,
    runStopTestingInstanceAction,
    closeCurrentWorkspace,
  };
}
