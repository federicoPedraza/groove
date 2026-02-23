"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { AppNavigation } from "@/components/app-navigation";
import { Button } from "@/components/ui/button";
import { HelpModal } from "@/components/pages/help/help-modal";
import {
  grooveBinRepair,
  grooveBinStatus,
  isTelemetryEnabled,
  listenWorkspaceReady,
  workspaceGetActive,
  type GrooveBinCheckStatus,
} from "@/src/lib/ipc";

type PageShellProps = {
  children: ReactNode;
};

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const NAVIGATION_START_MARKER_KEY = "__grooveNavigationTelemetryStart";

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

export function PageShell({ children }: PageShellProps) {
  const { pathname } = useLocation();
  const [hasConnectedRepository, setHasConnectedRepository] = useState<boolean | null>(null);
  const [grooveBinStatusState, setGrooveBinStatusState] = useState<GrooveBinCheckStatus | null>(null);
  const [isRepairingGrooveBin, setIsRepairingGrooveBin] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const refreshRepositoryConnection = useCallback(async (): Promise<void> => {
    try {
      const result = await workspaceGetActive();
      if (!result.ok) {
        setHasConnectedRepository(false);
        return;
      }
      setHasConnectedRepository(Boolean(result.workspaceRoot));
    } catch {
      setHasConnectedRepository(false);
    }
  }, []);

  const refreshGrooveBinStatus = useCallback(async (): Promise<void> => {
    try {
      const result = await grooveBinStatus();
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
    void refreshRepositoryConnection();
  }, [refreshRepositoryConnection]);

  useEffect(() => {
    void refreshGrooveBinStatus();
  }, [refreshGrooveBinStatus]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        unlisten = await listenWorkspaceReady(() => {
          if (active) {
            void refreshRepositoryConnection();
          }
        });
      } catch {
        unlisten = null;
      }
    })();

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [refreshRepositoryConnection]);

  const showRepositoryWarning = pathname !== "/settings" && hasConnectedRepository === false;
  const showGrooveBinWarning = grooveBinStatusState?.hasIssue === true;

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
        <AppNavigation isHelpOpen={isHelpModalOpen} onHelpClick={() => setIsHelpModalOpen(true)} />
        <div className="min-w-0 flex-1 space-y-4">
          {showRepositoryWarning && (
            <p className="rounded-md border border-amber-700/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
              No repository connected. Go to Settings and connect a Git repository folder.
            </p>
          )}
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
          {children}
        </div>
      </div>
      <HelpModal open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen} />
    </main>
  );
}
