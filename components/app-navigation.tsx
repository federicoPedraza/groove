"use client";

import { Link, useLocation } from "react-router-dom";
import { ActivitySquare, CircleHelp, LayoutDashboard, PanelLeft, Settings } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  sidebarMenuButtonClassName,
} from "@/components/ui/sidebar";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  grooveList,
  isShowFpsEnabled,
  isTelemetryEnabled,
  listenWorkspaceChange,
  listenWorkspaceReady,
  subscribeToGlobalSettings,
  type WorkspaceRow,
  workspaceEvents,
  workspaceGetActive,
} from "@/src/lib/ipc";
import { deriveWorktreeStatus } from "@/lib/utils/worktree/status";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const NAVIGATION_START_MARKER_KEY = "__grooveNavigationTelemetryStart";

type NavigationStartMarker = {
  from: string;
  to: string;
  startedAtUnixMs: number;
  startedAtPerfMs: number;
};

function setNavigationStartMarker(marker: NavigationStartMarker): void {
  (window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker })[NAVIGATION_START_MARKER_KEY] = marker;
}

function clearNavigationStartMarker(): void {
  delete (window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker })[NAVIGATION_START_MARKER_KEY];
}

type AppNavigationProps = {
  hasOpenWorkspace: boolean;
  isHelpOpen: boolean;
  onHelpClick: () => void;
  pageSidebar?: ReactNode | ((args: { collapsed: boolean }) => ReactNode);
};

type GrooveLoadingSpriteProps = {
  isLoading: boolean;
  isCompact?: boolean;
  shouldShowFrameIndex: boolean;
};

const IDLE_SPRITE_ANIMATION_DURATION_MS = 5_333.3333;
const RUNNING_SPRITE_ANIMATION_DURATION_MS = 10_000;
const FALLING_FIRST_FRAME_HOLD_MS = 1_000;
const FALLING_FRAME_STEP_DURATION_MS = 100;
const FALLING_FRAME_SEQUENCE = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  17,
  14,
  17,
  14,
  17,
  14,
  17,
  14,
  17,
  14,
  17,
  14,
  17,
] as const;
const FALLING_SPRITE_ANIMATION_DURATION_MS = FALLING_FIRST_FRAME_HOLD_MS +
  (FALLING_FRAME_SEQUENCE.length * FALLING_FRAME_STEP_DURATION_MS);
const IDLE_FRAME_COUNT = 11;
const RUNNING_FRAME_COUNT = 19;
const FALLING_FRAME_COUNT = 18;
const IDLE_PING_PONG_SEGMENT_COUNT = (IDLE_FRAME_COUNT - 1) * 2;
const IDLE_CLICK_COUNT_FOR_FALLING = 5;

type GrooveSpriteMode = "idle" | "running" | "falling";

type RuntimeStatusRow = {
  opencodeState: "running" | "not-running" | "unknown";
};

function isWorkspaceRow(value: unknown): value is WorkspaceRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as { worktree?: unknown; status?: unknown };
  return typeof row.worktree === "string" && typeof row.status === "string";
}

function normalizeWorkspaceRows(value: unknown): WorkspaceRow[] {
  if (Array.isArray(value)) {
    return value.filter(isWorkspaceRow);
  }

  if (value && typeof value === "object") {
    return Object.values(value).filter(isWorkspaceRow);
  }

  return [];
}

function toRuntimeStatusRow(value: unknown): RuntimeStatusRow | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const opencodeState = (value as { opencodeState?: unknown }).opencodeState;
  return opencodeState === "running" || opencodeState === "not-running" || opencodeState === "unknown"
    ? { opencodeState }
    : undefined;
}

function getIdleFrameIndex(elapsedMs: number, animationDurationMs: number): number {
  const segmentDurationMs = animationDurationMs / IDLE_PING_PONG_SEGMENT_COUNT;
  const cycleElapsedMs = elapsedMs % animationDurationMs;
  const segmentIndex = Math.floor(cycleElapsedMs / segmentDurationMs);

  return segmentIndex <= IDLE_FRAME_COUNT - 1
    ? segmentIndex
    : IDLE_PING_PONG_SEGMENT_COUNT - segmentIndex;
}

function getFallingFrameIndex(elapsedMs: number): number {
  if (elapsedMs < FALLING_FIRST_FRAME_HOLD_MS) {
    return 0;
  }

  const sequenceIndex = Math.min(
    Math.floor((elapsedMs - FALLING_FIRST_FRAME_HOLD_MS) / FALLING_FRAME_STEP_DURATION_MS),
    FALLING_FRAME_SEQUENCE.length - 1,
  );
  return FALLING_FRAME_SEQUENCE[sequenceIndex];
}

