"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CirclePause,
  CircleStop,
  Copy,
  FlaskConical,
  FolderOpen,
  Loader2,
  Octagon,
  OctagonPause,
  OctagonX,
  Plus,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppNavigation } from "@/components/app-navigation";
import { CreateWorktreeModal } from "@/components/create-worktree-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  grooveList,
  grooveNew,
  grooveRestore,
  grooveRm,
  grooveStop,
  listenWorkspaceChange,
  listenWorkspaceReady,
  testingEnvironmentGetStatus,
  testingEnvironmentStartSeparateTerminal,
  testingEnvironmentSetTarget,
  testingEnvironmentStart,
  testingEnvironmentStop,
  workspaceClearActive,
  workspaceEvents,
  workspaceGetActive,
  workspaceOpen,
  workspacePickAndOpen,
  type TestingEnvironmentResponse,
  type WorkspaceContextResponse,
  type WorkspaceRow,
} from "@/src/lib/ipc";

const DEBUG_CLIENT_LOGS = import.meta.env.VITE_GROOVE_DEBUG_LOGS === "true";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?: "auto" | "ghostty" | "warp" | "kitty" | "gnome" | "xterm" | "none" | "custom";
  terminalCustomCommand?: string | null;
};

type WorktreeRow = WorkspaceRow;
type WorktreeStatus = WorkspaceRow["status"];
type OpencodeState = "running" | "not-running" | "unknown";

type RuntimeStateRow = {
  branch: string;
  worktree: string;
  opencodeState: OpencodeState;
  opencodeInstanceId?: string;
  logState: "latest" | "broken-latest" | "none" | "unknown";
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

type RestoreApiResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type CutGrooveApiResponse = RestoreApiResponse;

type StopApiResponse = {
  requestId?: string;
  ok: boolean;
  alreadyStopped?: boolean;
  pid?: number;
  source?: "request" | "runtime";
  error?: string;
};

type TestingEnvironmentState = TestingEnvironmentResponse;

type ActiveWorkspace = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  rows: WorktreeRow[];
  hasWorktreesDirectory: boolean;
};

const READY_STATUS_CLASSES = "border-green-700/30 bg-green-500/15 text-green-800";
const CLOSING_STATUS_CLASSES = "border-rose-700/35 bg-rose-500/15 text-rose-900";
const PAUSED_STATUS_CLASSES = "border-yellow-700/35 bg-yellow-500/15 text-yellow-900";
const CORRUPTED_STATUS_CLASSES = "border-orange-700/35 bg-orange-500/15 text-orange-900";
const SOFT_RED_BUTTON_CLASSES = "bg-rose-600 text-white hover:bg-rose-500 [&_svg]:text-white";

function describeWorkspaceContextError(result: WorkspaceContextResponse): string {
  if (result.error && result.error.trim().length > 0) {
    return result.error;
  }
  return "Failed to load workspace context.";
}

