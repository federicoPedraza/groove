"use client";

import { Link, useLocation } from "react-router-dom";
import { ActivitySquare, CircleHelp, GitBranch, LayoutDashboard, PanelLeft, Settings, TreePalm, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MASCOT_ID,
  getMascotColorClassNames,
  getDefaultMascotAssignment,
  getMascotSpriteForMode,
  getWorktreeMascotAssignment,
  syncActiveWorktreeMascotAssignments,
  type MascotIdleAnimationMode,
  type MascotDefinition,
} from "@/lib/utils/mascots";
import {
  grooveList,
  isGrooveLoadingSectionDisabled,
  isShowFpsEnabled,
  isTelemetryEnabled,
  listenGrooveTerminalLifecycle,
  listenWorkspaceChange,
  listenWorkspaceReady,
  testingEnvironmentGetStatus,
  subscribeToGlobalSettings,
  type WorkspaceRow,
  workspaceGetActive,
} from "@/src/lib/ipc";
import { getActiveWorktreeRows } from "@/lib/utils/worktree/status";

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
  hasDiagnosticsSanityWarning: boolean;
  isHelpOpen: boolean;
  onHelpClick: () => void;
  pageSidebar?: ReactNode | ((args: { collapsed: boolean }) => ReactNode);
};

type GrooveLoadingSpriteProps = {
  mascot: MascotDefinition;
  mascotColorClassName: string;
  isCompact?: boolean;
  shouldShowFrameIndex: boolean;
};

const IDLE_SPRITE_ANIMATION_DURATION_MS = 5_333.3333;
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
const IDLE_CLICK_COUNT_FOR_FALLING = 5;

type GrooveSpriteMode = "idle" | "falling";

type RuntimeStatusRow = {
  opencodeState: "running" | "not-running" | "unknown";
};

let cachedNavigationWorktrees: WorkspaceRow[] = [];
let hasCachedNavigationWorktrees = false;

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

