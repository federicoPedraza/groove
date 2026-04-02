"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hammer, Loader2, X } from "lucide-react";

import { DiagnosticsHeader } from "@/components/pages/diagnostics/diagnostics-header";
import { DiagnosticsSystemSidebar } from "@/components/pages/diagnostics/diagnostics-system-sidebar";
import { EmergencyCard } from "@/components/pages/diagnostics/emergency-card";
import { useAppLayout } from "@/components/pages/use-app-layout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { appendRequestId } from "@/lib/utils/common/request-id";
import {
  diagnosticsCleanAllDevServers,
  diagnosticsGetSystemOverview,
  diagnosticsGetMsotConsumingPrograms,
  diagnosticsKillAllNodeAndOpencodeInstances,
  isTelemetryEnabled,
  type DiagnosticsMostConsumingProgramsResponse,
  type DiagnosticsSystemOverview,
  type DiagnosticsSystemOverviewResponse,
  type DiagnosticsStopAllResponse,
  type WorkspaceGitignoreSanityResponse,
  type WorkspaceTermSanityResponse,
  workspaceGetActive,
  workspaceGitignoreSanityApply,
  workspaceGitignoreSanityCheck,
  workspaceTermSanityApply,
  workspaceTermSanityCheck,
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
  const [isKillingAllNodeAndOpencodeInstances, setIsKillingAllNodeAndOpencodeInstances] = useState(false);
  const [isCleaningAllDevServers, setIsCleaningAllDevServers] = useState(false);
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
  const [termSanity, setTermSanity] = useState<WorkspaceTermSanityResponse | null>(null);
  const [termSanityStatusMessage, setTermSanityStatusMessage] = useState<string | null>(null);
  const [termSanityErrorMessage, setTermSanityErrorMessage] = useState<string | null>(null);
  const [isTermSanityChecking, setIsTermSanityChecking] = useState(false);
  const [isTermSanityApplyPending, setIsTermSanityApplyPending] = useState(false);

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
        if (result.patchedWorktree) {
          setGitignoreSanityStatusMessage(
            `Applied Groove .gitignore sanity patch in ${result.patchedWorktree} and started Play Groove.`,
          );
        } else {
          setGitignoreSanityStatusMessage("Applied Groove .gitignore sanity patch.");
        }
      } else {
        setGitignoreSanityStatusMessage("Groove .gitignore sanity patch is already applied.");
      }
    } catch {
      setGitignoreSanityErrorMessage("Failed to apply .gitignore sanity patch.");
    } finally {
      setIsGitignoreSanityApplyPending(false);
    }
  }, [clearGitignoreSanityState]);

  const loadTermSanityCheck = useCallback(async (options?: { showPending?: boolean; clearStatusMessage?: boolean }): Promise<void> => {
    const showPending = options?.showPending !== false;

    try {
      if (showPending) {
        setIsTermSanityChecking(true);
      }
      if (options?.clearStatusMessage) {
        setTermSanityStatusMessage(null);
      }

      const result = await workspaceTermSanityCheck();
      if (!result.ok) {
        setTermSanity(null);
        setTermSanityErrorMessage(result.error ?? "Failed to check TERM sanity.");
        return;
      }

      setTermSanity(result);
      setTermSanityErrorMessage(null);
    } catch {
      setTermSanity(null);
      setTermSanityErrorMessage("Failed to check TERM sanity.");
    } finally {
      if (showPending) {
        setIsTermSanityChecking(false);
      }
    }
  }, []);

  const applyTermSanityPatch = useCallback(async (): Promise<void> => {
    try {
      setIsTermSanityApplyPending(true);
      setTermSanityStatusMessage(null);
      setTermSanityErrorMessage(null);

      const result = await workspaceTermSanityApply();
      if (!result.ok) {
        setTermSanityErrorMessage(result.error ?? "Failed to apply TERM sanity patch.");
        return;
      }

      setTermSanity(result);
      if (result.applied) {
        const fixedValue = result.fixedValue ?? result.termValue ?? "xterm-256color";
        setTermSanityStatusMessage(`Applied TERM sanity patch (TERM=${fixedValue}).`);
      } else {
        setTermSanityStatusMessage("TERM sanity patch is already applied.");
      }
    } catch {
      setTermSanityErrorMessage("Failed to apply TERM sanity patch.");
    } finally {
      setIsTermSanityApplyPending(false);
    }
  }, []);

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

  useEffect(() => {
    void loadTermSanityCheck({ clearStatusMessage: true });
  }, [loadTermSanityCheck]);

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

    } catch {
      toast.error("Clean-all request failed.");
    } finally {
      setIsCleaningAllDevServers(false);
    }
  };

  const runKillAllNodeAndOpencodeInstancesAction = async (): Promise<void> => {
    setIsKillingAllNodeAndOpencodeInstances(true);

    try {
      const result = (await diagnosticsKillAllNodeAndOpencodeInstances()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Failed to kill all Node and OpenCode processes.", {
          description: appendRequestId(result.error, result.requestId),
        });
        return;
      }

      toast.success("Emergency kill completed for all Node and OpenCode processes.", {
        description: appendRequestId(
          `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
          result.requestId,
        ),
      });
    } catch {
      toast.error("Emergency kill request failed.");
    } finally {
      setIsKillingAllNodeAndOpencodeInstances(false);
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
  const shouldShowApplyTermPatch = Boolean(termSanity && !termSanity.isUsable);
  const gitignoreNeedsRepair = shouldShowApplyPatch;
  const termNeedsRepair = shouldShowApplyTermPatch;
  const isGitignoreApplyNowDisabled = isGitignoreSanityChecking || isGitignoreSanityApplyPending || !gitignoreNeedsRepair;
  const isTermApplyNowDisabled = isTermSanityChecking || isTermSanityApplyPending || !termNeedsRepair;
  const isTermSanityHealthy = Boolean(
    !isTermSanityChecking &&
      !termSanityErrorMessage &&
      termSanity?.isUsable,
  );
  const gitignoreApplyButtonLabel = "Apply fix for .gitignore includes Groove entries";
  const termApplyButtonLabel = "Apply fix for TERM is missing or unusable";

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

  let termSanityLabel = "Checking TERM sanity...";
  if (termSanityErrorMessage) {
    termSanityLabel = "Unable to check TERM sanity.";
  } else if (!isTermSanityChecking) {
    const termValueLabel = termSanity?.termValue ? ` (${termSanity.termValue})` : "";
    if (termSanity?.isUsable) {
      termSanityLabel = `TERM is usable${termValueLabel}.`;
    } else {
      termSanityLabel = `TERM is missing or unusable${termValueLabel}.`;
    }
  }

  useAppLayout({
    pageSidebar: ({ collapsed }) => (
      <DiagnosticsSystemSidebar
        collapsed={collapsed}
        overview={systemOverview}
        isLoading={isLoadingSystemOverview}
        errorMessage={systemOverviewError}
        onRefresh={() => {
          void loadSystemOverview();
        }}
      />
    ),
  });

  return (
    <div className="space-y-3">
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

      {shouldShowGitignoreSanityPanel ? (
        <div role="region" aria-label="Groove sanity checks table" className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Check</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className={`hover:bg-transparent ${gitignoreNeedsRepair ? "bg-amber-500/10" : ""}`}>
                <TableCell className="font-medium">.gitignore includes Groove entries</TableCell>
                <TableCell>{isGitignoreSanityHealthy ? "Healthy" : "Needs attention"}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">{gitignoreSanityLabel}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void applyGitignoreSanityPatch();
                    }}
                    disabled={isGitignoreApplyNowDisabled}
                    aria-label={gitignoreApplyButtonLabel}
                    title={gitignoreApplyButtonLabel}
                    className="size-8 p-0"
                  >
                    {isGitignoreSanityApplyPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Hammer aria-hidden="true" className="size-4" />}
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow className={`hover:bg-transparent ${termNeedsRepair ? "bg-amber-500/10" : ""}`}>
                <TableCell className="font-medium">TERM is missing or unusable</TableCell>
                <TableCell>{isTermSanityHealthy ? "Healthy" : "Needs attention"}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">{termSanityLabel}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void applyTermSanityPatch();
                    }}
                    disabled={isTermApplyNowDisabled}
                    aria-label={termApplyButtonLabel}
                    title={termApplyButtonLabel}
                    className="size-8 p-0"
                  >
                    {isTermSanityApplyPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Hammer aria-hidden="true" className="size-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {gitignoreSanityStatusMessage ? <p className="mt-1 text-xs text-emerald-700">{gitignoreSanityStatusMessage}</p> : null}
          {gitignoreSanityErrorMessage ? <p className="mt-1 text-xs text-destructive">{gitignoreSanityErrorMessage}</p> : null}
          {termSanityStatusMessage ? <p className="mt-1 text-xs text-emerald-700">{termSanityStatusMessage}</p> : null}
          {termSanityErrorMessage ? <p className="mt-1 text-xs text-destructive">{termSanityErrorMessage}</p> : null}
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

      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={isKillingAllNodeAndOpencodeInstances}
        onKillAllNodeAndOpencodeInstances={() => {
          void runKillAllNodeAndOpencodeInstancesAction();
        }}
      />
    </div>
  );
}
