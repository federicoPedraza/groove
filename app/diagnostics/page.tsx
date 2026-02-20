"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DiagnosticsHeader } from "@/components/pages/diagnostics/diagnostics-header";
import { NodeAppsCard } from "@/components/pages/diagnostics/node-apps-card";
import { OpencodeInstancesCard } from "@/components/pages/diagnostics/opencode-instances-card";
import { PageShell } from "@/components/pages/page-shell";
import { appendRequestId } from "@/lib/utils/common/request-id";
import {
  diagnosticsCleanAllDevServers,
  diagnosticsGetMsotConsumingPrograms,
  diagnosticsListOpencodeInstances,
  diagnosticsListWorktreeNodeApps,
  type DiagnosticsMostConsumingProgramsResponse,
  diagnosticsStopAllOpencodeInstances,
  diagnosticsStopProcess,
  type DiagnosticsNodeAppRow,
  type DiagnosticsNodeAppsResponse,
  type DiagnosticsProcessRow,
  type DiagnosticsStopAllResponse,
  type DiagnosticsStopResponse,
} from "@/src/lib/ipc";

export default function DiagnosticsPage() {
  const [opencodeRows, setOpencodeRows] = useState<DiagnosticsProcessRow[]>([]);
  const [nodeAppRows, setNodeAppRows] = useState<DiagnosticsNodeAppRow[]>([]);
  const [isLoadingOpencode, setIsLoadingOpencode] = useState(true);
  const [isLoadingNodeApps, setIsLoadingNodeApps] = useState(true);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [isCleaningAllDevServers, setIsCleaningAllDevServers] = useState(false);
  const [pendingStopPids, setPendingStopPids] = useState<number[]>([]);
  const [opencodeError, setOpencodeError] = useState<string | null>(null);
  const [nodeAppsError, setNodeAppsError] = useState<string | null>(null);
  const [nodeAppsWarning, setNodeAppsWarning] = useState<string | null>(null);
  const [mostConsumingProgramsOutput, setMostConsumingProgramsOutput] = useState<string | null>(null);
  const [mostConsumingProgramsError, setMostConsumingProgramsError] = useState<string | null>(null);
  const [isLoadingMostConsumingPrograms, setIsLoadingMostConsumingPrograms] = useState(false);

  const loadOpencodeRows = useCallback(async (showLoading = true): Promise<DiagnosticsProcessRow[]> => {
    if (showLoading) {
      setIsLoadingOpencode(true);
    }
    setOpencodeError(null);

    try {
      const result = await diagnosticsListOpencodeInstances();
      if (!result.ok) {
        setOpencodeRows([]);
        setOpencodeError(result.error ?? "Failed to load OpenCode processes.");
        return [];
      }
      setOpencodeRows(result.rows);
      return result.rows;
    } catch {
      setOpencodeRows([]);
      setOpencodeError("Failed to load OpenCode processes.");
      return [];
    } finally {
      if (showLoading) {
        setIsLoadingOpencode(false);
      }
    }
  }, []);

  const loadNodeAppRows = useCallback(async (showLoading = true): Promise<DiagnosticsNodeAppRow[]> => {
    if (showLoading) {
      setIsLoadingNodeApps(true);
    }
    setNodeAppsError(null);

    try {
      const result = (await diagnosticsListWorktreeNodeApps()) as DiagnosticsNodeAppsResponse;
      if (!result.ok) {
        setNodeAppRows([]);
        setNodeAppsWarning(null);
        setNodeAppsError(result.error ?? "Failed to load worktree node apps.");
        return [];
      }

      setNodeAppRows(result.rows);
      setNodeAppsWarning(result.warning ?? null);
      return result.rows;
    } catch {
      setNodeAppRows([]);
      setNodeAppsWarning(null);
      setNodeAppsError("Failed to load worktree node apps.");
      return [];
    } finally {
      if (showLoading) {
        setIsLoadingNodeApps(false);
      }
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadOpencodeRows(), loadNodeAppRows()]);
  }, [loadOpencodeRows, loadNodeAppRows]);

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

  const runStopAllOpencodeAction = async (): Promise<void> => {
    setIsClosingAll(true);

    try {
      const result = (await diagnosticsStopAllOpencodeInstances()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Failed to stop all OpenCode instances.", {
          description: appendRequestId(result.error, result.requestId),
        });
        return;
      }

      toast.success("OpenCode stop-all completed.", {
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
        toast.error("Some OpenCode instances are still running after stop-all.");
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
        toast.success("Clean all completed for OpenCode + worktree Node processes.", {
          description: appendRequestId(
            `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
            result.requestId,
          ),
        });
      }

      const [nextOpencodeRows, nextNodeApps] = await Promise.all([loadOpencodeRows(false), loadNodeAppRows(false)]);
      if (nextOpencodeRows.length > 0 || nextNodeApps.length > 0) {
        toast.error("Some OpenCode or worktree Node processes are still running after clean all.");
      }
    } catch {
      toast.error("Clean-all request failed.");
    } finally {
      setIsCleaningAllDevServers(false);
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

  return (
    <PageShell>
      <DiagnosticsHeader
        isLoadingMostConsumingPrograms={isLoadingMostConsumingPrograms}
        isCleaningAllDevServers={isCleaningAllDevServers}
        onLoadMostConsumingPrograms={() => {
          void runGetMsotConsumingProgramsAction();
        }}
        onCleanAll={() => {
          void runCleanAllDevServersAction();
        }}
      />

      {mostConsumingProgramsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{mostConsumingProgramsError}</p>
      )}

      {mostConsumingProgramsOutput && (
        <pre className="overflow-x-auto rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-foreground">{mostConsumingProgramsOutput}</pre>
      )}

      <NodeAppsCard
        nodeAppRows={nodeAppRows}
        pendingStopPids={pendingStopPids}
        isLoadingNodeApps={isLoadingNodeApps}
        isCleaningAllDevServers={isCleaningAllDevServers}
        nodeAppsError={nodeAppsError}
        nodeAppsWarning={nodeAppsWarning}
        onRefresh={() => {
          void loadNodeAppRows();
        }}
        onStopProcess={(pid) => {
          void runStopProcessAction(pid);
        }}
      />

      <OpencodeInstancesCard
        opencodeRows={opencodeRows}
        pendingStopPids={pendingStopPids}
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
      />
    </PageShell>
  );
}
