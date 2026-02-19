"use client";

import { useCallback, useEffect, useState } from "react";
import { BrushCleaning, CircleStop, Loader2, OctagonX, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AppNavigation } from "@/components/app-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function appendRequestId(message: string | undefined, requestId: string | undefined): string | undefined {
  if (!requestId) {
    return message;
  }
  if (!message || message.trim().length === 0) {
    return `requestId: ${requestId}`;
  }
  return `${message} (requestId: ${requestId})`;
}

const SOFT_RED_BUTTON_CLASSES = "bg-rose-600 text-white hover:bg-rose-500 [&_svg]:text-white";

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
        toast.error("Failed to get msot consuming programs.", {
          description: message,
        });
        return;
      }

      setMostConsumingProgramsOutput(result.output || "No output.");
      toast.success("Loaded msot consuming programs.");
    } catch {
      setMostConsumingProgramsOutput(null);
      setMostConsumingProgramsError("Failed to run memory usage query.");
      toast.error("Failed to get msot consuming programs.");
    } finally {
      setIsLoadingMostConsumingPrograms(false);
    }
  };

  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation />

        <div className="min-w-0 flex-1 space-y-4">
          <header className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Diagnostics</h1>
                <p className="text-sm text-muted-foreground">Inspect and stop local processes that can interfere with Groove workflows.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void runGetMsotConsumingProgramsAction();
                  }}
                  disabled={isLoadingMostConsumingPrograms}
                >
                  {isLoadingMostConsumingPrograms ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                  <span>get msot consuming programs</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className={SOFT_RED_BUTTON_CLASSES}
                  onClick={() => {
                    void runCleanAllDevServersAction();
                  }}
                  disabled={isCleaningAllDevServers}
                >
                  {isCleaningAllDevServers ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <BrushCleaning aria-hidden="true" className="size-4" />}
                  <span>Clean all</span>
                </Button>
              </div>
            </div>
          </header>

          {mostConsumingProgramsError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{mostConsumingProgramsError}</p>
          )}

          {mostConsumingProgramsOutput && (
            <pre className="overflow-x-auto rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-foreground">{mostConsumingProgramsOutput}</pre>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle>Current Node Apps Running</CardTitle>
                  <CardDescription>
                    Worktree process view for likely Node commands that include <code>.worktree/</code> or <code>.worktrees/</code> paths.
                  </CardDescription>
                  {nodeAppRows.length > 0 && (
                    <CardDescription>
                      Running in worktrees: <span className="font-medium text-foreground">{String(nodeAppRows.length)}</span>
                    </CardDescription>
                  )}
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadNodeAppRows()} disabled={isLoadingNodeApps || isCleaningAllDevServers}>
                  {isLoadingNodeApps ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                  <span>Refresh</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {nodeAppsWarning && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{nodeAppsWarning}</p>
              )}

              {nodeAppsError && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{nodeAppsError}</p>
              )}

              {!nodeAppsError && nodeAppRows.length === 0 && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  {isLoadingNodeApps ? "Scanning worktree node apps..." : "No matching node apps are currently running in worktrees."}
                </p>
              )}

              {nodeAppRows.length > 0 && (
                <div className="rounded-lg border" role="region" aria-label="Current node apps running table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PID</TableHead>
                        <TableHead>PPID</TableHead>
                        <TableHead>Command</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nodeAppRows.map((row) => {
                        const isPending = pendingStopPids.includes(row.pid) || isCleaningAllDevServers;
                        return (
                          <TableRow key={`${row.pid}:${row.ppid}:${row.cmd}`}>
                            <TableCell className="font-mono text-xs">{String(row.pid)}</TableCell>
                            <TableCell className="font-mono text-xs">{String(row.ppid)}</TableCell>
                            <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={row.cmd}>
                              {row.cmd}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    void runStopProcessAction(row.pid);
                                  }}
                                  disabled={isPending}
                                >
                                  {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CircleStop aria-hidden="true" className="size-4" />}
                                  <span>Stop</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle>OpenCode Instances</CardTitle>
                  <CardDescription>Running OpenCode processes detected on this device.</CardDescription>
                  {opencodeRows.length > 0 && (
                    <CardDescription>
                      OpenCode instances: <span className="font-medium text-foreground">{String(opencodeRows.length)}</span>
                    </CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadOpencodeRows()} disabled={isLoadingOpencode || isClosingAll}>
                    {isLoadingOpencode ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                    <span>Refresh</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className={SOFT_RED_BUTTON_CLASSES}
                    onClick={() => {
                      void runStopAllOpencodeAction();
                    }}
                    disabled={isLoadingOpencode || isClosingAll || opencodeRows.length === 0}
                  >
                    {isClosingAll ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
                    <span>Close all</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {opencodeError && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{opencodeError}</p>
              )}

              {!opencodeError && opencodeRows.length === 0 && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  {isLoadingOpencode ? "Checking for OpenCode processes..." : "No running OpenCode processes found."}
                </p>
              )}

              {opencodeRows.length > 0 && (
                <div className="rounded-lg border" role="region" aria-label="OpenCode process table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PID</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead>Command</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opencodeRows.map((row) => {
                        const isPending = pendingStopPids.includes(row.pid) || isClosingAll;
                        return (
                          <TableRow key={`${row.pid}:${row.command}`}>
                            <TableCell className="font-mono text-xs">{String(row.pid)}</TableCell>
                            <TableCell>{row.processName}</TableCell>
                            <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={row.command}>
                              {row.command}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    void runStopProcessAction(row.pid);
                                  }}
                                  disabled={isPending}
                                >
                                  {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
                                  <span>Close</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </main>
  );
}
