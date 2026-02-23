"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppNavigation } from "@/components/app-navigation";
import { HelpModal } from "@/components/pages/help/help-modal";
import { isTelemetryEnabled, listenWorkspaceReady, workspaceGetActive } from "@/src/lib/ipc";

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
          {children}
        </div>
      </div>
      <HelpModal open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen} />
    </main>
  );
}