function getIdleFrameIndex(
  elapsedMs: number,
  animationDurationMs: number,
  frameCount: number,
  animationMode: MascotIdleAnimationMode,
): number {
  if (frameCount <= 1) {
    return 0;
  }

  if (animationMode === "forward-loop") {
    const segmentDurationMs = animationDurationMs / frameCount;
    const cycleElapsedMs = elapsedMs % animationDurationMs;
    return Math.floor(cycleElapsedMs / segmentDurationMs);
  }

  const idlePingPongSegmentCount = (frameCount - 1) * 2;
  const segmentDurationMs = animationDurationMs / idlePingPongSegmentCount;
  const cycleElapsedMs = elapsedMs % animationDurationMs;
  const segmentIndex = Math.floor(cycleElapsedMs / segmentDurationMs);

  return segmentIndex <= frameCount - 1
    ? segmentIndex
    : idlePingPongSegmentCount - segmentIndex;
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

function getIsGrooveLoadingSectionDisabledSnapshot(): boolean {
  return isGrooveLoadingSectionDisabled();
}

function GrooveLoadingSprite({ mascot, mascotColorClassName, isCompact = false, shouldShowFrameIndex }: GrooveLoadingSpriteProps) {
  const [, setIdleClickCount] = useState(0);
  const [isPlayingFalling, setIsPlayingFalling] = useState(false);
  const spriteMode: GrooveSpriteMode = isPlayingFalling ? "falling" : "idle";
  const sprite = getMascotSpriteForMode(mascot, spriteMode);
  const animationDurationMs =
    spriteMode === "falling"
        ? FALLING_SPRITE_ANIMATION_DURATION_MS
        : IDLE_SPRITE_ANIMATION_DURATION_MS / (sprite.animationSpeedMultiplier ?? 1);
  const frameStepCount = Math.max(sprite.frameCount, 1);
  const spriteFrameWidthPx = sprite.frameWidthPx;
  const spriteRenderedHeightPx = sprite.renderedHeightPx ?? sprite.frameHeightPx;
  const spriteRenderScale = isCompact ? 1 : (sprite.renderScale ?? 1);
  const spriteRenderedWidthPx = spriteFrameWidthPx * spriteRenderScale;
  const spriteRenderedScaledHeightPx = spriteRenderedHeightPx * spriteRenderScale;
  const [frameIndex, setFrameIndex] = useState(0);
  const shouldRenderFrameIndex = shouldShowFrameIndex && !isCompact;
  const canPlayFallingEasterEgg = mascot.id === DEFAULT_MASCOT_ID;
  const idleAnimationMode = mascot.idleAnimationMode ?? "ping-pong";

  const handleSpriteClick = useCallback(() => {
    if (isPlayingFalling || !canPlayFallingEasterEgg) {
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
  }, [canPlayFallingEasterEgg, isPlayingFalling]);

  useEffect(() => {
    if (!isPlayingFalling) {
      return;
    }

    const fallingAnimationTimeoutId = window.setTimeout(() => {
      setIsPlayingFalling(false);
      setIdleClickCount(0);
    }, FALLING_SPRITE_ANIMATION_DURATION_MS);

    return () => {
      window.clearTimeout(fallingAnimationTimeoutId);
    };
  }, [isPlayingFalling]);

  useEffect(() => {
    setFrameIndex(0);

    let frameIntervalId: number | null = null;
    const startedAtMs = performance.now();
    const frameStepDurationMs = spriteMode === "falling"
      ? FALLING_FRAME_STEP_DURATION_MS
      : animationDurationMs / frameStepCount;

    const updateFrameIndex = () => {
      const elapsedMs = performance.now() - startedAtMs;
      const nextFrameIndex =
        spriteMode === "falling"
            ? getFallingFrameIndex(elapsedMs)
            : getIdleFrameIndex(elapsedMs, animationDurationMs, frameStepCount, idleAnimationMode);
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
  }, [animationDurationMs, frameStepCount, idleAnimationMode, spriteMode]);

  return (
    <div
      className={cn("relative overflow-hidden", isCompact && "h-8 w-8")}
      onClick={handleSpriteClick}
      style={isCompact ? undefined : { height: `${String(spriteRenderedScaledHeightPx)}px`, width: `${String(spriteRenderedWidthPx)}px` }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "groove-loading-sprite",
          mascotColorClassName,
          isCompact && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.3333]",
        )}
        style={{
          width: `${String(spriteRenderedWidthPx)}px`,
          height: `${String(spriteRenderedScaledHeightPx)}px`,
          backgroundColor: "currentColor",
          WebkitMaskImage: `url("${sprite.src}")`,
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: `${String(sprite.frameCount * spriteFrameWidthPx * spriteRenderScale)}px ${String(sprite.frameHeightPx * spriteRenderScale)}px`,
          WebkitMaskPosition: `${String(-frameIndex * spriteFrameWidthPx * spriteRenderScale)}px ${String(sprite.frameYOffsetPx * spriteRenderScale)}px`,
          maskImage: `url("${sprite.src}")`,
          maskRepeat: "no-repeat",
          maskSize: `${String(sprite.frameCount * spriteFrameWidthPx * spriteRenderScale)}px ${String(sprite.frameHeightPx * spriteRenderScale)}px`,
          maskPosition: `${String(-frameIndex * spriteFrameWidthPx * spriteRenderScale)}px ${String(sprite.frameYOffsetPx * spriteRenderScale)}px`,
        }}
      />
      {shouldRenderFrameIndex && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/75 px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground/80">
          frame {frameIndex}
        </span>
      )}
    </div>
  );
}

