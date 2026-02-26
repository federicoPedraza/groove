"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

import { DiagnosticsHeader } from "@/components/pages/diagnostics/diagnostics-header";
import { DiagnosticsSystemSidebar } from "@/components/pages/diagnostics/diagnostics-system-sidebar";
import { EmergencyCard } from "@/components/pages/diagnostics/emergency-card";
import { NodeAppsCard } from "@/components/pages/diagnostics/node-apps-card";
import { OpencodeInstancesCard } from "@/components/pages/diagnostics/opencode-instances-card";
import { PageShell } from "@/components/pages/page-shell";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { appendRequestId } from "@/lib/utils/common/request-id";
import {
  diagnosticsCleanAllDevServers,
  diagnosticsGetSystemOverview,
  diagnosticsGetMsotConsumingPrograms,
  diagnosticsListOpencodeInstances,
  diagnosticsListWorktreeNodeApps,
  diagnosticsStopAllNonWorktreeOpencodeInstances,
  isTelemetryEnabled,
  type DiagnosticsMostConsumingProgramsResponse,
  type DiagnosticsSystemOverview,
  type DiagnosticsSystemOverviewResponse,
  diagnosticsStopAllOpencodeInstances,
  diagnosticsStopProcess,
  type DiagnosticsNodeAppRow,
  type DiagnosticsNodeAppsResponse,
  type DiagnosticsProcessRow,
  type DiagnosticsStopAllResponse,
  type DiagnosticsStopResponse,
  type WorkspaceGitignoreSanityResponse,
  workspaceGetActive,
  workspaceGitignoreSanityApply,
  workspaceGitignoreSanityCheck,
} from "@/src/lib/ipc";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";

function logDiagnosticsTelemetry(event: string, payload: Record<string, unknown>): void {
  if (!isTelemetryEnabled()) {
    return;
  }
  console.info(`${UI_TELEMETRY_PREFIX} ${event}`, payload);
}

