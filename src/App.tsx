import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const Home = lazy(async () => import("@/src/app/page"));
import { AppLayout } from "@/src/components/pages/app-layout";
import { CommandHistoryPanel } from "@/src/components/command-history-panel";
import { KeyboardShortcutsProvider } from "@/src/components/shortcuts/keyboard-shortcuts-provider";
import {
  isPeriodicRerenderEnabled,
  subscribeToGlobalSettings,
} from "@/src/lib/ipc";

const BestiaryPage = lazy(async () => import("@/src/app/bestiary/page"));
const DiagnosticsPage = lazy(async () => import("@/src/app/diagnostics/page"));
const IntelligencePage = lazy(async () => import("@/src/app/intelligence/page"));
const InventoryPage = lazy(async () => import("@/src/app/inventory/page"));
const SettingsPage = lazy(async () => import("@/src/app/settings/page"));
const WorkspaceSettingsPage = lazy(
  async () => import("@/src/app/workspace/settings/page"),
);
const WorktreeDetailPage = lazy(
  async () => import("@/src/app/worktrees/worktree-detail-page"),
);

type RouteFallbackProps = {
  pageName: string;
};

function RouteFallback({ pageName }: RouteFallbackProps) {
  return (
    <section aria-live="polite">
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Loading {pageName}...
      </p>
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
    <KeyboardShortcutsProvider>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback pageName="home" />}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path="worktrees/:worktree"
            element={
              <Suspense
                fallback={<RouteFallback pageName="worktree details" />}
              >
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
            path="bestiary"
            element={
              <Suspense fallback={<RouteFallback pageName="bestiary" />}>
                <BestiaryPage />
              </Suspense>
            }
          />
          <Route
            path="inventory"
            element={
              <Suspense fallback={<RouteFallback pageName="inventory" />}>
                <InventoryPage />
              </Suspense>
            }
          />
          <Route
            path="intelligence"
            element={
              <Suspense fallback={<RouteFallback pageName="intelligence" />}>
                <IntelligencePage />
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
          <Route
            path="workspace/settings"
            element={
              <Suspense
                fallback={<RouteFallback pageName="workspace settings" />}
              >
                <WorkspaceSettingsPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <CommandHistoryPanel />
    </KeyboardShortcutsProvider>
  );
}