function getIsShowFpsEnabledSnapshot(): boolean {
  return isShowFpsEnabled();
}

function GrooveLoadingSprite({ isLoading, isCompact = false, shouldShowFrameIndex }: GrooveLoadingSpriteProps) {
  const [, setIdleClickCount] = useState(0);
  const [isPlayingFalling, setIsPlayingFalling] = useState(false);
  const spriteMode: GrooveSpriteMode = isLoading ? "running" : isPlayingFalling ? "falling" : "idle";
  const animationDurationMs =
    spriteMode === "running"
      ? RUNNING_SPRITE_ANIMATION_DURATION_MS
      : spriteMode === "falling"
        ? FALLING_SPRITE_ANIMATION_DURATION_MS
        : IDLE_SPRITE_ANIMATION_DURATION_MS;
  const frameStepCount =
    spriteMode === "running"
      ? RUNNING_FRAME_COUNT
      : spriteMode === "falling"
        ? FALLING_FRAME_COUNT
        : IDLE_PING_PONG_SEGMENT_COUNT;
  const [frameIndex, setFrameIndex] = useState(0);
  const shouldRenderFrameIndex = shouldShowFrameIndex && !isCompact;

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    setIdleClickCount(0);
    setIsPlayingFalling(false);
  }, [isLoading]);

  const handleSpriteClick = useCallback(() => {
    if (isLoading || isPlayingFalling) {
      return;
    }

    setIdleClickCount((previousIdleClickCount) => {
      const nextIdleClickCount = previousIdleClickCount + 1;
      if (nextIdleClickCount < IDLE_CLICK_COUNT_FOR_FALLING) {
        return nextIdleClickCount;
      }

      setIsPlayingFalling(true);
      return 0;
    });
  }, [isLoading, isPlayingFalling]);

  const handleSpriteAnimationEnd = useCallback(() => {
    setIsPlayingFalling(false);
    setIdleClickCount(0);
  }, []);

  useEffect(() => {
    setFrameIndex(0);

    if (!shouldRenderFrameIndex) {
      return;
    }

    let frameIntervalId: number | null = null;
    const startedAtMs = performance.now();
    const frameStepDurationMs = spriteMode === "falling"
      ? FALLING_FRAME_STEP_DURATION_MS
      : animationDurationMs / frameStepCount;

    const updateFrameIndex = () => {
      const elapsedMs = performance.now() - startedAtMs;
      const nextFrameIndex =
        spriteMode === "running"
          ? Math.floor(elapsedMs / frameStepDurationMs) % RUNNING_FRAME_COUNT
          : spriteMode === "falling"
            ? getFallingFrameIndex(elapsedMs)
            : getIdleFrameIndex(elapsedMs, animationDurationMs);
      setFrameIndex((previousFrameIndex) => (previousFrameIndex === nextFrameIndex ? previousFrameIndex : nextFrameIndex));
    };

    const firstTickDelayMs = Math.max(0, frameStepDurationMs - ((performance.now() - startedAtMs) % frameStepDurationMs));
    const frameTimeoutId = window.setTimeout(() => {
      updateFrameIndex();
      frameIntervalId = window.setInterval(updateFrameIndex, frameStepDurationMs);
    }, firstTickDelayMs);

    return () => {
      window.clearTimeout(frameTimeoutId);
      if (frameIntervalId !== null) {
        window.clearInterval(frameIntervalId);
      }
    };
  }, [animationDurationMs, frameStepCount, shouldRenderFrameIndex, spriteMode]);

  return (
    <div
      className={cn("relative overflow-hidden", isCompact ? "h-8 w-8" : "h-[96px] w-[144px]")}
      onClick={handleSpriteClick}
    >
      <div
        aria-hidden="true"
        className={cn(
          "groove-loading-sprite",
          spriteMode === "running"
            ? "groove-loading-sprite-running"
            : spriteMode === "falling"
              ? "groove-loading-sprite-falling"
              : "groove-loading-sprite-idle",
          isCompact && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.3333]",
        )}
        onAnimationEnd={handleSpriteAnimationEnd}
      />
      {shouldRenderFrameIndex && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/75 px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground/80">
          frame {frameIndex}
        </span>
      )}
    </div>
  );
}