export default function DiagnosticsPage() {
  const diagnosticsEnterPerfMsRef = useRef<number>(performance.now());
  const isSystemOverviewRequestInFlightRef = useRef(false);
  const [opencodeRows, setOpencodeRows] = useState<DiagnosticsProcessRow[]>([]);
  const [nodeAppRows, setNodeAppRows] = useState<DiagnosticsNodeAppRow[]>([]);
  const [isLoadingOpencode, setIsLoadingOpencode] = useState(false);
  const [isLoadingNodeApps, setIsLoadingNodeApps] = useState(false);
  const [hasLoadedProcessSnapshots, setHasLoadedProcessSnapshots] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [isClosingAllNodeInstances, setIsClosingAllNodeInstances] = useState(false);
  const [isKillingAllNonWorktreeOpencode, setIsKillingAllNonWorktreeOpencode] = useState(false);
  const [isCleaningAllDevServers, setIsCleaningAllDevServers] = useState(false);
  const [pendingStopPids, setPendingStopPids] = useState<number[]>([]);
  const [opencodeError, setOpencodeError] = useState<string | null>(null);
  const [nodeAppsError, setNodeAppsError] = useState<string | null>(null);
  const [nodeAppsWarning, setNodeAppsWarning] = useState<string | null>(null);
  const [mostConsumingProgramsOutput, setMostConsumingProgramsOutput] = useState<string | null>(null);
  const [mostConsumingProgramsError, setMostConsumingProgramsError] = useState<string | null>(null);
  const [isLoadingMostConsumingPrograms, setIsLoadingMostConsumingPrograms] = useState(false);
  const [systemOverview, setSystemOverview] = useState<DiagnosticsSystemOverview | null>(null);
  const [systemOverviewError, setSystemOverviewError] = useState<string | null>(null);
  const [isLoadingSystemOverview, setIsLoadingSystemOverview] = useState(false);
  const [hasActiveWorkspace, setHasActiveWorkspace] = useState(false);
  const [gitignoreSanity, setGitignoreSanity] = useState<WorkspaceGitignoreSanityResponse | null>(null);
  const [gitignoreSanityStatusMessage, setGitignoreSanityStatusMessage] = useState<string | null>(null);
  const [gitignoreSanityErrorMessage, setGitignoreSanityErrorMessage] = useState<string | null>(null);
  const [isGitignoreSanityChecking, setIsGitignoreSanityChecking] = useState(false);
  const [isGitignoreSanityApplyPending, setIsGitignoreSanityApplyPending] = useState(false);

  const clearGitignoreSanityState = useCallback((): void => {
    setHasActiveWorkspace(false);
    setGitignoreSanity(null);
    setGitignoreSanityStatusMessage(null);
    setGitignoreSanityErrorMessage(null);
    setIsGitignoreSanityChecking(false);
    setIsGitignoreSanityApplyPending(false);
  }, []);

  const loadGitignoreSanityCheck = useCallback(
    async (options?: { showPending?: boolean; clearStatusMessage?: boolean }): Promise<void> => {
      const showPending = options?.showPending !== false;

      try {
        if (showPending) {
          setIsGitignoreSanityChecking(true);
        }
        if (options?.clearStatusMessage) {
          setGitignoreSanityStatusMessage(null);
        }

        const workspace = await workspaceGetActive();
        if (!workspace.ok || !workspace.workspaceRoot) {
          clearGitignoreSanityState();
          return;
        }

        setHasActiveWorkspace(true);
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
    [clearGitignoreSanityState],
  );

  const applyGitignoreSanityPatch = useCallback(async (): Promise<void> => {
    try {
      setIsGitignoreSanityApplyPending(true);
      setGitignoreSanityStatusMessage(null);
      setGitignoreSanityErrorMessage(null);

      const workspace = await workspaceGetActive();
      if (!workspace.ok || !workspace.workspaceRoot) {
        clearGitignoreSanityState();
        return;
      }

      setHasActiveWorkspace(true);
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
  }, [clearGitignoreSanityState, loadGitignoreSanityCheck]);

  useEffect(() => {
    const mountDurationMs = Math.max(0, performance.now() - diagnosticsEnterPerfMsRef.current);
    logDiagnosticsTelemetry("diagnostics.enter.mount", {
      duration_ms: Number(mountDurationMs.toFixed(2)),
    });

    let rafFrameId = 0;
    let rafNestedFrameId = 0;
    rafFrameId = requestAnimationFrame(() => {
      rafNestedFrameId = requestAnimationFrame(() => {
        const afterPaintDurationMs = Math.max(0, performance.now() - diagnosticsEnterPerfMsRef.current);
        logDiagnosticsTelemetry("diagnostics.enter.after_paint", {
          duration_ms: Number(afterPaintDurationMs.toFixed(2)),
        });
      });
    });

    return () => {
      cancelAnimationFrame(rafFrameId);
      cancelAnimationFrame(rafNestedFrameId);
    };
  }, []);

  const loadOpencodeRows = useCallback(async (showLoading = true): Promise<DiagnosticsProcessRow[]> => {
    const startedAtMs = performance.now();
    setHasLoadedProcessSnapshots(true);
    if (showLoading) {
      setIsLoadingOpencode(true);
    }
    setOpencodeError(null);

    try {
      const result = await diagnosticsListOpencodeInstances();
      if (!result.ok) {
        setOpencodeError(result.error ?? "Failed to load worktree OpenCode processes.");
        const durationMs = Math.max(0, performance.now() - startedAtMs);
        logDiagnosticsTelemetry("diagnostics.load_opencode_rows", {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "error",
          rows: 0,
        });
        return [];
      }
      setOpencodeRows(result.rows);
      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logDiagnosticsTelemetry("diagnostics.load_opencode_rows", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "ok",
        rows: result.rows.length,
      });
      return result.rows;
    } catch {
      setOpencodeError("Failed to load worktree OpenCode processes.");
      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logDiagnosticsTelemetry("diagnostics.load_opencode_rows", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "error",
        rows: 0,
      });
      return [];
    } finally {
      if (showLoading) {
        setIsLoadingOpencode(false);
      }
    }
  }, []);

  const loadNodeAppRows = useCallback(async (showLoading = true): Promise<DiagnosticsNodeAppRow[]> => {
    const startedAtMs = performance.now();
    setHasLoadedProcessSnapshots(true);
    if (showLoading) {
      setIsLoadingNodeApps(true);
    }
    setNodeAppsError(null);

    try {
      const result = (await diagnosticsListWorktreeNodeApps()) as DiagnosticsNodeAppsResponse;
      if (!result.ok) {
        setNodeAppsWarning(null);
        setNodeAppsError(result.error ?? "Failed to load worktree node apps.");
        const durationMs = Math.max(0, performance.now() - startedAtMs);
        logDiagnosticsTelemetry("diagnostics.load_node_app_rows", {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "error",
          rows: 0,
        });
        return [];
      }

      setNodeAppRows(result.rows);
      setNodeAppsWarning(result.warning ?? null);
      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logDiagnosticsTelemetry("diagnostics.load_node_app_rows", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "ok",
        rows: result.rows.length,
        warning: result.warning != null,
      });
      return result.rows;
    } catch {
      setNodeAppsWarning(null);
      setNodeAppsError("Failed to load worktree node apps.");
      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logDiagnosticsTelemetry("diagnostics.load_node_app_rows", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "error",
        rows: 0,
      });
      return [];
    } finally {
      if (showLoading) {
        setIsLoadingNodeApps(false);
      }
    }
  }, []);

  const loadProcessSnapshots = useCallback(async (): Promise<void> => {
    const startedAtMs = performance.now();
    setHasLoadedProcessSnapshots(true);
    try {
      const [nextOpencodeRows, nextNodeAppRows] = await Promise.all([loadOpencodeRows(), loadNodeAppRows()]);
      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logDiagnosticsTelemetry("diagnostics.load_process_snapshots", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "ok",
        opencode_rows: nextOpencodeRows.length,
        node_app_rows: nextNodeAppRows.length,
      });
    } catch {
      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logDiagnosticsTelemetry("diagnostics.load_process_snapshots", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "error",
      });
    }
  }, [loadNodeAppRows, loadOpencodeRows]);

  const loadSystemOverview = useCallback(async (showLoading = true): Promise<void> => {
    if (isSystemOverviewRequestInFlightRef.current) {
      return;
    }

    isSystemOverviewRequestInFlightRef.current = true;
    if (showLoading) {
      setIsLoadingSystemOverview(true);
    }
    setSystemOverviewError(null);

    try {
      const result = (await diagnosticsGetSystemOverview()) as DiagnosticsSystemOverviewResponse;
      if (!result.ok || !result.overview) {
        setSystemOverview(null);
        setSystemOverviewError(result.error ?? "Failed to load system usage.");
        return;
      }

      setSystemOverview(result.overview);
    } catch {
      setSystemOverview(null);
      setSystemOverviewError("Failed to load system usage.");
    } finally {
      isSystemOverviewRequestInFlightRef.current = false;
      if (showLoading) {
        setIsLoadingSystemOverview(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadProcessSnapshots();
  }, [loadProcessSnapshots]);

  useEffect(() => {
    void loadSystemOverview();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadSystemOverview(false);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadSystemOverview]);

  useEffect(() => {
    void loadGitignoreSanityCheck({ clearStatusMessage: true });
  }, [loadGitignoreSanityCheck]);

  const runStopProcessAction = async (pid: number): Promise<void> => {
    setPendingStopPids((prev) => (prev.includes(pid) ? prev : [...prev, pid]));

    try {
      const result = (await diagnosticsStopProcess(pid)) as DiagnosticsStopResponse;
      if (!result.ok) {
        toast.error(`Failed to stop PID ${String(pid)}.`, {
          description: appendRequestId(result.error, result.requestId),
        });
        return;
      }

      if (result.alreadyStopped) {
        toast.info(`PID ${String(pid)} is already stopped.`, {
          description: appendRequestId(undefined, result.requestId),
        });
      } else {
        toast.success(`Stopped PID ${String(pid)}.`, {
          description: appendRequestId(undefined, result.requestId),
        });
      }
      const [nextOpencodeRows, nextNodeAppRows] = await Promise.all([
        loadOpencodeRows(false),
        loadNodeAppRows(false),
      ]);

      const stillRunning =
        nextOpencodeRows.some((row) => row.pid === pid) ||
        nextNodeAppRows.some((row) => row.pid === pid);
      if (stillRunning) {
        toast.error(`PID ${String(pid)} still appears to be running after stop.`);
      }
    } catch {
      toast.error(`Stop request failed for PID ${String(pid)}.`);
    } finally {
      setPendingStopPids((prev) => prev.filter((candidate) => candidate !== pid));
    }
  };

  const runStopWorktreeProcessesAction = async (worktree: string, pids: number[], processLabel: string): Promise<void> => {
    const uniquePids = [...new Set(pids)];
    if (uniquePids.length === 0) {
      return;
    }

    setPendingStopPids((prev) => [...new Set([...prev, ...uniquePids])]);

    try {
      const stopResults = await Promise.all(uniquePids.map(async (pid) => ({ pid, result: (await diagnosticsStopProcess(pid)) as DiagnosticsStopResponse })));

      let stopped = 0;
      let alreadyStopped = 0;
      let failed = 0;

      for (const { result } of stopResults) {
        if (!result.ok) {
          failed += 1;
          continue;
        }

        if (result.alreadyStopped) {
          alreadyStopped += 1;
        } else {
          stopped += 1;
        }
      }

      if (failed > 0) {
        toast.error(`Some ${processLabel} cleanup actions failed for ${worktree}.`, {
          description: `attempted=${String(uniquePids.length)}, stopped=${String(stopped)}, alreadyStopped=${String(alreadyStopped)}, failed=${String(failed)}`,
        });
      } else {
        toast.success(`${processLabel} cleanup completed for ${worktree}.`, {
          description: `attempted=${String(uniquePids.length)}, stopped=${String(stopped)}, alreadyStopped=${String(alreadyStopped)}, failed=0`,
        });
      }

      const [nextOpencodeRows, nextNodeApps] = await Promise.all([loadOpencodeRows(false), loadNodeAppRows(false)]);
      const hasRemainingTargetProcess = uniquePids.some(
        (pid) => nextOpencodeRows.some((row) => row.pid === pid) || nextNodeApps.some((row) => row.pid === pid),
      );
      if (hasRemainingTargetProcess) {
        toast.error(`Some ${processLabel} processes in ${worktree} are still running after cleanup.`);
      }
    } catch {
      toast.error(`Cleanup request failed for ${worktree} ${processLabel} processes.`);
    } finally {
      setPendingStopPids((prev) => prev.filter((candidate) => !uniquePids.includes(candidate)));
    }
  };

  const runStopAllOpencodeAction = async (): Promise<void> => {
    setIsClosingAll(true);

    try {
      const result = (await diagnosticsStopAllOpencodeInstances()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Failed to stop all worktree OpenCode instances.", {
          description: appendRequestId(result.error, result.requestId),
        });
        return;
      }

      toast.success("Worktree OpenCode stop-all completed.", {
        description: appendRequestId(
          `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
          result.requestId,
        ),
      });
      const [nextOpencodeRows] = await Promise.all([
        loadOpencodeRows(false),
        loadNodeAppRows(false),
      ]);
      if (nextOpencodeRows.length > 0) {
        toast.error("Some worktree OpenCode instances are still running after stop-all.");
      }
    } catch {
      toast.error("Stop-all request failed.");
    } finally {
      setIsClosingAll(false);
    }
  };

  const runCleanAllDevServersAction = async (): Promise<void> => {
    setIsCleaningAllDevServers(true);

    try {
      const result = (await diagnosticsCleanAllDevServers()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Clean all failed.", {
          description: appendRequestId(result.error, result.requestId),
        });
      } else {
        toast.success("Clean all completed for worktree OpenCode + worktree Node processes.", {
          description: appendRequestId(
            `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
            result.requestId,
          ),
        });
      }

      const [nextOpencodeRows, nextNodeApps] = await Promise.all([loadOpencodeRows(false), loadNodeAppRows(false)]);
      if (nextOpencodeRows.length > 0 || nextNodeApps.length > 0) {
        toast.error("Some worktree OpenCode or worktree Node processes are still running after clean all.");
      }
    } catch {
      toast.error("Clean-all request failed.");
    } finally {
      setIsCleaningAllDevServers(false);
    }
  };

  const runKillAllNonWorktreeOpencodeAction = async (): Promise<void> => {
    setIsKillingAllNonWorktreeOpencode(true);

    try {
      const result = (await diagnosticsStopAllNonWorktreeOpencodeInstances()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Failed to kill non-worktree OpenCode processes.", {
          description: appendRequestId(result.error, result.requestId),
        });
        return;
      }

      toast.success("Emergency kill completed for non-worktree OpenCode processes.", {
        description: appendRequestId(
          `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
          result.requestId,
        ),
      });
    } catch {
      toast.error("Emergency kill request failed.");
    } finally {
      setIsKillingAllNonWorktreeOpencode(false);
    }
  };

  const runCloseAllNodeInstancesAction = async (): Promise<void> => {
    const uniquePids = [...new Set(nodeAppRows.map((row) => row.pid))];
    if (uniquePids.length === 0) {
      return;
    }

    setIsClosingAllNodeInstances(true);
    try {
      await runStopWorktreeProcessesAction("all worktrees", uniquePids, "Node app");
    } finally {
      setIsClosingAllNodeInstances(false);
    }
  };

  const runGetMsotConsumingProgramsAction = async (): Promise<void> => {
    setIsLoadingMostConsumingPrograms(true);
    setMostConsumingProgramsError(null);

    try {
      const result = (await diagnosticsGetMsotConsumingPrograms()) as DiagnosticsMostConsumingProgramsResponse;
      if (!result.ok) {
        setMostConsumingProgramsOutput(null);
        const message = appendRequestId(result.error ?? "Failed to run memory usage query.", result.requestId) ?? "Failed to run memory usage query.";
        setMostConsumingProgramsError(message);
        toast.error("Failed to load top processes.", {
          description: message,
        });
        return;
      }

      setMostConsumingProgramsOutput(result.output || "No output.");
      toast.success("Loaded top processes.");
    } catch {
      setMostConsumingProgramsOutput(null);
      setMostConsumingProgramsError("Failed to run memory usage query.");
      toast.error("Failed to load top processes.");
    } finally {
      setIsLoadingMostConsumingPrograms(false);
    }
  };

  const shouldShowApplyPatch = Boolean(
    hasActiveWorkspace && gitignoreSanity?.isApplicable && gitignoreSanity.missingEntries.length > 0,
  );
  const shouldShowGitignoreSanityPanel = Boolean(
    isGitignoreSanityChecking ||
      gitignoreSanityErrorMessage ||
      !hasActiveWorkspace ||
      !gitignoreSanity?.isApplicable ||
      gitignoreSanity.missingEntries.length > 0 ||
      (gitignoreSanity?.isApplicable && gitignoreSanity.missingEntries.length === 0),
  );
  const isGitignoreSanityHealthy = Boolean(
    hasActiveWorkspace &&
      !isGitignoreSanityChecking &&
      !gitignoreSanityErrorMessage &&
      gitignoreSanity?.isApplicable &&
      gitignoreSanity.missingEntries.length === 0,
  );

  let gitignoreSanityLabel = "Checking .gitignore sanity...";
  if (!hasActiveWorkspace && !isGitignoreSanityChecking) {
    gitignoreSanityLabel = "No active workspace selected.";
  } else if (gitignoreSanityErrorMessage) {
    gitignoreSanityLabel = "Unable to check .gitignore sanity.";
  } else if (!isGitignoreSanityChecking) {
    if (!gitignoreSanity?.isApplicable) {
      gitignoreSanityLabel = "No .gitignore found in this directory.";
    } else if (gitignoreSanity.missingEntries.length > 0) {
      gitignoreSanityLabel = `Missing ${gitignoreSanity.missingEntries.join(" and ")} in .gitignore.`;
    } else {
      gitignoreSanityLabel = ".gitignore includes Groove entries.";
    }
  }

  return (
    <PageShell
      pageSidebar={({ collapsed }) => (
        <DiagnosticsSystemSidebar
          collapsed={collapsed}
          overview={systemOverview}
          isLoading={isLoadingSystemOverview}
          errorMessage={systemOverviewError}
          onRefresh={() => {
            void loadSystemOverview();
          }}
        />
      )}
    >
      <DiagnosticsHeader
        isLoadingProcessSnapshots={isLoadingOpencode || isLoadingNodeApps}
        hasLoadedProcessSnapshots={hasLoadedProcessSnapshots}
        isLoadingMostConsumingPrograms={isLoadingMostConsumingPrograms}
        isCleaningAllDevServers={isCleaningAllDevServers}
        onLoadProcessSnapshots={() => {
          void loadProcessSnapshots();
        }}
        onLoadMostConsumingPrograms={() => {
          void runGetMsotConsumingProgramsAction();
        }}
        onCleanAll={() => {
          void runCleanAllDevServersAction();
        }}
      />

      {shouldShowGitignoreSanityPanel ? (
        <div
          className={`rounded-md border px-3 py-2 ${
            isGitignoreSanityHealthy ? "border-emerald-700/30 bg-emerald-500/10" : "border-amber-700/30 bg-amber-500/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Groove sanity: {gitignoreSanityLabel}</p>
            {shouldShowApplyPatch ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void applyGitignoreSanityPatch();
                }}
                disabled={isGitignoreSanityChecking || isGitignoreSanityApplyPending}
              >
                {isGitignoreSanityApplyPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                <span>Apply Patch</span>
              </Button>
            ) : null}
          </div>
          {gitignoreSanityStatusMessage ? <p className="mt-1 text-xs text-emerald-700">{gitignoreSanityStatusMessage}</p> : null}
          {gitignoreSanityErrorMessage ? <p className="mt-1 text-xs text-destructive">{gitignoreSanityErrorMessage}</p> : null}
        </div>
      ) : null}

      {mostConsumingProgramsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{mostConsumingProgramsError}</p>
      )}

      {mostConsumingProgramsOutput && (
        <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2">
          <div className="mb-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setMostConsumingProgramsOutput(null);
              }}
              aria-label="Hide top processes"
            >
              <X aria-hidden="true" className="size-3.5" />
              <span>Hide</span>
            </Button>
          </div>
          <pre className="overflow-x-auto text-xs text-foreground">{mostConsumingProgramsOutput}</pre>
        </div>
      )}

      <NodeAppsCard
        nodeAppRows={nodeAppRows}
        pendingStopPids={pendingStopPids}
        hasLoadedSnapshots={hasLoadedProcessSnapshots}
        isLoadingNodeApps={isLoadingNodeApps}
        isCleaningAllDevServers={isCleaningAllDevServers}
        isClosingAllNodeInstances={isClosingAllNodeInstances}
        nodeAppsError={nodeAppsError}
        nodeAppsWarning={nodeAppsWarning}
        onRefresh={() => {
          void loadNodeAppRows();
        }}
        onCloseAllNodeInstances={() => {
          void runCloseAllNodeInstancesAction();
        }}
        onStopProcess={(pid) => {
          void runStopProcessAction(pid);
        }}
        onStopWorktreeProcesses={(worktree, pids) => {
          void runStopWorktreeProcessesAction(worktree, pids, "Node app");
        }}
      />

      <OpencodeInstancesCard
        opencodeRows={opencodeRows}
        pendingStopPids={pendingStopPids}
        hasLoadedSnapshots={hasLoadedProcessSnapshots}
        isLoadingOpencode={isLoadingOpencode}
        isClosingAll={isClosingAll}
        opencodeError={opencodeError}
        onRefresh={() => {
          void loadOpencodeRows();
        }}
        onCloseAll={() => {
          void runStopAllOpencodeAction();
        }}
        onStopProcess={(pid) => {
          void runStopProcessAction(pid);
        }}
        onStopWorktreeProcesses={(worktree, pids) => {
          void runStopWorktreeProcessesAction(worktree, pids, "OpenCode");
        }}
      />

      <EmergencyCard
        isKillingAllNonWorktreeOpencode={isKillingAllNonWorktreeOpencode}
        onKillAllNonWorktreeOpencode={() => {
          void runKillAllNonWorktreeOpencodeAction();
        }}
      />
    </PageShell>
  );
}
