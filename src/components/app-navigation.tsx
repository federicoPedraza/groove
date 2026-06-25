"use client";

import { Link, useLocation } from "react-router-dom";
import { PanelLeft, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  Sidebar,
  SidebarCollapseButton,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  sidebarMenuButtonClassName,
} from "@/src/components/ui/sidebar";
import { WorkspaceDirectoryControls } from "@/src/components/pages/workspace-directory-controls";
import { SidebarGoldCounter } from "@/src/components/sidebar-gold-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useGrooveBusiness } from "@/src/lib/groove-business";
import { cn } from "@/src/lib/utils";
import {
  getNotifiedWorktreesSnapshot,
  subscribeToNotifiedWorktrees,
} from "@/src/lib/utils/notified-worktrees";
import {
  DEFAULT_MASCOT_ID,
  getMascotColorClassNames,
  getDefaultMascotAssignment,
  getMascotSpriteForMode,
  getWorktreeMascotAssignment,
  syncActiveWorktreeMascotAssignments,
  type MascotIdleAnimationMode,
  type MascotDefinition,
} from "@/src/lib/utils/mascots";
import {
  DEFAULT_WORKTREE_STATE,
  isGrooveBusinessDisabled,
  isMascotHidden,
  isShowFpsEnabled,
  isTelemetryEnabled,
  listenGrooveTerminalLifecycle,
  listenWorkspaceChange,
  listenWorkspaceReady,
  subscribeToGlobalSettings,
  type WorkspaceRow,
  type WorktreeState,
  workspaceSetWorktreeState,
} from "@/src/lib/ipc";
import { WorktreeStateContextMenu } from "@/src/components/pages/barracks/state-selector";
import {
  getWorktreeStateIcon,
  getWorktreeStateIconColorClass,
  getWorktreeStateTitle,
} from "@/src/components/pages/barracks/worktree-state";
import { toast } from "@/src/lib/toast";
import { getActiveWorktreeRows } from "@/src/lib/utils/worktree/status";
import {
  applyOptimisticWorktreeState,
  ensureWorkspaceContext,
  getWorkspaceContextStoreSnapshot,
  refreshActiveTerminalWorktrees,
  refreshWorkspaceContext,
  subscribeToWorkspaceContextStore,
  type WorkspaceContextStoreSnapshot,
} from "@/src/lib/workspace-store";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const NAVIGATION_START_MARKER_KEY = "__grooveNavigationTelemetryStart";

type NavigationStartMarker = {
  from: string;
  to: string;
  startedAtUnixMs: number;
  startedAtPerfMs: number;
};

function setNavigationStartMarker(marker: NavigationStartMarker): void {
  (
    window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker }
  )[NAVIGATION_START_MARKER_KEY] = marker;
}

function clearNavigationStartMarker(): void {
  delete (
    window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker }
  )[NAVIGATION_START_MARKER_KEY];
}

type AppNavigationProps = {
  hasOpenWorkspace: boolean;
  hasDiagnosticsSanityWarning: boolean;
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
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 17, 14, 17, 14, 17,
  14, 17, 14, 17, 14, 17, 14, 17,
] as const;
const FALLING_SPRITE_ANIMATION_DURATION_MS =
  FALLING_FIRST_FRAME_HOLD_MS +
  FALLING_FRAME_SEQUENCE.length * FALLING_FRAME_STEP_DURATION_MS;
const IDLE_CLICK_COUNT_FOR_FALLING = 5;

type GrooveSpriteMode = "idle" | "falling";

function deriveNavigationDataFromStore(
  snapshot: WorkspaceContextStoreSnapshot,
): {
  rows: WorkspaceRow[];
  states: Record<string, WorktreeState>;
} {
  const context = snapshot.context;
  const rows = normalizeWorkspaceRows(
    (context as { rows?: unknown } | null)?.rows,
  );
  const records = context?.workspaceMeta?.worktreeRecords ?? {};
  const states: Record<string, WorktreeState> = {};
  for (const [worktreeName, record] of Object.entries(records)) {
    states[worktreeName] = record.state ?? DEFAULT_WORKTREE_STATE;
  }
  const knownActiveRows = getActiveWorktreeRows(
    rows,
    snapshot.activeTerminalWorktrees,
  );
  return { rows: knownActiveRows, states };
}

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
    Math.floor(
      (elapsedMs - FALLING_FIRST_FRAME_HOLD_MS) /
        FALLING_FRAME_STEP_DURATION_MS,
    ),
    FALLING_FRAME_SEQUENCE.length - 1,
  );
  return FALLING_FRAME_SEQUENCE[sequenceIndex];
}