function AppNavigation({ hasOpenWorkspace, isHelpOpen, onHelpClick, pageSidebar }: AppNavigationProps) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [hasReadyWorktree, setHasReadyWorktree] = useState(false);
  const shouldShowFps = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsShowFpsEnabledSnapshot,
    getIsShowFpsEnabledSnapshot,
  );

  const isHomeActive = pathname === "/";
  const isDiagnosticsActive = pathname === "/diagnostics";
  const isSettingsActive = pathname === "/settings";
  const isHelpActive = isHelpOpen;
  const homeLabel = hasOpenWorkspace ? "Dashboard" : "Home";

  const refreshHasReadyWorktree = useCallback(async () => {
    if (!hasOpenWorkspace) {
      setHasReadyWorktree(false);
      return;
    }

    try {
      const workspaceResult = await workspaceGetActive();
      if (!workspaceResult.ok) {
        setHasReadyWorktree(false);
        return;
      }

      const workspaceRows = normalizeWorkspaceRows((workspaceResult as { rows?: unknown }).rows);
      const hasReadyWorkspaceRow = workspaceRows.some((workspaceRow) => workspaceRow.status === "ready");
      if (hasReadyWorkspaceRow) {
        setHasReadyWorktree(true);
        return;
      }

      if (workspaceRows.length === 0) {
        setHasReadyWorktree(false);
        return;
      }

      const runtimeResult = await grooveList({
        rootName: workspaceResult.workspaceMeta?.rootName,
        knownWorktrees: workspaceRows.map((workspaceRow) => workspaceRow.worktree),
        workspaceMeta: workspaceResult.workspaceMeta,
      }, {
        intent: "background",
      });

      if (!runtimeResult.ok) {
        setHasReadyWorktree(false);
        return;
      }

      const runtimeRowsByWorktree = runtimeResult.rows;
      setHasReadyWorktree(
        workspaceRows.some((workspaceRow) => {
          const runtimeRow = toRuntimeStatusRow(
            runtimeRowsByWorktree && typeof runtimeRowsByWorktree === "object"
              ? (runtimeRowsByWorktree as Record<string, unknown>)[workspaceRow.worktree]
              : undefined,
          );
          return deriveWorktreeStatus(workspaceRow.status, runtimeRow) === "ready";
        }),
      );
    } catch {
      setHasReadyWorktree(false);
    }
  }, [hasOpenWorkspace]);

  useEffect(() => {
    void refreshHasReadyWorktree();
  }, [refreshHasReadyWorktree]);

  useEffect(() => {
    if (!hasOpenWorkspace) {
      return;
    }

    let isClosed = false;
    let refreshRetryTimeoutId: number | null = null;
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

    void (async () => {
      try {
        const [unlistenReady, unlistenChange] = await Promise.all([
          listenWorkspaceReady(() => {
            void refreshHasReadyWorktree();
          }),
          listenWorkspaceChange(() => {
            void refreshHasReadyWorktree();
          }),
        ]);

        if (isClosed) {
          unlistenReady();
          unlistenChange();
          return;
        }

        unlistenHandlers.push(unlistenReady, unlistenChange);

        const workspaceResult = await workspaceGetActive();
        const workspaceRows = workspaceResult.ok
          ? normalizeWorkspaceRows((workspaceResult as { rows?: unknown }).rows)
          : [];
        await workspaceEvents({
          rootName: workspaceResult.ok ? workspaceResult.workspaceMeta?.rootName : undefined,
          knownWorktrees: workspaceRows.map((workspaceRow) => workspaceRow.worktree),
          workspaceMeta: workspaceResult.ok ? workspaceResult.workspaceMeta : undefined,
        });

        void refreshHasReadyWorktree();
        refreshRetryTimeoutId = window.setTimeout(() => {
          if (isClosed) {
            return;
          }
          void refreshHasReadyWorktree();
        }, 1_500);
      } catch {
        cleanupListeners();
      }
    })();

    return () => {
      isClosed = true;
      if (refreshRetryTimeoutId !== null) {
        window.clearTimeout(refreshRetryTimeoutId);
        refreshRetryTimeoutId = null;
      }
      cleanupListeners();
    };
  }, [hasOpenWorkspace, refreshHasReadyWorktree]);

  const recordNavigationStart = useCallback(
    (to: string) => {
      if (to === pathname) {
        clearNavigationStartMarker();
        return;
      }
      const startedAtUnixMs = Date.now();
      const startedAtPerfMs = performance.now();
      setNavigationStartMarker({
        from: pathname,
        to,
        startedAtUnixMs,
        startedAtPerfMs,
      });
      if (isTelemetryEnabled()) {
        console.info(`${UI_TELEMETRY_PREFIX} navigation.start`, {
          from: pathname,
          to,
          timestamp_ms: startedAtUnixMs,
        });
      }
    },
    [pathname],
  );

  const resolvedPageSidebar =
    typeof pageSidebar === "function" ? pageSidebar({ collapsed: isSidebarCollapsed }) : pageSidebar;

  return (
    <>
      <div className="hidden shrink-0 md:sticky md:top-4 md:flex md:self-start md:flex-col md:gap-4">
        <Sidebar collapsed={isSidebarCollapsed}>
          <SidebarHeader>
            <div className="flex items-center justify-center">
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border/70 bg-background",
                  isSidebarCollapsed ? "h-12 w-12" : "h-[128px] w-[144px]",
                )}
              >
                <GrooveLoadingSprite
                  isLoading={hasReadyWorktree}
                  isCompact={isSidebarCollapsed}
                  shouldShowFrameIndex={shouldShowFps}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              {!isSidebarCollapsed && (
                <div className="px-2">
                  <span className="text-sm font-bold text-foreground">GROOVE</span>
                </div>
              )}
              <SidebarCollapseButton
                collapsed={isSidebarCollapsed}
                onToggle={setIsSidebarCollapsed}
              />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <TooltipProvider>
              <SidebarMenu>
                <Link
                  to="/"
                  className={sidebarMenuButtonClassName({
                    isActive: isHomeActive,
                    collapsed: isSidebarCollapsed,
                  })}
                  onClick={() => {
                    recordNavigationStart("/");
                  }}
                >
                  <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                  {!isSidebarCollapsed && <span>{homeLabel}</span>}
                </Link>
                {hasOpenWorkspace && (
                  <Link
                    to="/diagnostics"
                    className={cn(
                      "relative",
                      sidebarMenuButtonClassName({
                        isActive: isDiagnosticsActive,
                        collapsed: isSidebarCollapsed,
                      }),
                    )}
                    onClick={() => {
                      recordNavigationStart("/diagnostics");
                    }}
                  >
                    <ActivitySquare aria-hidden="true" className="size-4 shrink-0" />
                    {!isSidebarCollapsed && <span>Diagnostics</span>}
                  </Link>
                )}
                <Link
                  to="/settings"
                  className={cn(
                    "relative",
                    sidebarMenuButtonClassName({
                      isActive: isSettingsActive,
                      collapsed: isSidebarCollapsed,
                    }),
                  )}
                  onClick={() => {
                    recordNavigationStart("/settings");
                  }}
                >
                  <Settings aria-hidden="true" className="size-4 shrink-0" />
                  {!isSidebarCollapsed && <span>Settings</span>}
                </Link>
                {hasOpenWorkspace && (
                  <SidebarMenuButton
                    type="button"
                    className={cn("relative")}
                    isActive={isHelpActive}
                    collapsed={isSidebarCollapsed}
                    onClick={onHelpClick}
                  >
                    <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
                    {!isSidebarCollapsed && <span>Help</span>}
                  </SidebarMenuButton>
                )}
              </SidebarMenu>
            </TooltipProvider>
          </SidebarContent>
        </Sidebar>
        {resolvedPageSidebar}
      </div>

      <Collapsible
        open={isMobileSidebarOpen}
        onOpenChange={setIsMobileSidebarOpen}
        className="rounded-xl border bg-card p-2 md:hidden"
      >
        <CollapsibleTrigger className="inline-flex h-9 w-full items-center justify-start gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none">
          <PanelLeft aria-hidden="true" className="size-4" />
          <span>Navigation</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <TooltipProvider>
            <SidebarMenu>
              <Link
                to="/"
                className={sidebarMenuButtonClassName({ isActive: isHomeActive })}
                onClick={() => {
                  recordNavigationStart("/");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                <span>{homeLabel}</span>
              </Link>
              {hasOpenWorkspace && (
                <Link
                  to="/diagnostics"
                  className={sidebarMenuButtonClassName({ isActive: isDiagnosticsActive })}
                  onClick={() => {
                    recordNavigationStart("/diagnostics");
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  <ActivitySquare aria-hidden="true" className="size-4 shrink-0" />
                  <span>Diagnostics</span>
                </Link>
              )}
              <Link
                to="/settings"
                className={sidebarMenuButtonClassName({ isActive: isSettingsActive })}
                onClick={() => {
                  recordNavigationStart("/settings");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                <span>Settings</span>
              </Link>
              {hasOpenWorkspace && (
                <SidebarMenuButton
                  type="button"
                  isActive={isHelpActive}
                  onClick={() => {
                    onHelpClick();
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
                  <span>Help</span>
                </SidebarMenuButton>
              )}
            </SidebarMenu>
          </TooltipProvider>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

export { AppNavigation };
