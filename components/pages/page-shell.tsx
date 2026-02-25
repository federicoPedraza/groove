"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppNavigation } from "@/components/app-navigation";
import { DiagnosticsSystemSidebar } from "@/components/pages/diagnostics/diagnostics-system-sidebar";
import { Button } from "@/components/ui/button";
import { HelpModal } from "@/components/pages/help/help-modal";
import { toast } from "@/lib/toast";
import {
  diagnosticsGetSystemOverview,
  isAlwaysShowDiagnosticsSidebarEnabled,
  grooveBinRepair,
  grooveBinStatus,
  isShowFpsEnabled,
  isTelemetryEnabled,
  listenWorkspaceChange,
  listenWorkspaceReady,
  subscribeToGlobalSettings,
  workspaceGetActive,
  workspaceGitignoreSanityCheck,
  type DiagnosticsSystemOverview,
  type DiagnosticsSystemOverviewResponse,
  type GrooveBinCheckStatus,
} from "@/src/lib/ipc";

const RECENT_DIRECTORIES_STORAGE_KEY = "groove:recent-directories";
const MAX_RECENT_DIRECTORIES = 5;

type PageShellProps = {
  children: ReactNode;
  pageSidebar?: ReactNode | ((args: { collapsed: boolean }) => ReactNode);
  noDirectoryOpenState?: {
    isVisible: boolean;
    isBusy: boolean;
    statusMessage: string | null;
    errorMessage: string | null;
    onSelectDirectory: () => void | Promise<void>;
    onOpenRecentDirectory: (directoryPath: string) => void | Promise<void>;
  };
};

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const NAVIGATION_START_MARKER_KEY = "__grooveNavigationTelemetryStart";

let shellWorkspaceGetActivePromise: Promise<Awaited<ReturnType<typeof workspaceGetActive>>> | null = null;
let shellGrooveBinStatusPromise: Promise<Awaited<ReturnType<typeof grooveBinStatus>>> | null = null;
let shellDiagnosticsOverviewPromise: Promise<DiagnosticsSystemOverviewResponse> | null = null;

type NavigationStartMarker = {
  from: string;
  to: string;
  startedAtUnixMs: number;
  startedAtPerfMs: number;
};

function getNavigationStartMarker(): NavigationStartMarker | null {
  const marker = (window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker })[
    NAVIGATION_START_MARKER_KEY
  ];
  return marker ?? null;
}

function clearNavigationStartMarker(): void {
  delete (window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker })[NAVIGATION_START_MARKER_KEY];
}