function getIsShowFpsEnabledSnapshot(): boolean {
  return isShowFpsEnabled();
}

function getIsMascotHiddenSnapshot(): boolean {
  return isMascotHidden();
}

function getIsGamificationHiddenSnapshot(): boolean {
  return isGrooveBusinessDisabled();
}

function GrooveLoadingSprite({
  mascot,
  mascotColorClassName,
  isCompact = false,
  shouldShowFrameIndex,
}: GrooveLoadingSpriteProps) {
  const [, setIdleClickCount] = useState(0);
  const [isPlayingFalling, setIsPlayingFalling] = useState(false);
  const spriteMode: GrooveSpriteMode = isPlayingFalling ? "falling" : "idle";
  const sprite = getMascotSpriteForMode(mascot, spriteMode);
  const animationDurationMs =
    spriteMode === "falling"
      ? FALLING_SPRITE_ANIMATION_DURATION_MS
      : IDLE_SPRITE_ANIMATION_DURATION_MS /
        (sprite.animationSpeedMultiplier ?? 1);
  const frameStepCount = Math.max(sprite.frameCount, 1);
  const spriteFrameWidthPx = sprite.frameWidthPx;
  const spriteRenderedHeightPx =
    sprite.renderedHeightPx ?? sprite.frameHeightPx;
  const spriteRenderScale = isCompact ? 1 : (sprite.renderScale ?? 1);
  const spriteRenderedWidthPx = spriteFrameWidthPx * spriteRenderScale;
  const spriteRenderedScaledHeightPx =
    spriteRenderedHeightPx * spriteRenderScale;
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
    const frameStepDurationMs =
      spriteMode === "falling"
        ? FALLING_FRAME_STEP_DURATION_MS
        : animationDurationMs / frameStepCount;

    const updateFrameIndex = () => {
      const elapsedMs = performance.now() - startedAtMs;
      const nextFrameIndex =
        spriteMode === "falling"
          ? getFallingFrameIndex(elapsedMs)
          : getIdleFrameIndex(
              elapsedMs,
              animationDurationMs,
              frameStepCount,
              idleAnimationMode,
            );
      setFrameIndex((previousFrameIndex) =>
        previousFrameIndex === nextFrameIndex
          ? previousFrameIndex
          : nextFrameIndex,
      );
    };

    const firstTickDelayMs = Math.max(
      0,
      frameStepDurationMs -
        ((performance.now() - startedAtMs) % frameStepDurationMs),
    );
    const frameTimeoutId = window.setTimeout(() => {
      updateFrameIndex();
      frameIntervalId = window.setInterval(
        updateFrameIndex,
        frameStepDurationMs,
      );
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
      style={
        isCompact
          ? undefined
          : {
              height: `${String(spriteRenderedScaledHeightPx)}px`,
              width: `${String(spriteRenderedWidthPx)}px`,
            }
      }
    >
      <div
        aria-hidden="true"
        className={cn(
          "groove-loading-sprite",
          mascotColorClassName,
          isCompact &&
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.3333]",
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
        <span className="pointer-events-none absolute bottom-1 right-1 rounded-[3px] bg-background/75 px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground/80">
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

function AppNavigation({
  hasOpenWorkspace,
  hasDiagnosticsSanityWarning,
  pageSidebar,
}: AppNavigationProps) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const workspaceContextStoreSnapshot = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );
  const { rows: navigationWorktrees, states: navigationWorktreeStates } =
    useMemo(
      () => deriveNavigationDataFromStore(workspaceContextStoreSnapshot),
      [workspaceContextStoreSnapshot],
    );
  const shouldShowFps = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsShowFpsEnabledSnapshot,
    getIsShowFpsEnabledSnapshot,
  );
  const isMascotHiddenState = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsMascotHiddenSnapshot,
    getIsMascotHiddenSnapshot,
  );
  const isGamificationHidden = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsGamificationHiddenSnapshot,
    getIsGamificationHiddenSnapshot,
  );
  const grooveBusiness = useGrooveBusiness();
  const WildernessIcon = grooveBusiness.Icon("wilderness");
  const BarracksIcon = grooveBusiness.Icon("barracks");
  const SituationRoomIcon = grooveBusiness.Icon("situationRoom");
  const BestiaryIcon = grooveBusiness.Icon("bestiary");
  const InventoryIcon = grooveBusiness.Icon("inventory");
  const StrongholdIcon = grooveBusiness.Icon("stronghold");

  const isHomeActive = pathname === "/";
  const isDiagnosticsActive = pathname === "/diagnostics";
  const isBestiaryActive = pathname === "/bestiary";
  const isInventoryActive = pathname === "/inventory";
  const isSettingsActive = pathname === "/settings";

  const homeLabel = hasOpenWorkspace
    ? grooveBusiness.label("barracks")
    : grooveBusiness.label("home");
  const goldCount =
    workspaceContextStoreSnapshot.context?.workspaceMeta?.gold ?? 0;
  const isGoldReady = workspaceContextStoreSnapshot.context != null;
  const hasActiveNavigationWorktrees = navigationWorktrees.length > 0;
  const notifiedWorktrees = useSyncExternalStore(
    subscribeToNotifiedWorktrees,
    getNotifiedWorktreesSnapshot,
    getNotifiedWorktreesSnapshot,
  );
  const navigationWorktreeItems = useMemo(() => {
    return navigationWorktrees.map((workspaceRow) => ({
      workspaceRow,
      displayLabel: workspaceRow.branchGuess || workspaceRow.worktree,
      titleLabel: workspaceRow.branchGuess || workspaceRow.worktree,
    }));
  }, [navigationWorktrees]);
  const inspectedWorktree = useMemo(() => {
    const worktreeFromRoute = getDecodedWorktreeFromPathname(pathname);
    if (!worktreeFromRoute) {
      return null;
    }

    return (
      navigationWorktrees.find(
        (workspaceRow) => workspaceRow.worktree === worktreeFromRoute,
      ) ?? null
    );
  }, [navigationWorktrees, pathname]);
  const mascotDisplay = useMemo(() => {
    if (!inspectedWorktree) {
      return {
        mascot: getDefaultMascotAssignment().mascot,
        mascotColorClassName: "text-foreground",
      };
    }

    const mascotAssignment = getWorktreeMascotAssignment(
      inspectedWorktree.worktree,
    );
    return {
      mascot: mascotAssignment.mascot,
      mascotColorClassName: getMascotColorClassNames(mascotAssignment.color),
    };
  }, [inspectedWorktree]);
  const refreshNavigationWorktrees = useCallback(
    async (options?: { force?: boolean }) => {
      if (!hasOpenWorkspace) {
        return;
      }
      try {
        const workspaceResult = options?.force
          ? await refreshWorkspaceContext()
          : await ensureWorkspaceContext();
        if (
          !workspaceResult ||
          !workspaceResult.ok ||
          !workspaceResult.workspaceMeta
        ) {
          return;
        }
        const workspaceRows = normalizeWorkspaceRows(
          (workspaceResult as { rows?: unknown }).rows,
        );
        const knownWorktrees = workspaceRows
          .filter((workspaceRow) => workspaceRow.status !== "deleted")
          .map((workspaceRow) => workspaceRow.worktree);
        if (knownWorktrees.length === 0) {
          return;
        }
        await refreshActiveTerminalWorktrees({
          workspaceMeta: workspaceResult.workspaceMeta,
          knownWorktrees,
        });
      } catch {
        /* swallow — store keeps the previous snapshot */
      }
    },
    [hasOpenWorkspace],
  );

  useEffect(() => {
    syncActiveWorktreeMascotAssignments(
      navigationWorktrees.map((workspaceRow) => workspaceRow.worktree),
    );
  }, [navigationWorktrees]);

  const refreshNavigationWorktreesRef = useRef(refreshNavigationWorktrees);
  refreshNavigationWorktreesRef.current = refreshNavigationWorktrees;

  const handleSetNavigationWorktreeState = useCallback(
    (worktree: string, state: WorktreeState) => {
      applyOptimisticWorktreeState(worktree, state);
      void workspaceSetWorktreeState({ worktree, state })
        .then((response) => {
          if (!response.ok) {
            toast.error(response.error ?? "Failed to update worktree state.");
          }
          void refreshNavigationWorktreesRef.current({ force: true });
        })
        .catch(() => {
          toast.error("Failed to update worktree state.");
          void refreshNavigationWorktreesRef.current({ force: true });
        });
    },
    [],
  );

  useEffect(() => {
    if (!hasOpenWorkspace) {
      return;
    }
    void refreshNavigationWorktreesRef.current();
  }, [hasOpenWorkspace]);

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
        const [unlistenReady, unlistenChange, unlistenTerminalLifecycle] =
          await Promise.all([
            listenWorkspaceReady(() => {
              void refreshNavigationWorktreesRef.current({ force: true });
            }),
            listenWorkspaceChange(() => {
              void refreshNavigationWorktreesRef.current({ force: true });
            }),
            listenGrooveTerminalLifecycle(() => {
              void refreshNavigationWorktreesRef.current({ force: true });
            }),
          ]);

        if (isClosed) {
          unlistenReady();
          unlistenChange();
          unlistenTerminalLifecycle();
          return;
        }

        unlistenHandlers.push(
          unlistenReady,
          unlistenChange,
          unlistenTerminalLifecycle,
        );
      } catch {
        cleanupListeners();
      }
    })();

    return () => {
      isClosed = true;
      cleanupListeners();
    };
  }, [hasOpenWorkspace]);

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
    typeof pageSidebar === "function"
      ? pageSidebar({ collapsed: isSidebarCollapsed })
      : pageSidebar;

  return (
    <>
      <div className="groove-hide-scrollbar hidden shrink-0 md:sticky md:top-4 md:flex md:max-h-[calc(100vh-2rem)] md:flex-col md:gap-4 md:self-start md:overflow-y-auto">
        <Sidebar collapsed={isSidebarCollapsed}>
          <SidebarHeader>
            {/* Mascot hides only when "hide gamification" or "hide mascot" is set. */}
            {!isMascotHiddenState && (
              <div className="flex items-center justify-center">
                <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center overflow-hidden rounded-sm border",
                        isSidebarCollapsed
                          ? "h-12 w-12"
                          : "h-[128px] w-[144px]",
                      )}
                    >
                      <GrooveLoadingSprite
                        mascot={mascotDisplay.mascot}
                        mascotColorClassName={
                          mascotDisplay.mascotColorClassName
                        }
                        isCompact={isSidebarCollapsed}
                        shouldShowFrameIndex={shouldShowFps}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {mascotDisplay.mascot.name}
                  </TooltipContent>
                </Tooltip>
                </TooltipProvider>
              </div>
            )}
            <div
              className={cn(
                "flex items-center justify-between gap-2",
                !isMascotHiddenState && "mt-4",
              )}
            >
              {isGamificationHidden ? (
                <div
                  className={cn(
                    "font-display flex items-center text-base font-bold tracking-[0.18em] text-foreground",
                    isSidebarCollapsed ? "justify-center px-0" : "px-2",
                  )}
                  aria-label="Groove"
                >
                  {isSidebarCollapsed ? "G" : "GROOVE"}
                </div>
              ) : (
                <SidebarGoldCounter
                  gold={goldCount}
                  collapsed={isSidebarCollapsed}
                  ready={isGoldReady}
                />
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
                    <div
                      className={cn(
                        "flex h-10 items-center gap-2 overflow-hidden rounded-md px-4 text-sm font-medium text-foreground",
                        isSidebarCollapsed && "justify-center px-0",
                      )}
                    >
                      <WildernessIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      {!isSidebarCollapsed && (
                        <span>{grooveBusiness.label("wilderness")}</span>
                      )}
                    </div>
                    {!isSidebarCollapsed ? (
                      <div className="ml-1 grid gap-1 border-l border-border-strong pl-1">
                        {navigationWorktreeItems.map(
                          ({ workspaceRow, displayLabel, titleLabel }) => {
                            const worktreeRoute = `/worktrees/${encodeURIComponent(workspaceRow.worktree)}`;
                            const currentState =
                              navigationWorktreeStates[workspaceRow.worktree] ??
                              DEFAULT_WORKTREE_STATE;

                            return (
                              <WorktreeStateContextMenu
                                key={workspaceRow.path}
                                worktree={workspaceRow.worktree}
                                currentState={currentState}
                                onSelect={(nextState) => {
                                  handleSetNavigationWorktreeState(
                                    workspaceRow.worktree,
                                    nextState,
                                  );
                                }}
                              >
                                <Link
                                  to={worktreeRoute}
                                  className={sidebarMenuButtonClassName({
                                    isActive: pathname === worktreeRoute,
                                    collapsed: false,
                                    className: "h-8 text-xs",
                                  })}
                                  onClick={() => {
                                    recordNavigationStart(worktreeRoute);
                                  }}
                                  title={titleLabel}
                                >
                                  <span
                                    className={cn(
                                      "relative inline-flex shrink-0 items-center justify-center [&>svg]:size-3.5",
                                      getWorktreeStateIconColorClass(
                                        currentState,
                                      ),
                                    )}
                                    title={getWorktreeStateTitle(currentState)}
                                  >
                                    {getWorktreeStateIcon(
                                      currentState,
                                      grooveBusiness.mode,
                                    )}
                                    {notifiedWorktrees.has(
                                      workspaceRow.worktree,
                                    ) && (
                                      <span className="absolute -right-1 -top-1 size-2 rounded-full bg-red-500" />
                                    )}
                                  </span>
                                  <span className="truncate">
                                    {displayLabel}
                                  </span>
                                </Link>
                              </WorktreeStateContextMenu>
                            );
                          },
                        )}
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
                  <BarracksIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
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
                    <SituationRoomIcon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        hasDiagnosticsSanityWarning &&
                          isSidebarCollapsed &&
                          "text-amber-600",
                      )}
                    />
                    {!isSidebarCollapsed && (
                      <span>{grooveBusiness.label("situationRoom")}</span>
                    )}
                    {hasDiagnosticsSanityWarning && !isSidebarCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto inline-flex text-amber-600">
                            <TriangleAlert
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          A sanity check has failed
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </Link>
                )}
                {hasOpenWorkspace && !grooveBusiness.isBusiness && (
                  <Link
                    to="/bestiary"
                    className={sidebarMenuButtonClassName({
                      isActive: isBestiaryActive,
                      collapsed: isSidebarCollapsed,
                    })}
                    onClick={() => {
                      recordNavigationStart("/bestiary");
                    }}
                  >
                    <BestiaryIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    {!isSidebarCollapsed && (
                      <span>{grooveBusiness.label("bestiary")}</span>
                    )}
                  </Link>
                )}
                {hasOpenWorkspace && !isGamificationHidden && (
                  <Link
                    to="/inventory"
                    className={sidebarMenuButtonClassName({
                      isActive: isInventoryActive,
                      collapsed: isSidebarCollapsed,
                    })}
                    onClick={() => {
                      recordNavigationStart("/inventory");
                    }}
                  >
                    <InventoryIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    {!isSidebarCollapsed && (
                      <span>{grooveBusiness.label("inventory")}</span>
                    )}
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
                  <StrongholdIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  {!isSidebarCollapsed && (
                    <span>{grooveBusiness.label("stronghold")}</span>
                  )}
                </Link>
              </SidebarMenu>
            </TooltipProvider>
          </SidebarContent>
        </Sidebar>
        <WorkspaceDirectoryControls collapsed={isSidebarCollapsed} />
        {resolvedPageSidebar}
      </div>

      <Collapsible
        open={isMobileSidebarOpen}
        onOpenChange={setIsMobileSidebarOpen}
        className="rounded-lg border bg-card p-2 md:hidden"
      >
        <CollapsibleTrigger className="inline-flex h-9 w-full items-center justify-start gap-2 rounded-[3px] px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none">
          <PanelLeft aria-hidden="true" className="size-4" />
          <span>Navigation</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <TooltipProvider>
            <SidebarMenu>
              {hasOpenWorkspace && hasActiveNavigationWorktrees && (
                <>
                  <div className="flex h-10 items-center gap-2 overflow-hidden rounded-md px-4 text-sm font-medium text-foreground">
                    <WildernessIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span>{grooveBusiness.label("wilderness")}</span>
                  </div>
                  <div className="ml-1 grid gap-1 border-l border-border/70 pl-1">
                    {navigationWorktreeItems.map(
                      ({ workspaceRow, displayLabel, titleLabel }) => {
                        const worktreeRoute = `/worktrees/${encodeURIComponent(workspaceRow.worktree)}`;
                        const currentState =
                          navigationWorktreeStates[workspaceRow.worktree] ??
                          DEFAULT_WORKTREE_STATE;

                        return (
                          <WorktreeStateContextMenu
                            key={workspaceRow.path}
                            worktree={workspaceRow.worktree}
                            currentState={currentState}
                            onSelect={(nextState) => {
                              handleSetNavigationWorktreeState(
                                workspaceRow.worktree,
                                nextState,
                              );
                            }}
                          >
                            <Link
                              to={worktreeRoute}
                              className={sidebarMenuButtonClassName({
                                isActive: pathname === worktreeRoute,
                                className: "h-8 text-xs",
                              })}
                              onClick={() => {
                                recordNavigationStart(worktreeRoute);
                                setIsMobileSidebarOpen(false);
                              }}
                              title={titleLabel}
                            >
                              <span
                                className={cn(
                                  "relative inline-flex shrink-0 items-center justify-center [&>svg]:size-3.5",
                                  getWorktreeStateIconColorClass(currentState),
                                )}
                                title={getWorktreeStateTitle(currentState)}
                              >
                                {getWorktreeStateIcon(
                                  currentState,
                                  grooveBusiness.mode,
                                )}
                                {notifiedWorktrees.has(
                                  workspaceRow.worktree,
                                ) && (
                                  <span className="absolute -right-1 -top-1 size-2 rounded-full bg-red-500" />
                                )}
                              </span>
                              <span className="truncate">{displayLabel}</span>
                            </Link>
                          </WorktreeStateContextMenu>
                        );
                      },
                    )}
                  </div>
                </>
              )}
              <Link
                to="/"
                className={sidebarMenuButtonClassName({
                  isActive: isHomeActive,
                })}
                onClick={() => {
                  recordNavigationStart("/");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <BarracksIcon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                />
                <span>{homeLabel}</span>
              </Link>
              {hasOpenWorkspace && (
                <Link
                  to="/diagnostics"
                  className={sidebarMenuButtonClassName({
                    isActive: isDiagnosticsActive,
                  })}
                  onClick={() => {
                    recordNavigationStart("/diagnostics");
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  <SituationRoomIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  <span>{grooveBusiness.label("situationRoom")}</span>
                  {hasDiagnosticsSanityWarning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-auto inline-flex text-amber-600">
                          <TriangleAlert
                            aria-hidden="true"
                            className="size-3.5 shrink-0"
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>A sanity check has failed</TooltipContent>
                    </Tooltip>
                  ) : null}
                </Link>
              )}
              {hasOpenWorkspace && !grooveBusiness.isBusiness && (
                <Link
                  to="/bestiary"
                  className={sidebarMenuButtonClassName({
                    isActive: isBestiaryActive,
                  })}
                  onClick={() => {
                    recordNavigationStart("/bestiary");
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  <BestiaryIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  <span>{grooveBusiness.label("bestiary")}</span>
                </Link>
              )}
              {hasOpenWorkspace && !isGamificationHidden && (
                <Link
                  to="/inventory"
                  className={sidebarMenuButtonClassName({
                    isActive: isInventoryActive,
                  })}
                  onClick={() => {
                    recordNavigationStart("/inventory");
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  <InventoryIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  <span>{grooveBusiness.label("inventory")}</span>
                </Link>
              )}
              <Link
                to="/settings"
                className={sidebarMenuButtonClassName({
                  isActive: isSettingsActive,
                })}
                onClick={() => {
                  recordNavigationStart("/settings");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <StrongholdIcon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                />
                <span>{grooveBusiness.label("stronghold")}</span>
              </Link>
            </SidebarMenu>
          </TooltipProvider>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

export { AppNavigation };