function getDecodedWorktreeFromPathname(pathname: string): string | null {
  const match = /^\/worktrees\/([^/]+)$/u.exec(pathname);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function AppNavigation({ hasOpenWorkspace, hasDiagnosticsSanityWarning, isHelpOpen, onHelpClick, pageSidebar }: AppNavigationProps) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [navigationWorktrees, setNavigationWorktrees] = useState<WorkspaceRow[]>(() =>
    hasCachedNavigationWorktrees ? cachedNavigationWorktrees : [],
  );
  const shouldShowFps = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsShowFpsEnabledSnapshot,
    getIsShowFpsEnabledSnapshot,
  );
  const shouldHideGrooveLoadingSection = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsGrooveLoadingSectionDisabledSnapshot,
    getIsGrooveLoadingSectionDisabledSnapshot,
  );

  const isHomeActive = pathname === "/";
  const isWorktreesActive = pathname === "/worktrees" || pathname.startsWith("/worktrees/");
  const isDiagnosticsActive = pathname === "/diagnostics";
  const isSettingsActive = pathname === "/settings";
  const isHelpActive = isHelpOpen;
  const homeLabel = hasOpenWorkspace ? "Dashboard" : "Home";
  const appNameLabel = "GROOVE";
  const hasActiveNavigationWorktrees = navigationWorktrees.length > 0;
  const inspectedWorktree = useMemo(() => {
    const worktreeFromRoute = getDecodedWorktreeFromPathname(pathname);
    if (!worktreeFromRoute) {
      return null;
    }

    return navigationWorktrees.find((workspaceRow) => workspaceRow.worktree === worktreeFromRoute) ?? null;
  }, [navigationWorktrees, pathname]);
  const mascotDisplay = useMemo(() => {
    if (!inspectedWorktree) {
      return {
        mascot: getDefaultMascotAssignment().mascot,
        mascotColorClassName: "text-foreground",
      };
    }

    const mascotAssignment = getWorktreeMascotAssignment(inspectedWorktree.worktree);
    return {
      mascot: mascotAssignment.mascot,
      mascotColorClassName: getMascotColorClassNames(mascotAssignment.color),
    };
  }, [inspectedWorktree]);
  const refreshNavigationWorktrees = useCallback(async () => {
    if (!hasOpenWorkspace) {
      setNavigationWorktrees([]);
      cachedNavigationWorktrees = [];
      hasCachedNavigationWorktrees = false;
      return;
    }

    try {
      const workspaceResult = await workspaceGetActive();
      if (!workspaceResult.ok) {
        setNavigationWorktrees([]);
        return;
      }

      const workspaceRows = normalizeWorkspaceRows((workspaceResult as { rows?: unknown }).rows);
      if (workspaceRows.length === 0) {
        setNavigationWorktrees([]);
        cachedNavigationWorktrees = [];
        hasCachedNavigationWorktrees = true;
        return;
      }

      const knownWorktrees = workspaceRows
        .filter((workspaceRow) => workspaceRow.status !== "deleted")
        .map((workspaceRow) => workspaceRow.worktree);

      const runtimeResult = await grooveList({
        rootName: workspaceResult.workspaceMeta?.rootName,
        knownWorktrees,
        workspaceMeta: workspaceResult.workspaceMeta,
      }, {
        intent: "background",
      });

      const runtimeRowsByWorktree = runtimeResult.ok && runtimeResult.rows && typeof runtimeResult.rows === "object"
        ? Object.entries(runtimeResult.rows).reduce<Record<string, RuntimeStatusRow | undefined>>((rowsByWorktree, [worktree, row]) => {
          rowsByWorktree[worktree] = toRuntimeStatusRow(row);
          return rowsByWorktree;
        }, {})
        : {};

      let testingRunningWorktrees: string[] = [];
      if (workspaceResult.workspaceMeta?.rootName) {
        const testingEnvironmentResult = await testingEnvironmentGetStatus({
          rootName: workspaceResult.workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta: workspaceResult.workspaceMeta,
        });

        testingRunningWorktrees = testingEnvironmentResult.ok
          ? testingEnvironmentResult.environments
            .filter((environment) => environment.status === "running")
            .map((environment) => environment.worktree)
          : [];
      }

      const activeRows = getActiveWorktreeRows(workspaceRows, runtimeRowsByWorktree, testingRunningWorktrees);
      setNavigationWorktrees(activeRows);
      cachedNavigationWorktrees = activeRows;
      hasCachedNavigationWorktrees = true;
    } catch {
      setNavigationWorktrees([]);
      cachedNavigationWorktrees = [];
      hasCachedNavigationWorktrees = true;
    }
  }, [hasOpenWorkspace]);

  useEffect(() => {
    syncActiveWorktreeMascotAssignments(navigationWorktrees.map((workspaceRow) => workspaceRow.worktree));
  }, [navigationWorktrees]);

  useEffect(() => {
    if (!hasOpenWorkspace) {
      setNavigationWorktrees([]);
      return;
    }

    if (hasCachedNavigationWorktrees) {
      setNavigationWorktrees(cachedNavigationWorktrees);
      return;
    }

    void refreshNavigationWorktrees();
  }, [hasOpenWorkspace, refreshNavigationWorktrees]);

  useEffect(() => {
    if (!hasOpenWorkspace) {
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

    void (async () => {
      try {
        const [unlistenReady, unlistenChange, unlistenTerminalLifecycle] = await Promise.all([
          listenWorkspaceReady(() => {
            void refreshNavigationWorktrees();
          }),
          listenWorkspaceChange(() => {
            void refreshNavigationWorktrees();
          }),
          listenGrooveTerminalLifecycle(() => {
            void refreshNavigationWorktrees();
          }),
        ]);

        if (isClosed) {
          unlistenReady();
          unlistenChange();
          unlistenTerminalLifecycle();
          return;
        }

        unlistenHandlers.push(unlistenReady, unlistenChange, unlistenTerminalLifecycle);

      } catch {
        cleanupListeners();
      }
    })();

    return () => {
      isClosed = true;
      cleanupListeners();
    };
  }, [hasOpenWorkspace, refreshNavigationWorktrees]);

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
            {!shouldHideGrooveLoadingSection && (
              <div className="flex items-center justify-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "flex shrink-0 items-center justify-center overflow-hidden rounded-sm border",
                          isSidebarCollapsed ? "h-12 w-12" : "h-[128px] w-[144px]",
                        )}
                      >
                        <GrooveLoadingSprite
                          mascot={mascotDisplay.mascot}
                          mascotColorClassName={mascotDisplay.mascotColorClassName}
                          isCompact={isSidebarCollapsed}
                          shouldShowFrameIndex={shouldShowFps}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">{mascotDisplay.mascot.name}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
            <div className={cn("flex items-center justify-between gap-2", !shouldHideGrooveLoadingSection && "mt-4")}>
              {!isSidebarCollapsed && (
                <div className="px-2">
                  <span className="block max-w-[10rem] truncate text-sm font-bold text-foreground" title={appNameLabel}>{appNameLabel}</span>
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
                {hasOpenWorkspace && hasActiveNavigationWorktrees && (
                  <>
                    <Link
                      to="/worktrees"
                      className={sidebarMenuButtonClassName({
                        isActive: isWorktreesActive,
                        collapsed: isSidebarCollapsed,
                      })}
                      onClick={() => {
                        recordNavigationStart("/worktrees");
                      }}
                    >
                      <GitBranch aria-hidden="true" className="size-4 shrink-0" />
                      {!isSidebarCollapsed && <span>Worktrees</span>}
                    </Link>
                    {!isSidebarCollapsed ? (
                      <div className="ml-2 grid gap-1 border-l border-border/70 pl-2">
                        {navigationWorktrees.map((worktreeRow) => {
                          const worktreeRoute = `/worktrees/${encodeURIComponent(worktreeRow.worktree)}`;
                          const mascotAssignment = getWorktreeMascotAssignment(worktreeRow.worktree);
                          const worktreeColorClassName = getMascotColorClassNames(mascotAssignment.color);

                          return (
                            <Link
                              key={worktreeRow.path}
                              to={worktreeRoute}
                              className={sidebarMenuButtonClassName({
                                isActive: pathname === worktreeRoute,
                                collapsed: false,
                                className: "h-8 text-xs",
                              })}
                              onClick={() => {
                                recordNavigationStart(worktreeRoute);
                              }}
                              title={worktreeRow.worktree}
                            >
                              <TreePalm aria-hidden="true" className={cn("size-3.5 shrink-0", worktreeColorClassName)} />
                              <span className="truncate">{worktreeRow.worktree}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                )}
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
                    <ActivitySquare
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        hasDiagnosticsSanityWarning && isSidebarCollapsed && "text-amber-600",
                      )}
                    />
                    {!isSidebarCollapsed && <span>Diagnostics</span>}
                    {hasDiagnosticsSanityWarning && !isSidebarCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto inline-flex text-amber-600">
                            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>A sanity check has failed</TooltipContent>
                      </Tooltip>
                    ) : null}
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
              {hasOpenWorkspace && hasActiveNavigationWorktrees && (
                <>
                  <Link
                    to="/worktrees"
                    className={sidebarMenuButtonClassName({ isActive: isWorktreesActive })}
                    onClick={() => {
                      recordNavigationStart("/worktrees");
                      setIsMobileSidebarOpen(false);
                    }}
                  >
                    <GitBranch aria-hidden="true" className="size-4 shrink-0" />
                    <span>Worktrees</span>
                  </Link>
                  <div className="ml-2 grid gap-1 border-l border-border/70 pl-2">
                    {navigationWorktrees.map((worktreeRow) => {
                      const worktreeRoute = `/worktrees/${encodeURIComponent(worktreeRow.worktree)}`;
                      const mascotAssignment = getWorktreeMascotAssignment(worktreeRow.worktree);
                      const worktreeColorClassName = getMascotColorClassNames(mascotAssignment.color);

                      return (
                        <Link
                          key={worktreeRow.path}
                          to={worktreeRoute}
                          className={sidebarMenuButtonClassName({
                            isActive: pathname === worktreeRoute,
                            className: "h-8 text-xs",
                          })}
                          onClick={() => {
                            recordNavigationStart(worktreeRoute);
                            setIsMobileSidebarOpen(false);
                          }}
                          title={worktreeRow.worktree}
                        >
                          <TreePalm aria-hidden="true" className={cn("size-3.5 shrink-0", worktreeColorClassName)} />
                          <span className="truncate">{worktreeRow.worktree}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
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
                    {hasDiagnosticsSanityWarning ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto inline-flex text-amber-600">
                            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>A sanity check has failed</TooltipContent>
                      </Tooltip>
                    ) : null}
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