function readStoredRecentDirectories(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_DIRECTORIES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
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

function getIsShowFpsEnabledSnapshot(): boolean {
  return isShowFpsEnabled();
}

function getIsAlwaysShowDiagnosticsSidebarEnabledSnapshot(): boolean {
  return isAlwaysShowDiagnosticsSidebarEnabled();
}

async function loadShellWorkspaceGetActive(): Promise<Awaited<ReturnType<typeof workspaceGetActive>>> {
  if (!shellWorkspaceGetActivePromise) {
    shellWorkspaceGetActivePromise = workspaceGetActive().finally(() => {
      shellWorkspaceGetActivePromise = null;
    });
  }
  return shellWorkspaceGetActivePromise;
}

async function loadShellGrooveBinStatus(): Promise<Awaited<ReturnType<typeof grooveBinStatus>>> {
  if (!shellGrooveBinStatusPromise) {
    shellGrooveBinStatusPromise = grooveBinStatus().finally(() => {
      shellGrooveBinStatusPromise = null;
    });
  }
  return shellGrooveBinStatusPromise;
}

async function loadShellDiagnosticsOverview(): Promise<DiagnosticsSystemOverviewResponse> {
  if (!shellDiagnosticsOverviewPromise) {
    shellDiagnosticsOverviewPromise = diagnosticsGetSystemOverview().finally(() => {
      shellDiagnosticsOverviewPromise = null;
    });
  }
  return shellDiagnosticsOverviewPromise;
}

export function PageShell({ children, pageSidebar, noDirectoryOpenState }: PageShellProps) {
  const { pathname } = useLocation();
  const [grooveBinStatusState, setGrooveBinStatusState] = useState<GrooveBinCheckStatus | null>(null);
  const [isRepairingGrooveBin, setIsRepairingGrooveBin] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [recentDirectories, setRecentDirectories] = useState<string[]>([]);
  const [currentFps, setCurrentFps] = useState<number | null>(null);
  const [diagnosticsOverview, setDiagnosticsOverview] = useState<DiagnosticsSystemOverview | null>(null);
  const [diagnosticsOverviewError, setDiagnosticsOverviewError] = useState<string | null>(null);
  const [isDiagnosticsOverviewLoading, setIsDiagnosticsOverviewLoading] = useState(false);
  const [hasDiagnosticsSanityWarning, setHasDiagnosticsSanityWarning] = useState(false);
  const shouldShowFps = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsShowFpsEnabledSnapshot,
    getIsShowFpsEnabledSnapshot,
  );
  const shouldAlwaysShowDiagnosticsSidebar = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsAlwaysShowDiagnosticsSidebarEnabledSnapshot,
    getIsAlwaysShowDiagnosticsSidebarEnabledSnapshot,
  );

  const refreshGrooveBinStatus = useCallback(async (): Promise<void> => {
    try {
      const result = await loadShellGrooveBinStatus();
      if (result.ok) {
        setGrooveBinStatusState(result.status);
      }
    } catch {
      setGrooveBinStatusState(null);
    }
  }, []);

  useEffect(() => {
    const nowPerfMs = performance.now();
    const marker = getNavigationStartMarker();

    if (!marker) {
      if (isTelemetryEnabled()) {
        console.info(`${UI_TELEMETRY_PREFIX} navigation.end`, {
          from: "unknown",
          to: pathname,
          duration_ms: null,
        });
      }
      return;
    }

    if (marker.to !== pathname) {
      clearNavigationStartMarker();
      return;
    }

    const durationMs = Math.max(0, nowPerfMs - marker.startedAtPerfMs);
    if (isTelemetryEnabled()) {
      console.info(`${UI_TELEMETRY_PREFIX} navigation.end`, {
        from: marker.from,
        to: pathname,
        intended_to: marker.to,
        started_at_ms: marker.startedAtUnixMs,
        duration_ms: Number(durationMs.toFixed(2)),
      });
    }
    clearNavigationStartMarker();
  }, [pathname]);

  useEffect(() => {
    if (!isTelemetryEnabled()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const startedAtMs = performance.now();

      try {
        const result = await loadShellWorkspaceGetActive();
        if (cancelled) {
          return;
        }

        const durationMs = Math.max(0, performance.now() - startedAtMs);
        console.info(`${UI_TELEMETRY_PREFIX} workspace_get_active.shell`, {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: result.ok ? "ok" : "error",
          pathname,
        });
      } catch {
        if (cancelled) {
          return;
        }

        const durationMs = Math.max(0, performance.now() - startedAtMs);
        console.info(`${UI_TELEMETRY_PREFIX} workspace_get_active.shell`, {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "error",
          pathname,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
      return;
    }

    const supportsLongTask = PerformanceObserver.supportedEntryTypes?.includes("longtask");
    if (!supportsLongTask) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      const marker = getNavigationStartMarker();
      if (!marker) {
        return;
      }

      for (const entry of list.getEntries()) {
        if (isTelemetryEnabled()) {
          console.info(`${UI_TELEMETRY_PREFIX} navigation.longtask`, {
            from: marker.from,
            to: marker.to,
            current_path: window.location.pathname,
            start_time_ms: Number(entry.startTime.toFixed(2)),
            duration_ms: Number(entry.duration.toFixed(2)),
          });
        }
      }
    });

    observer.observe({ entryTypes: ["longtask"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setRecentDirectories(readStoredRecentDirectories());
  }, [noDirectoryOpenState?.isVisible]);

  useEffect(() => {
    void refreshGrooveBinStatus();
  }, [refreshGrooveBinStatus]);

  useEffect(() => {
    if (!shouldShowFps) {
      setCurrentFps(null);
      return;
    }

    let frameCount = 0;
    let frameId = 0;
    let lastSampleAt = performance.now();

    const measureFrame = (timestamp: number) => {
      frameCount += 1;
      const elapsed = timestamp - lastSampleAt;
      if (elapsed >= 500) {
        setCurrentFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        lastSampleAt = timestamp;
      }
      frameId = window.requestAnimationFrame(measureFrame);
    };

    frameId = window.requestAnimationFrame(measureFrame);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [shouldShowFps]);

  const showGrooveBinWarning = grooveBinStatusState?.hasIssue === true;
  const hasOpenWorkspace = noDirectoryOpenState?.isVisible !== true;
  const shouldAppendDiagnosticsSidebar = hasOpenWorkspace && pathname !== "/diagnostics" && shouldAlwaysShowDiagnosticsSidebar;

  const refreshDiagnosticsOverview = useCallback(async (): Promise<void> => {
    setIsDiagnosticsOverviewLoading(true);
    setDiagnosticsOverviewError(null);

    try {
      const result = await loadShellDiagnosticsOverview();
      if (!result.ok || !result.overview) {
        setDiagnosticsOverview(null);
        setDiagnosticsOverviewError(result.error ?? "Failed to load system usage.");
        return;
      }

      setDiagnosticsOverview(result.overview);
    } catch {
      setDiagnosticsOverview(null);
      setDiagnosticsOverviewError("Failed to load system usage.");
    } finally {
      setIsDiagnosticsOverviewLoading(false);
    }
  }, []);

  const refreshDiagnosticsSanityWarning = useCallback(async (): Promise<void> => {
    if (!hasOpenWorkspace) {
      setHasDiagnosticsSanityWarning(false);
      return;
    }

    try {
      const workspaceResult = await workspaceGetActive();
      if (!workspaceResult.ok || !workspaceResult.workspaceRoot) {
        setHasDiagnosticsSanityWarning(false);
        return;
      }

      const sanityResult = await workspaceGitignoreSanityCheck();
      if (!sanityResult.ok) {
        setHasDiagnosticsSanityWarning(false);
        return;
      }

      setHasDiagnosticsSanityWarning(sanityResult.isApplicable && sanityResult.missingEntries.length > 0);
    } catch {
      setHasDiagnosticsSanityWarning(false);
    }
  }, [hasOpenWorkspace]);

  useEffect(() => {
    if (!hasOpenWorkspace) {
      setHasDiagnosticsSanityWarning(false);
      return;
    }

    let isClosed = false;
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

    const refreshIfOpen = (): void => {
      if (isClosed) {
        return;
      }
      void refreshDiagnosticsSanityWarning();
    };

    refreshIfOpen();

    void (async () => {
      try {
        const [unlistenReady, unlistenChange] = await Promise.all([
          listenWorkspaceReady(refreshIfOpen),
          listenWorkspaceChange(refreshIfOpen),
        ]);

        if (isClosed) {
          unlistenReady();
          unlistenChange();
          return;
        }

        unlistenHandlers.push(unlistenReady, unlistenChange);
      } catch {
        cleanupListeners();
      }
    })();

    return () => {
      isClosed = true;
      cleanupListeners();
    };
  }, [hasOpenWorkspace, refreshDiagnosticsSanityWarning]);

  useEffect(() => {
    if (!shouldAppendDiagnosticsSidebar) {
      return;
    }

    void refreshDiagnosticsOverview();
  }, [refreshDiagnosticsOverview, shouldAppendDiagnosticsSidebar]);

  const resolvedNavigationSidebar: PageShellProps["pageSidebar"] = useCallback(
    ({ collapsed }: { collapsed: boolean }) => (
      <>
        {typeof pageSidebar === "function" ? pageSidebar({ collapsed }) : pageSidebar}
        {shouldAppendDiagnosticsSidebar && (
          <DiagnosticsSystemSidebar
            collapsed={collapsed}
            overview={diagnosticsOverview}
            isLoading={isDiagnosticsOverviewLoading}
            errorMessage={diagnosticsOverviewError}
            onRefresh={() => {
              void refreshDiagnosticsOverview();
            }}
          />
        )}
      </>
    ),
    [diagnosticsOverview, diagnosticsOverviewError, isDiagnosticsOverviewLoading, pageSidebar, refreshDiagnosticsOverview, shouldAppendDiagnosticsSidebar],
  );

  const repairGrooveBin = useCallback(async (): Promise<void> => {
    try {
      setIsRepairingGrooveBin(true);
      const result = await grooveBinRepair();
      setGrooveBinStatusState(result.status);

      if (!result.ok) {
        toast.error("Failed to repair GROOVE_BIN.", {
          description: result.error,
        });
        return;
      }

      if (result.changed) {
        toast.success("Repaired GROOVE_BIN for this app session.", {
          description: `Now using ${result.status.effectiveBinarySource}: ${result.status.effectiveBinaryPath}`,
        });
        return;
      }

      toast.info("No GROOVE_BIN repair was needed.");
    } catch {
      toast.error("Failed to repair GROOVE_BIN.");
    } finally {
      setIsRepairingGrooveBin(false);
    }
  }, []);

  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation
          hasOpenWorkspace={hasOpenWorkspace}
          hasDiagnosticsSanityWarning={hasDiagnosticsSanityWarning}
          isHelpOpen={isHelpModalOpen}
          onHelpClick={() => setIsHelpModalOpen(true)}
          pageSidebar={resolvedNavigationSidebar}
        />
        <div className="min-w-0 flex-1 space-y-4">
          {showGrooveBinWarning && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-700/30 bg-amber-500/10 px-3 py-2">
              <p className="text-sm text-amber-900">
                {grooveBinStatusState?.issue ?? "GROOVE_BIN is invalid."}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void repairGrooveBin()} disabled={isRepairingGrooveBin}>
                {isRepairingGrooveBin ? "Repairing..." : "Repair GROOVE_BIN"}
              </Button>
            </div>
          )}
          {noDirectoryOpenState?.isVisible ? (
            <section aria-live="polite" className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
              <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-4 text-center">
                <h1 className="text-5xl font-semibold tracking-[0.18em] sm:text-7xl">GROOVE</h1>

                {recentDirectories.length > 0 ? (
                  <div className="flex w-full max-w-md flex-col gap-2" aria-label="Recent directories">
                    {recentDirectories.map((directoryPath) => (
                      <Button
                        key={directoryPath}
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={noDirectoryOpenState.isBusy}
                        title={directoryPath}
                        onClick={() => {
                          void noDirectoryOpenState.onOpenRecentDirectory(directoryPath);
                        }}
                        className="w-full justify-start truncate"
                      >
                        {directoryPath}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recent directories</p>
                )}

                <div className="flex w-full max-w-md items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span>OR</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>

                <Button
                  type="button"
                  size="lg"
                  disabled={noDirectoryOpenState.isBusy}
                  onClick={() => {
                    void noDirectoryOpenState.onSelectDirectory();
                  }}
                  className="w-full max-w-md"
                >
                  {noDirectoryOpenState.isBusy ? "Opening picker..." : "Select new directory"}
                </Button>

                {noDirectoryOpenState.statusMessage && (
                  <p className="w-full rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                    {noDirectoryOpenState.statusMessage}
                  </p>
                )}
                {noDirectoryOpenState.errorMessage && (
                  <p className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {noDirectoryOpenState.errorMessage}
                  </p>
                )}
              </div>
            </section>
          ) : (
            children
          )}
        </div>
      </div>
      {shouldShowFps && (
        <div className="pointer-events-none fixed right-4 top-4 z-50 rounded border border-border/80 bg-background/90 px-2 py-1 font-mono text-xs text-foreground shadow-sm">
          FPS {currentFps ?? "--"}
        </div>
      )}
      <HelpModal open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen} />
    </main>
  );
}
