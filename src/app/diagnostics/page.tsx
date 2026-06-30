"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ExternalLink,
  Hammer,
  Loader2,
  Octagon,
  OctagonPause,
  X,
} from "lucide-react";

import { DiagnosticsHeader } from "@/src/components/pages/diagnostics/diagnostics-header";
import { DiagnosticsSystemSidebar } from "@/src/components/pages/diagnostics/diagnostics-system-sidebar";
import { EmergencyCard } from "@/src/components/pages/diagnostics/emergency-card";
import { WorktreeStorageCard } from "@/src/components/pages/diagnostics/worktree-storage-card";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  READY_STATUS_CLASSES,
  PAUSED_STATUS_CLASSES,
} from "@/src/components/pages/barracks/constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { toast } from "@/src/lib/toast";
import { playGrooveHookSound } from "@/src/lib/groove-sound-system";
import { appendRequestId } from "@/src/lib/utils/common/request-id";
import {
  diagnosticsCleanAllDevServers,
  diagnosticsGetSystemOverview,
  diagnosticsGetMsotConsumingPrograms,
  diagnosticsKillAllNodeInstances,
  isTelemetryEnabled,
  workspaceMarkOnboardingConfigured,
  type DiagnosticsMostConsumingProgramsResponse,
  type DiagnosticsSystemOverview,
  type DiagnosticsSystemOverviewResponse,
  type DiagnosticsStopAllResponse,
  type WorkspaceGitignoreSanityResponse,
  type WorkspaceMeta,
  type WorkspaceTermSanityResponse,
  workspaceGitignoreSanityApply,
  workspaceGitignoreSanityCheck,
  workspaceTermSanityApply,
  workspaceTermSanityCheck,
} from "@/src/lib/ipc";
import {
  ensureWorkspaceContext,
  refreshWorkspaceContext,
} from "@/src/lib/workspace-store";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";

function logDiagnosticsTelemetry(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) {
    return;
  }
  console.info(`${UI_TELEMETRY_PREFIX} ${event}`, payload);
}

