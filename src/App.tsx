import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Home from "@/app/page";
import { AppLayout } from "@/components/pages/app-layout";
import { CommandHistoryPanel } from "@/components/command-history-panel";
import { isPeriodicRerenderEnabled, subscribeToGlobalSettings } from "@/src/lib/ipc";

const DiagnosticsPage = lazy(async () => import("@/app/diagnostics/page"));
const SettingsPage = lazy(async () => import("@/app/settings/page"));
const WorktreesPage = lazy(async () => import("@/app/worktrees/page"));
const WorktreeDetailPage = lazy(async () => import("@/app/worktrees/worktree-detail-page"));

type RouteFallbackProps = {
  pageName: string;
};

function RouteFallback({ pageName }: RouteFallbackProps) {
  return (
    <section aria-live="polite" className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Loading {pageName}...</p>
    </section>
  );
}

function getIsPeriodicRerenderEnabledSnapshot(): boolean {
  return isPeriodicRerenderEnabled();
}

export function App() {
  const shouldTriggerPeriodicRerenders = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsPeriodicRerenderEnabledSnapshot,
    getIsPeriodicRerenderEnabledSnapshot,
  );
  const [, setPeriodicRerenderTick] = useState(0);

  useEffect(() => {
    if (!shouldTriggerPeriodicRerenders) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPeriodicRerenderTick((previous) => {
        const next = previous + 1;
        if (import.meta.env.DEV) {
          console.info("[ui-telemetry] periodic-rerender.tick", { tick: next });
        }
        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldTriggerPeriodicRerenders]);

  return (
    <>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route
            path="worktrees"
            element={
              <Suspense fallback={<RouteFallback pageName="worktrees" />}>
                <WorktreesPage />
              </Suspense>
            }
          />
          <Route
            path="worktrees/:worktree"
            element={
              <Suspense fallback={<RouteFallback pageName="worktree details" />}>
                <WorktreeDetailPage />
              </Suspense>
            }
          />
          <Route
            path="diagnostics"
            element={
              <Suspense fallback={<RouteFallback pageName="diagnostics" />}>
                <DiagnosticsPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<RouteFallback pageName="settings" />}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <CommandHistoryPanel />
    </>
  );
}