function summarizeRestoreOutput(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`.trim();
  const firstLine = combined.split("\n").map((line) => line.trim()).find(Boolean);
  if (!firstLine) {
    return undefined;
  }
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
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
  return /contains modified or untracked files/.test(combinedOutput) && /use --force to delete it/.test(combinedOutput);
}

function deriveWorktreeStatus(worktreeStatus: WorktreeRow["status"], runtimeRow: RuntimeStateRow | undefined): WorktreeStatus {
  if (worktreeStatus === "corrupted") {
    return "corrupted";
  }

  if (worktreeStatus === "closing") {
    return "closing";
  }

  return runtimeRow?.opencodeState === "running" ? "ready" : "paused";
}

function getWorktreeStatusBadgeClasses(status: WorktreeStatus): string {
  if (status === "ready") {
    return READY_STATUS_CLASSES;
  }
  if (status === "closing") {
    return CLOSING_STATUS_CLASSES;
  }
  if (status === "paused") {
    return PAUSED_STATUS_CLASSES;
  }
  return CORRUPTED_STATUS_CLASSES;
}

function getWorktreeStatusTitle(status: WorktreeStatus): string {
  if (status === "ready") {
    return "Workspace is valid and opencode is running.";
  }
  if (status === "closing") {
    return "Workspace is currently closing.";
  }
  if (status === "paused") {
    return "Workspace is valid, but opencode is not running.";
  }
  return "Workspace is invalid or missing groove metadata.";
}

function getWorktreeStatusIcon(status: WorktreeStatus) {
  if (status === "ready") {
    return <Octagon aria-hidden="true" />;
  }
  if (status === "closing") {
    return <OctagonX aria-hidden="true" />;
  }
  if (status === "paused") {
    return <OctagonPause aria-hidden="true" />;
  }
  return <AlertTriangle aria-hidden="true" />;
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

function parseLastExecutedAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRelativeAgeGroupLabel(timestamp: Date, now: Date): string {
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const valueStart = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  const dayDiff = Math.floor((nowStart.getTime() - valueStart.getTime()) / 86_400_000);

  if (dayDiff <= 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Yesterday";
  }
  if (now.getFullYear() === timestamp.getFullYear() && now.getMonth() === timestamp.getMonth()) {
    return `${String(dayDiff)} days ago`;
  }

  const monthDiff = (now.getFullYear() - timestamp.getFullYear()) * 12 + (now.getMonth() - timestamp.getMonth());
  if (monthDiff > 0 && now.getFullYear() === timestamp.getFullYear()) {
    return `${String(monthDiff)} months ago`;
  }

  const yearDiff = now.getFullYear() - timestamp.getFullYear();
  return `${String(Math.max(yearDiff, 1))} years ago`;
}

type GroupedWorktreeItem =
  | {
      type: "section";
      label: string;
      key: string;
    }
  | {
      type: "row";
      row: WorktreeRow;
      key: string;
    };

export default function Home() {
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
    const sortedRows = [...worktreeRows].sort((left, right) => {
      const leftDate = parseLastExecutedAt(left.lastExecutedAt);
      const rightDate = parseLastExecutedAt(right.lastExecutedAt);
      const leftTime = leftDate?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightTime = rightDate?.getTime() ?? Number.NEGATIVE_INFINITY;

      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      const byWorktree = left.worktree.localeCompare(right.worktree);
      if (byWorktree !== 0) {
        return byWorktree;
      }
      return left.path.localeCompare(right.path);
    });

    const now = new Date();
    const items: GroupedWorktreeItem[] = [];
    let activeGroup: string | null = null;

    for (const row of sortedRows) {
      const rowDate = parseLastExecutedAt(row.lastExecutedAt);
      const groupLabel = rowDate ? getRelativeAgeGroupLabel(rowDate, now) : "No activity yet";
      if (groupLabel !== activeGroup) {
        activeGroup = groupLabel;
        items.push({
          type: "section",
          label: groupLabel,
          key: `section:${groupLabel}`,
        });
      }

      items.push({
        type: "row",
        row,
        key: `row:${row.path}`,
      });
    }

    return items;
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

  const pickDirectory = async (): Promise<void> => {
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
  };

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

  const fetchRuntimeState = useCallback(async (rowsOverride?: WorktreeRow[]): Promise<void> => {
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
  }, [workspaceMeta, workspaceRoot, worktreeRows]);

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
  }, [fetchRuntimeState, rescanWorktrees, workspaceMeta, workspaceRoot, worktreeRows]);

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
        setCopiedBranchPath((prev) => (prev === row.path ? null : prev));
        copiedBranchResetTimeoutRef.current = null;
      }, 1500);
    } catch {
      toast.error(`Failed to copy branch for ${row.worktree}.`);
    }
  };

  const runRestoreAction = async (row: WorktreeRow): Promise<void> => {
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
  };

  const runCreateWorktreeAction = async (): Promise<void> => {
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
  };

  const runCutGrooveAction = async (row: WorktreeRow, force = false): Promise<void> => {
    if (!workspaceMeta) {
      return;
    }
    const actionKey = `${row.path}:cut`;
    setPendingCutGrooveActions((prev) => (prev.includes(actionKey) ? prev : [...prev, actionKey]));

    try {
      const result = (await grooveRm({
        rootName: workspaceMeta.rootName,
        knownWorktrees: worktreeRows.map((candidate) => candidate.worktree),
        workspaceMeta,
        target: row.worktree,
        worktree: row.worktree,
        ...(force ? { force: true } : {}),
      })) as CutGrooveApiResponse;

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
  };

  const runStopAction = async (row: WorktreeRow, runtimeRow: RuntimeStateRow | undefined): Promise<void> => {
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
            description: appendRequestId(result.pid ? `PID ${String(result.pid)} is not running.` : "No running PID found for this worktree.", result.requestId),
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
  };

  const runPlayGrooveAction = async (row: WorktreeRow): Promise<void> => {
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
  };

  const runSetTestingTargetAction = async (row: WorktreeRow, autoStartIfCurrentRunning = false): Promise<void> => {
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
  };

  const onSelectTestingTarget = (row: WorktreeRow): void => {
    if (!testingTargetWorktree || testingTargetWorktree === row.worktree) {
      void runSetTestingTargetAction(row);
      return;
    }
    setSwitchTestingTargetConfirmRow(row);
  };

  const runStartTestingInstanceAction = async (): Promise<void> => {
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
  };

  const runStartTestingInstanceInSeparateTerminalAction = async (): Promise<void> => {
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
  };

  const runStopTestingInstanceAction = async (): Promise<void> => {
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
  };

  const closeCurrentWorkspace = async (): Promise<void> => {
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
  };

  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation />

        <div className="min-w-0 flex-1 space-y-4">
          {!activeWorkspace ? (
            <Card className="mx-auto w-full max-w-xl" aria-live="polite">
              <CardHeader>
                <CardTitle>No directory selected</CardTitle>
                <CardDescription>Select a local folder to create or load its Groove workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" onClick={pickDirectory} disabled={isBusy}>
                  {isBusy ? "Opening picker..." : "Select directory"}
                </Button>
                {statusMessage && (
                  <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
                )}
                {errorMessage && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div aria-live="polite" className="space-y-3">
              <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
                <div className="space-y-1">
                  <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
                  <p className="text-sm text-muted-foreground">
                    Directory: <span className="font-medium text-foreground">{workspaceMeta?.rootName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{workspaceRoot}</p>
                </div>
                <TooltipProvider>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => {
                        setCreateBranch("");
                        setCreateBase("");
                        setIsCreateModalOpen(true);
                      }}
                      disabled={isBusy || isCreatePending}
                      size="sm"
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      <span>Create worktree</span>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" onClick={refreshWorktrees} disabled={isBusy} size="sm" className="w-8 px-0" aria-label="Refresh">
                          {isBusy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="secondary" onClick={pickDirectory} disabled={isBusy} size="sm" className="w-8 px-0" aria-label="Pick another directory">
                          <FolderOpen aria-hidden="true" className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Pick another directory</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" onClick={() => setIsCloseWorkspaceConfirmOpen(true)} disabled={isBusy} size="sm" className="w-8 px-0" aria-label="Close current workspace">
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
                  <section className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="text-sm font-semibold tracking-tight">Current Testing Environment</h2>
                        <p className="text-xs text-muted-foreground">
                          {testingTargetWorktree
                            ? `Target: ${testingTargetWorktree}`
                            : "Target: none selected (pick one with Test in the table)."}
                        </p>
                        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {testingEnvironment?.status === "running" ? (
                            <CirclePause aria-hidden="true" className="size-3.5" />
                          ) : (
                            <Play aria-hidden="true" className="size-3.5" />
                          )}
                          <span>{testingEnvironment?.status === "running" ? "Running" : "Not running"}</span>
                          {testingEnvironment?.instanceId ? <span>{`(instance=${testingEnvironment.instanceId})`}</span> : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {testingEnvironment?.status === "running" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              void runStopTestingInstanceAction();
                            }}
                            disabled={isTestingInstancePending}
                          >
                            {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CircleStop aria-hidden="true" className="size-4" />}
                            <span>Stop local</span>
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onClick={() => {
                                void runStartTestingInstanceAction();
                              }}
                              disabled={isTestingInstancePending || !testingTargetRow}
                            >
                              {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
                              <span>Run locally</span>
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-9 px-4 border border-border/60 transition-colors hover:bg-secondary/70"
                              onClick={() => {
                                void runStartTestingInstanceInSeparateTerminalAction();
                              }}
                              disabled={isTestingInstancePending || !testingTargetRow}
                            >
                              {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Terminal aria-hidden="true" className="size-4" />}
                              <span>Run separately</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>

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
                            <TableHead>Branch</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupedWorktreeItems.map((item) => {
                            if (item.type === "section") {
                              return (
                                <TableRow key={item.key} className="bg-muted/25">
                                  <TableCell colSpan={4} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {item.label}
                                  </TableCell>
                                </TableRow>
                              );
                            }

                            const { row } = item;
                            const restoreActionKey = `${row.path}:restore`;
                            const cutActionKey = `${row.path}:cut`;
                            const stopActionKey = `${row.path}:stop`;
                            const playActionKey = `${row.path}:play`;
                            const testActionKey = `${row.path}:test`;
                            const branchCopied = copiedBranchPath === row.path;
                            const restorePending = pendingRestoreActions.includes(restoreActionKey);
                            const cutPending = pendingCutGrooveActions.includes(cutActionKey);
                            const stopPending = pendingStopActions.includes(stopActionKey);
                            const playPending = pendingPlayActions.includes(playActionKey);
                            const testPending = pendingTestActions.includes(testActionKey);
                            const rowPending = restorePending || cutPending || stopPending || playPending || testPending;
                            const runtimeRow = runtimeStateByWorktree[row.worktree];
                            const status = deriveWorktreeStatus(row.status, runtimeRow);
                            const opencodeState = runtimeRow?.opencodeState ?? "unknown";
                            const opencodeInstanceId = runtimeRow?.opencodeInstanceId;
                            const hasRunningOpencodeInstance = status !== "corrupted" && opencodeState === "running" && typeof opencodeInstanceId === "string" && opencodeInstanceId.trim().length > 0;
                            const isCurrentTestingTarget = testingTargetWorktree === row.worktree;

                            return (
                              <TableRow key={item.key} className={isCurrentTestingTarget ? "bg-muted/25" : undefined}>
                                <TableCell>
                                  <span className="inline-flex items-center gap-1.5">
                                    {isCurrentTestingTarget ? <FlaskConical aria-hidden="true" className="size-3.5 text-muted-foreground" /> : null}
                                    <span>{row.worktree}</span>
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2 px-2 py-1">
                                    <span className="min-w-0 flex-1 truncate select-text">{row.branchGuess}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 shrink-0 p-0 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                      onClick={() => {
                                        void copyBranchName(row);
                                      }}
                                      aria-label={`Copy branch name ${row.branchGuess}`}
                                    >
                                      {branchCopied ? (
                                        <Check aria-hidden="true" className="size-3.5 text-emerald-700" />
                                      ) : (
                                        <Copy aria-hidden="true" className="size-3.5" />
                                      )}
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={getWorktreeStatusBadgeClasses(status)} title={getWorktreeStatusTitle(status)}>
                                    {getWorktreeStatusIcon(status)}
                                    {status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <TooltipProvider>
                                    <div className="flex items-center justify-end gap-1">
                                      {status === "corrupted" && (
                                        <>
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
                                                aria-label={`Repair ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {restorePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Wrench aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Repair</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                                                onClick={() => {
                                                  setCutConfirmRow(row);
                                                }}
                                                aria-label={`Remove worktree ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Remove worktree</TooltipContent>
                                          </Tooltip>
                                        </>
                                      )}
                                      {status === "paused" && (
                                        <>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                className="h-8 w-8 p-0 transition-colors hover:bg-green-500/20 hover:text-green-700"
                                                onClick={() => {
                                                  void runPlayGrooveAction(row);
                                                }}
                                                aria-label={`Play groove for ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {playPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Play groove</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant={isCurrentTestingTarget ? "secondary" : "outline"}
                                                size="sm"
                                                className="h-8 w-8 p-0 transition-colors hover:bg-cyan-500/20 hover:text-cyan-700"
                                                onClick={() => {
                                                  onSelectTestingTarget(row);
                                                }}
                                                aria-label={`Set testing target to ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {testPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <FlaskConical aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{isCurrentTestingTarget ? "Current test target" : "Set testing"}</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                                                onClick={() => {
                                                  setCutConfirmRow(row);
                                                }}
                                                aria-label={`Remove worktree ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Remove worktree</TooltipContent>
                                          </Tooltip>
                                        </>
                                      )}
                                      {status === "ready" && (
                                        <>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => {
                                                  void runStopAction(row, runtimeRow);
                                                }}
                                                aria-label={`Stop groove for ${row.worktree}`}
                                                disabled={rowPending || !hasRunningOpencodeInstance}
                                              >
                                                {stopPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CircleStop aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Stop groove</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant={isCurrentTestingTarget ? "secondary" : "outline"}
                                                size="sm"
                                                className="h-8 w-8 p-0 transition-colors hover:bg-cyan-500/20 hover:text-cyan-700"
                                                onClick={() => {
                                                  onSelectTestingTarget(row);
                                                }}
                                                aria-label={`Set testing target to ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {testPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <FlaskConical aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>{isCurrentTestingTarget ? "Current test target" : "Set testing"}</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                                                onClick={() => {
                                                  setCutConfirmRow(row);
                                                }}
                                                aria-label={`Remove worktree ${row.worktree}`}
                                                disabled={rowPending}
                                              >
                                                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Remove worktree</TooltipContent>
                                          </Tooltip>
                                        </>
                                      )}
                                    </div>
                                  </TooltipProvider>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {statusMessage && (
                    <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
                  )}
                  {errorMessage && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
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
        onConfirm={() => {
          if (!cutConfirmRow) {
            return;
          }
          const selectedRow = cutConfirmRow;
          setCutConfirmRow(null);
          void runCutGrooveAction(selectedRow);
        }}
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
        onConfirm={() => {
          if (!forceCutConfirmRow) {
            return;
          }
          const selectedRow = forceCutConfirmRow;
          setForceCutConfirmRow(null);
          void runCutGrooveAction(selectedRow, true);
        }}
        onCancel={() => {
          setForceCutConfirmRow(null);
        }}
      />

      <ConfirmModal
        open={switchTestingTargetConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSwitchTestingTargetConfirmRow(null);
          }
        }}
        title="Switch testing target?"
        description={
          switchTestingTargetConfirmRow
            ? testingInstanceIsRunning
              ? `Testing is currently running for "${testingTargetWorktree}". This will stop it, switch to "${switchTestingTargetConfirmRow.worktree}", and start local testing there.`
              : `Testing target is currently "${testingTargetWorktree}". This will switch target to "${switchTestingTargetConfirmRow.worktree}".`
            : "Switch to the selected testing target."
        }
        confirmLabel={testingInstanceIsRunning ? "Stop and switch" : "Switch target"}
        cancelLabel="Cancel"
        loading={switchTestingTargetConfirmLoading}
        onConfirm={() => {
          if (!switchTestingTargetConfirmRow) {
            return;
          }
          const selectedRow = switchTestingTargetConfirmRow;
          setSwitchTestingTargetConfirmRow(null);
          void runSetTestingTargetAction(selectedRow, testingInstanceIsRunning);
        }}
        onCancel={() => {
          setSwitchTestingTargetConfirmRow(null);
        }}
      />

      <ConfirmModal
        open={isCloseWorkspaceConfirmOpen}
        onOpenChange={setIsCloseWorkspaceConfirmOpen}
        title="Close current workspace?"
        description="This clears the active workspace in desktop storage until you select a directory again."
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

      <CreateWorktreeModal
        open={isCreateModalOpen}
        branch={createBranch}
        base={createBase}
        loading={isCreatePending}
        onOpenChange={(open) => {
          setIsCreateModalOpen(open);
          if (!open && !isCreatePending) {
            setCreateBranch("");
            setCreateBase("");
          }
        }}
        onBranchChange={setCreateBranch}
        onBaseChange={setCreateBase}
        onSubmit={() => {
          void runCreateWorktreeAction();
        }}
        onCancel={() => {
          if (isCreatePending) {
            return;
          }
          setIsCreateModalOpen(false);
          setCreateBranch("");
          setCreateBase("");
        }}
      />
    </main>
  );
}