export default function DiagnosticsPage() {
  const navigate = useNavigate();
  const diagnosticsEnterPerfMsRef = useRef<number>(performance.now());
  const isSystemOverviewRequestInFlightRef = useRef(false);
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(
    null,
  );
  const [isKillingAllNodeInstances, setIsKillingAllNodeInstances] =
    useState(false);
  const [isCleaningAllDevServers, setIsCleaningAllDevServers] = useState(false);
  const [mostConsumingProgramsOutput, setMostConsumingProgramsOutput] =
    useState<string | null>(null);
  const [mostConsumingProgramsError, setMostConsumingProgramsError] = useState<
    string | null
  >(null);
  const [isLoadingMostConsumingPrograms, setIsLoadingMostConsumingPrograms] =
    useState(false);
  const [systemOverview, setSystemOverview] =
    useState<DiagnosticsSystemOverview | null>(null);
  const [systemOverviewError, setSystemOverviewError] = useState<string | null>(
    null,
  );
  const [isLoadingSystemOverview, setIsLoadingSystemOverview] = useState(false);
  const [hasActiveWorkspace, setHasActiveWorkspace] = useState(false);
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
  const [termSanity, setTermSanity] =
    useState<WorkspaceTermSanityResponse | null>(null);
  const [termSanityStatusMessage, setTermSanityStatusMessage] = useState<
    string | null
  >(null);
  const [termSanityErrorMessage, setTermSanityErrorMessage] = useState<
    string | null
  >(null);
  const [isTermSanityChecking, setIsTermSanityChecking] = useState(false);
  const [isTermSanityApplyPending, setIsTermSanityApplyPending] =
    useState(false);

  const clearGitignoreSanityState = useCallback((): void => {
    setHasActiveWorkspace(false);
    setGitignoreSanity(null);
    setGitignoreSanityStatusMessage(null);
    setGitignoreSanityErrorMessage(null);
    setIsGitignoreSanityChecking(false);
    setIsGitignoreSanityApplyPending(false);
  }, []);

  const loadGitignoreSanityCheck = useCallback(
    async (options?: {
      showPending?: boolean;
      clearStatusMessage?: boolean;
    }): Promise<void> => {
      const showPending = options?.showPending !== false;

      try {
        if (showPending) {
          setIsGitignoreSanityChecking(true);
        }
        if (options?.clearStatusMessage) {
          setGitignoreSanityStatusMessage(null);
        }

        const workspace = await ensureWorkspaceContext();
        if (!workspace || !workspace.ok || !workspace.workspaceRoot) {
          clearGitignoreSanityState();
          setWorkspaceMeta(null);
          return;
        }

        setHasActiveWorkspace(true);
        setWorkspaceMeta(workspace.workspaceMeta ?? null);
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
    [clearGitignoreSanityState],
  );

  const applyGitignoreSanityPatch = useCallback(async (): Promise<void> => {
    try {
      setIsGitignoreSanityApplyPending(true);
      setGitignoreSanityStatusMessage(null);
      setGitignoreSanityErrorMessage(null);

      const workspace = await refreshWorkspaceContext();
      if (!workspace.ok || !workspace.workspaceRoot) {
        clearGitignoreSanityState();
        return;
      }

      setHasActiveWorkspace(true);
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
  }, [clearGitignoreSanityState]);

  const loadTermSanityCheck = useCallback(
    async (options?: {
      showPending?: boolean;
      clearStatusMessage?: boolean;
    }): Promise<void> => {
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
          setTermSanityErrorMessage(
            result.error ?? "Failed to check TERM sanity.",
          );
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
    },
    [],
  );

  const applyTermSanityPatch = useCallback(async (): Promise<void> => {
    try {
      setIsTermSanityApplyPending(true);
      setTermSanityStatusMessage(null);
      setTermSanityErrorMessage(null);

      const result = await workspaceTermSanityApply();
      if (!result.ok) {
        setTermSanityErrorMessage(
          result.error ?? "Failed to apply TERM sanity patch.",
        );
        return;
      }

      setTermSanity(result);
      if (result.applied) {
        const fixedValue =
          result.fixedValue ?? result.termValue ?? "xterm-256color";
        setTermSanityStatusMessage(
          `Applied TERM sanity patch (TERM=${fixedValue}).`,
        );
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
    const mountDurationMs = Math.max(
      0,
      performance.now() - diagnosticsEnterPerfMsRef.current,
    );
    logDiagnosticsTelemetry("diagnostics.enter.mount", {
      duration_ms: Number(mountDurationMs.toFixed(2)),
    });

    let rafFrameId = 0;
    let rafNestedFrameId = 0;
    rafFrameId = requestAnimationFrame(() => {
      rafNestedFrameId = requestAnimationFrame(() => {
        const afterPaintDurationMs = Math.max(
          0,
          performance.now() - diagnosticsEnterPerfMsRef.current,
        );
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

  const loadSystemOverview = useCallback(
    async (showLoading = true): Promise<void> => {
      if (isSystemOverviewRequestInFlightRef.current) {
        return;
      }

      isSystemOverviewRequestInFlightRef.current = true;
      if (showLoading) {
        setIsLoadingSystemOverview(true);
      }
      setSystemOverviewError(null);

      try {
        const result =
          (await diagnosticsGetSystemOverview()) as DiagnosticsSystemOverviewResponse;
        if (!result.ok || !result.overview) {
          setSystemOverview(null);
          setSystemOverviewError(
            result.error ?? "Failed to load system usage.",
          );
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
    },
    [],
  );

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
      const result =
        (await diagnosticsCleanAllDevServers()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Clean all failed.", {
          description: appendRequestId(result.error, result.requestId),
          command: "diagnostics_clean_all_dev_servers",
        });
      } else {
        playGrooveHookSound("emergency");
        toast.success("Clean all completed for worktree Node processes.", {
          description: appendRequestId(
            `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
            result.requestId,
          ),
          command: "diagnostics_clean_all_dev_servers",
        });
      }
    } catch {
      toast.error("Clean-all request failed.", {
        command: "diagnostics_clean_all_dev_servers",
      });
    } finally {
      setIsCleaningAllDevServers(false);
    }
  };

  const runKillAllNodeInstancesAction = async (): Promise<void> => {
    setIsKillingAllNodeInstances(true);

    try {
      const result =
        (await diagnosticsKillAllNodeInstances()) as DiagnosticsStopAllResponse;
      if (!result.ok) {
        toast.error("Failed to kill all Node processes.", {
          description: appendRequestId(result.error, result.requestId),
          command: "diagnostics_kill_all_node_instances",
        });
        return;
      }

      playGrooveHookSound("emergency");
      toast.success("Emergency kill completed for all Node processes.", {
        description: appendRequestId(
          `attempted=${String(result.attempted)}, stopped=${String(result.stopped)}, alreadyStopped=${String(result.alreadyStopped)}, failed=${String(result.failed)}`,
          result.requestId,
        ),
        command: "diagnostics_kill_all_node_instances",
      });
    } catch {
      toast.error("Emergency kill request failed.", {
        command: "diagnostics_kill_all_node_instances",
      });
    } finally {
      setIsKillingAllNodeInstances(false);
    }
  };

  const runGetMsotConsumingProgramsAction = async (): Promise<void> => {
    setIsLoadingMostConsumingPrograms(true);
    setMostConsumingProgramsError(null);

    try {
      const result =
        (await diagnosticsGetMsotConsumingPrograms()) as DiagnosticsMostConsumingProgramsResponse;
      if (!result.ok) {
        setMostConsumingProgramsOutput(null);
        const message =
          appendRequestId(
            result.error ?? "Failed to run memory usage query.",
            result.requestId,
          ) ?? "Failed to run memory usage query.";
        setMostConsumingProgramsError(message);
        toast.error("Failed to load top processes.", {
          description: message,
          command: "diagnostics_get_msot_consuming_programs",
        });
        return;
      }

      setMostConsumingProgramsOutput(result.output || "No output.");
      toast.success("Loaded top processes.", {
        command: "diagnostics_get_msot_consuming_programs",
      });
    } catch {
      setMostConsumingProgramsOutput(null);
      setMostConsumingProgramsError("Failed to run memory usage query.");
      toast.error("Failed to load top processes.", {
        command: "diagnostics_get_msot_consuming_programs",
      });
    } finally {
      setIsLoadingMostConsumingPrograms(false);
    }
  };

  const shouldShowApplyPatch = Boolean(
    hasActiveWorkspace &&
    gitignoreSanity?.isApplicable &&
    gitignoreSanity.missingEntries.length > 0,
  );
  const shouldShowGitignoreSanityPanel = Boolean(
    isGitignoreSanityChecking ||
    gitignoreSanityErrorMessage ||
    !hasActiveWorkspace ||
    !gitignoreSanity?.isApplicable ||
    gitignoreSanity.missingEntries.length > 0 ||
    (gitignoreSanity?.isApplicable &&
      gitignoreSanity.missingEntries.length === 0),
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
  const isGitignoreApplyNowDisabled =
    isGitignoreSanityChecking ||
    isGitignoreSanityApplyPending ||
    !gitignoreNeedsRepair;
  const isTermApplyNowDisabled =
    isTermSanityChecking || isTermSanityApplyPending || !termNeedsRepair;
  const isTermSanityHealthy = Boolean(
    !isTermSanityChecking && !termSanityErrorMessage && termSanity?.isUsable,
  );
  const gitignoreApplyButtonLabel =
    "Apply fix for .gitignore includes Groove entries";
  const termApplyButtonLabel = "Apply fix for TERM environment variable";

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

  let termSanityLabel = "Checking TERM environment variable...";
  if (termSanityErrorMessage) {
    termSanityLabel = "Unable to verify the TERM variable.";
  } else if (!isTermSanityChecking) {
    if (termSanity?.isUsable) {
      termSanityLabel = "TERM resolves to a valid terminfo entry.";
    } else if (termSanity?.termValue) {
      termSanityLabel = `TERM does not resolve to a valid terminfo entry.`;
    } else {
      termSanityLabel = "TERM is not set, terminal sessions may render incorrectly.";
    }
  }

  const diagnosticsPageSidebar = useCallback(
    ({ collapsed }: { collapsed: boolean }) => (
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
    [systemOverview, isLoadingSystemOverview, systemOverviewError, loadSystemOverview],
  );

  useAppLayout({
    pageSidebar: diagnosticsPageSidebar,
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

      {(shouldShowGitignoreSanityPanel || hasActiveWorkspace) && (
        <div
          role="region"
          aria-label="Setup checks"
          className="overflow-hidden rounded-lg border bg-card"
        >
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasActiveWorkspace && (
                  <>
                    <TableRow className="bg-muted/25">
                      <TableCell
                        colSpan={4}
                        className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Workspace checks
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        Symlink configuration
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            workspaceMeta?.onboardingSymlinksConfigured
                              ? READY_STATUS_CLASSES
                              : PAUSED_STATUS_CLASSES
                          }
                        >
                          {workspaceMeta?.onboardingSymlinksConfigured ? (
                            <Octagon aria-hidden="true" />
                          ) : (
                            <OctagonPause aria-hidden="true" />
                          )}
                          {workspaceMeta?.onboardingSymlinksConfigured
                            ? "configured"
                            : "not configured"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">
                        {workspaceMeta?.onboardingSymlinksConfigured
                          ? "Worktree symlink paths have been reviewed."
                          : "Review which paths should be symlinked into new worktrees."}
                      </TableCell>
                      <TableCell className="text-right">
                        {workspaceMeta?.onboardingSymlinksConfigured ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled
                            aria-label="Symlink configuration reviewed"
                            className="size-8 p-0"
                          >
                            <Hammer aria-hidden="true" className="size-4" />
                          </Button>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    navigate("/workspace/settings");
                                  }}
                                  aria-label="Go to symlink settings"
                                  className="size-8 p-0"
                                >
                                  <ExternalLink
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Go to symlink settings
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="size-8 p-0"
                                  aria-label="Mark symlink configuration as reviewed"
                                  onClick={() => {
                                    void workspaceMarkOnboardingConfigured({
                                      symlinksConfigured: true,
                                    }).then((res) => {
                                      if (res.ok && res.workspaceMeta) {
                                        setWorkspaceMeta(res.workspaceMeta);
                                      }
                                    });
                                  }}
                                >
                                  <Check
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Mark as reviewed
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        Workspace commands
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            workspaceMeta?.onboardingCommandsConfigured
                              ? READY_STATUS_CLASSES
                              : PAUSED_STATUS_CLASSES
                          }
                        >
                          {workspaceMeta?.onboardingCommandsConfigured ? (
                            <Octagon aria-hidden="true" />
                          ) : (
                            <OctagonPause aria-hidden="true" />
                          )}
                          {workspaceMeta?.onboardingCommandsConfigured
                            ? "configured"
                            : "not configured"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">
                        {workspaceMeta?.onboardingCommandsConfigured
                          ? "Workspace commands have been reviewed."
                          : "Review Play Groove and Open Terminal commands."}
                      </TableCell>
                      <TableCell className="text-right">
                        {workspaceMeta?.onboardingCommandsConfigured ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled
                            aria-label="Workspace commands reviewed"
                            className="size-8 p-0"
                          >
                            <Hammer aria-hidden="true" className="size-4" />
                          </Button>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    navigate("/workspace/settings");
                                  }}
                                  aria-label="Go to workspace command settings"
                                  className="size-8 p-0"
                                >
                                  <ExternalLink
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Go to workspace command settings
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="size-8 p-0"
                                  aria-label="Mark workspace commands as reviewed"
                                  onClick={() => {
                                    void workspaceMarkOnboardingConfigured({
                                      commandsConfigured: true,
                                    }).then((res) => {
                                      if (res.ok && res.workspaceMeta) {
                                        setWorkspaceMeta(res.workspaceMeta);
                                      }
                                    });
                                  }}
                                >
                                  <Check
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Mark as reviewed
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  </>
                )}

                {shouldShowGitignoreSanityPanel && (
                  <>
                    <TableRow className="bg-muted/25">
                      <TableCell
                        colSpan={4}
                        className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Global checks
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        .gitignore includes Groove entries
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isGitignoreSanityHealthy
                              ? READY_STATUS_CLASSES
                              : PAUSED_STATUS_CLASSES
                          }
                        >
                          {isGitignoreSanityHealthy ? (
                            <Octagon aria-hidden="true" />
                          ) : (
                            <OctagonPause aria-hidden="true" />
                          )}
                          {isGitignoreSanityHealthy
                            ? "healthy"
                            : "needs attention"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">
                        {gitignoreSanityLabel}
                      </TableCell>
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
                          {isGitignoreSanityApplyPending ? (
                            <Loader2
                              aria-hidden="true"
                              className="size-4 animate-spin"
                            />
                          ) : (
                            <Hammer aria-hidden="true" className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        TERM environment variable
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isTermSanityHealthy
                              ? READY_STATUS_CLASSES
                              : PAUSED_STATUS_CLASSES
                          }
                        >
                          {isTermSanityHealthy ? (
                            <Octagon aria-hidden="true" />
                          ) : (
                            <OctagonPause aria-hidden="true" />
                          )}
                          {isTermSanityHealthy
                            ? "healthy"
                            : "needs attention"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">
                        {termSanityLabel}
                      </TableCell>
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
                          {isTermSanityApplyPending ? (
                            <Loader2
                              aria-hidden="true"
                              className="size-4 animate-spin"
                            />
                          ) : (
                            <Hammer aria-hidden="true" className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
          {gitignoreSanityStatusMessage ? (
            <p className="px-3 py-1 text-xs text-emerald-700">
              {gitignoreSanityStatusMessage}
            </p>
          ) : null}
          {gitignoreSanityErrorMessage ? (
            <p className="px-3 py-1 text-xs text-destructive">
              {gitignoreSanityErrorMessage}
            </p>
          ) : null}
          {termSanityStatusMessage ? (
            <p className="px-3 py-1 text-xs text-emerald-700">
              {termSanityStatusMessage}
            </p>
          ) : null}
          {termSanityErrorMessage ? (
            <p className="px-3 py-1 text-xs text-destructive">
              {termSanityErrorMessage}
            </p>
          ) : null}
        </div>
      )}

      {mostConsumingProgramsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mostConsumingProgramsError}
        </p>
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
          <pre className="overflow-x-auto text-xs text-foreground">
            {mostConsumingProgramsOutput}
          </pre>
        </div>
      )}

      {hasActiveWorkspace && (
        <WorktreeStorageCard workspaceMeta={workspaceMeta} />
      )}

      <EmergencyCard
        isKillingAllNodeInstances={isKillingAllNodeInstances}
        onKillAllNodeInstances={() => {
          void runKillAllNodeInstancesAction();
        }}
      />
    </div>
  );
}
