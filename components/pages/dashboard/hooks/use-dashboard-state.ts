import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  ActiveWorkspace,
  RestoreApiResponse,
  RuntimeListApiResponse,
  RuntimeStateRow,
  StopApiResponse,
  TestingEnvironmentState,
  WorktreeRow,
} from "@/components/pages/dashboard/types";
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
  const [switchTestingTargetConfirmRow, setSwitchTestingTargetConfirmRow] = useState<WorktreeRow | null>(null);
  const [runtimeStateByWorktree, setRuntimeStateByWorktree] = useState<Record<string, RuntimeStateRow>>({});
  const [testingEnvironment, setTestingEnvironment] = useState<TestingEnvironmentState | null>(null);
  const [isTestingInstancePending, setIsTestingInstancePending] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createBranch, setCreateBranch] = useState("");
  const [createBase, setCreateBase] = useState("");
  const [isCreatePending, setIsCreatePending] = useState(false);

  const runtimeFetchCounterRef = useRef(0);
  const eventRescanTimeoutRef = useRef<number | null>(null);
  const copiedBranchResetTimeoutRef = useRef<number | null>(null);
  const rescanInFlightRef = useRef(false);
  const realtimeUnavailableRef = useRef(false);

  const workspaceMeta = activeWorkspace?.workspaceMeta ?? null;
  const workspaceRoot = activeWorkspace?.workspaceRoot ?? null;
  const forceCutActionKey = forceCutConfirmRow ? `${forceCutConfirmRow.path}:cut` : null;
  const forceCutConfirmLoading = forceCutActionKey !== null && pendingCutGrooveActions.includes(forceCutActionKey);
  const testingTargetWorktree = testingEnvironment?.targetWorktree;
  const testingInstanceIsRunning = testingEnvironment?.status === "running";
  const switchTestingTargetActionKey = switchTestingTargetConfirmRow ? `${switchTestingTargetConfirmRow.path}:test` : null;
  const switchTestingTargetConfirmLoading =
    switchTestingTargetActionKey !== null && pendingTestActions.includes(switchTestingTargetActionKey);
  const testingTargetRow = testingTargetWorktree ? worktreeRows.find((row) => row.worktree === testingTargetWorktree) : null;

  const groupedWorktreeItems = useMemo<GroupedWorktreeItem[]>(() => {
    return buildGroupedWorktreeItems(worktreeRows);
  }, [worktreeRows]);

  const applyWorkspaceContext = useCallback((result: WorkspaceContextResponse): void => {
    if (!result.workspaceRoot || !result.workspaceMeta || typeof result.hasWorktreesDirectory !== "boolean") {
      return;
    }
    setActiveWorkspace({
      workspaceRoot: result.workspaceRoot,
      workspaceMeta: result.workspaceMeta,
      hasWorktreesDirectory: result.hasWorktreesDirectory,
      rows: result.rows,
    });
    setWorktreeRows(result.rows);
    setHasWorktreesDirectory(result.hasWorktreesDirectory);
  }, []);

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

  const rescanWorktrees = useCallback(async (): Promise<void> => {
    if (!workspaceRoot) {
      return;
    }
    if (rescanInFlightRef.current) {
      return;
    }
    try {
      rescanInFlightRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      const result = await workspaceOpen(workspaceRoot);
      if (!result.ok) {
        setErrorMessage(describeWorkspaceContextError(result));
        return;
      }
      applyWorkspaceContext(result);
      setStatusMessage("Rescanned Groove worktrees.");
    } catch {
      setErrorMessage("Failed to rescan workspace worktrees.");
    } finally {
      rescanInFlightRef.current = false;
      setIsBusy(false);
    }
  }, [applyWorkspaceContext, workspaceRoot]);

  const fetchRuntimeState = useCallback(
    async (rowsOverride?: WorktreeRow[]): Promise<void> => {
      if (!workspaceRoot || !workspaceMeta) {
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

      try {
        const result = (await grooveList({
          rootName: workspaceMeta.rootName,
          knownWorktrees: rows.map((row) => row.worktree),
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
      }
    },
    [workspaceMeta, workspaceRoot, worktreeRows],
  );

  const fetchTestingEnvironmentState = useCallback(async (): Promise<void> => {
    if (!workspaceRoot || !workspaceMeta) {
      setTestingEnvironment(null);
      return;
    }

    try {
      const result = await testingEnvironmentGetStatus({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((row) => row.worktree),
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
  }, [workspaceMeta, workspaceRoot, worktreeRows]);

  useEffect(() => {
    void fetchRuntimeState();
  }, [fetchRuntimeState]);

  useEffect(() => {
    void fetchTestingEnvironmentState();
  }, [fetchTestingEnvironmentState]);

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
      if (eventRescanTimeoutRef.current !== null) {
        window.clearTimeout(eventRescanTimeoutRef.current);
      }
      eventRescanTimeoutRef.current = window.setTimeout(() => {
        void rescanWorktrees();
      }, 450);
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
          knownWorktrees: worktreeRows.map((row) => row.worktree),
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
  }, [rescanWorktrees, workspaceMeta, workspaceRoot, worktreeRows]);

  const refreshWorktrees = useCallback(async (): Promise<void> => {
    await rescanWorktrees();
  }, [rescanWorktrees]);

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
          await Promise.all([rescanWorktrees(), fetchRuntimeState()]);
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
    [fetchRuntimeState, rescanWorktrees, workspaceMeta, worktreeRows],
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
        await Promise.all([rescanWorktrees(), fetchRuntimeState()]);
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
  }, [createBase, createBranch, fetchRuntimeState, rescanWorktrees, workspaceMeta, worktreeRows]);

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
          await Promise.all([rescanWorktrees(), fetchRuntimeState()]);
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
    [fetchRuntimeState, rescanWorktrees, workspaceMeta, worktreeRows],
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
          await Promise.all([rescanWorktrees(), fetchRuntimeState()]);
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
    [fetchRuntimeState, rescanWorktrees, workspaceMeta, worktreeRows],
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
          await Promise.all([rescanWorktrees(), fetchRuntimeState()]);
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
    [fetchRuntimeState, rescanWorktrees, workspaceMeta, worktreeRows],
  );

  const runSetTestingTargetAction = useCallback(
    async (row: WorktreeRow, autoStartIfCurrentRunning = false): Promise<void> => {
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
          autoStartIfCurrentRunning,
        });

        if (result.ok) {
          setTestingEnvironment(result);
          toast.success(`Testing environment set to ${row.worktree}.`);
          await Promise.all([rescanWorktrees(), fetchRuntimeState(), fetchTestingEnvironmentState()]);
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
    [fetchRuntimeState, fetchTestingEnvironmentState, rescanWorktrees, workspaceMeta, worktreeRows],
  );

  const onSelectTestingTarget = useCallback(
    (row: WorktreeRow): void => {
      if (!testingTargetWorktree || testingTargetWorktree === row.worktree) {
        void runSetTestingTargetAction(row);
        return;
      }
      setSwitchTestingTargetConfirmRow(row);
    },
    [runSetTestingTargetAction, testingTargetWorktree],
  );

  const runStartTestingInstanceAction = useCallback(async (): Promise<void> => {
    if (!workspaceMeta || !testingTargetWorktree) {
      toast.error("Select a testing target before running locally.");
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStart({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success(`Started local testing for ${result.targetWorktree ?? testingTargetWorktree}.`, {
          description: result.instanceId ? `instance=${result.instanceId}` : undefined,
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
  }, [fetchTestingEnvironmentState, testingTargetWorktree, workspaceMeta, worktreeRows]);

  const runStartTestingInstanceInSeparateTerminalAction = useCallback(async (): Promise<void> => {
    if (!workspaceMeta || !testingTargetWorktree) {
      toast.error("Select a testing target before running locally on a separate terminal.");
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStartSeparateTerminal({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success(`Launched local testing for ${result.targetWorktree ?? testingTargetWorktree} in a separate terminal.`);
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
  }, [fetchTestingEnvironmentState, testingTargetWorktree, workspaceMeta, worktreeRows]);

  const runStopTestingInstanceAction = useCallback(async (): Promise<void> => {
    if (!workspaceMeta) {
      return;
    }

    setIsTestingInstancePending(true);
    try {
      const result = await testingEnvironmentStop({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
      });

      if (result.ok) {
        setTestingEnvironment(result);
        toast.success("Stopped local testing environment.");
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
      setSwitchTestingTargetConfirmRow(null);
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
    switchTestingTargetConfirmRow,
    runtimeStateByWorktree,
    testingEnvironment,
    isTestingInstancePending,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceMeta,
    workspaceRoot,
    forceCutConfirmLoading,
    testingTargetWorktree,
    testingInstanceIsRunning,
    switchTestingTargetConfirmLoading,
    testingTargetRow,
    groupedWorktreeItems,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setSwitchTestingTargetConfirmRow,
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
