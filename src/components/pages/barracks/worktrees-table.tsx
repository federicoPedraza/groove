import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  Copy,
  ListFilter,
  Octagon,
  ScrollText,
  Search,
  Shield,
  ShieldQuestionMark,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  WorktreeStateContextMenu,
  WorktreeStateDropdownMenu,
} from "@/src/components/pages/barracks/state-selector";
import {
  getWorktreeStateIcon,
  getWorktreeStateIconColorClass,
} from "@/src/components/pages/barracks/worktree-state";
import {
  getWorktreeUnitBadgeClasses,
  getWorktreeUnitKindIcon,
  getWorktreeUnitLevelIcon,
  getWorktreeUnitTitle,
} from "@/src/components/pages/barracks/worktree-unit";
import { BountyBadge } from "@/src/components/pages/barracks/bounty-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { WorktreeRowActions } from "@/src/components/pages/barracks/worktree-row-actions";
import {
  getWorktreeStatusBadgeClasses,
  getWorktreeStatusIcon,
  getWorktreeStatusTitle,
} from "@/src/components/pages/barracks/worktree-status";
import type {
  WorktreeRow,
  WorktreeState,
} from "@/src/components/pages/barracks/types";
import {
  DEFAULT_WORKTREE_STATE,
  WORKTREE_STATES,
  isGrooveBusinessDisabled,
  subscribeToGlobalSettings,
  type WorktreeUnit,
} from "@/src/lib/ipc";
import {
  resolveWorktreeStateLabel,
  useGrooveBusiness,
} from "@/src/lib/groove-business";
import { cn } from "@/src/lib/utils";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  deriveWorktreeStatus,
  type WorktreeStatus,
} from "@/src/lib/utils/worktree/status";
import type { GroupedWorktreeItem } from "@/src/lib/utils/time/grouping";
import type { SummaryRecord } from "@/src/lib/ipc";

function getIsGrooveBusinessDisabledSnapshot(): boolean {
  return isGrooveBusinessDisabled();
}

const ALWAYS_EXPANDED_SECTION_LABELS = new Set(["today", "ungrouped"]);
const DEFAULT_COLLAPSED_SECTION_LABELS = new Set(["deleted worktrees"]);

type SortMode = "date" | "status" | "groove";

const SORT_OPTIONS: Array<{
  value: SortMode;
  label: string;
  icon: LucideIcon;
  iconColorClass: string;
}> = [
  {
    value: "date",
    label: "Date",
    icon: CalendarDays,
    iconColorClass: "text-sky-500",
  },
  {
    value: "status",
    label: "Status",
    icon: Shield,
    iconColorClass: "text-violet-500",
  },
  {
    value: "groove",
    label: "Groove state",
    icon: Octagon,
    iconColorClass: "text-emerald-500",
  },
];

const SORT_MODE_STORAGE_KEY = "groove:worktrees-sort-mode";

function readStoredSortMode(): SortMode {
  if (typeof window === "undefined") {
    return "date";
  }
  try {
    const raw = window.localStorage.getItem(SORT_MODE_STORAGE_KEY);
    return SORT_OPTIONS.some((option) => option.value === raw)
      ? (raw as SortMode)
      : "date";
  } catch {
    return "date";
  }
}

function writeStoredSortMode(mode: SortMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
  } catch {
    // Persisting the sort preference is best-effort.
  }
}

const GROOVE_STATUS_ORDER: WorktreeStatus[] = ["ready", "paused", "corrupted"];

const GROOVE_STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  paused: "Paused",
  corrupted: "Corrupted",
};

function shouldCollapseSectionByDefault(
  label: string,
  isFirstActiveSection: boolean,
): boolean {
  const normalized = label.trim().toLowerCase();
  if (ALWAYS_EXPANDED_SECTION_LABELS.has(normalized)) {
    return false;
  }
  if (DEFAULT_COLLAPSED_SECTION_LABELS.has(normalized)) {
    return true;
  }
  // Fallback: expand the first non-deleted section so the user always sees
  // *some* worktrees on first paint (e.g., "Yesterday" if there's nothing
  // for today). Everything else stays collapsed and renders no rows until
  // the section is expanded.
  return !isFirstActiveSection;
}

type WorktreesTableProps = {
  groupedWorktreeItems: GroupedWorktreeItem[];
  copiedBranchPath: string | null;
  pendingRestoreActions: string[];
  pendingCutGrooveActions: string[];
  pendingStopActions: string[];
  pendingPlayActions: string[];
  activeTerminalWorktrees: ReadonlySet<string>;
  onCopyBranchName: (row: WorktreeRow) => void;
  onRestoreAction: (row: WorktreeRow) => void;
  onCutConfirm: (row: WorktreeRow) => void;
  onStopAction: (row: WorktreeRow) => void;
  onPlayAction: (row: WorktreeRow) => void;
  onOpenTerminalAction: (worktree: string) => void;
  workspaceSummaries: SummaryRecord[];
  worktreeSummaries: Record<string, SummaryRecord[]>;
  onSummarizeWorktree: (sessionId: string) => void;
  summarizingWorktreeIds: Set<string>;
  onViewSectionSummary: (summary: SummaryRecord) => void;
  onViewWorktreeSummary: (summary: SummaryRecord) => void;
  onForgetAllDeletedWorktrees: () => void;
  isForgetAllDeletedWorktreesPending: boolean;
  worktreeStates: Record<string, WorktreeState>;
  worktreeUnits: Record<string, WorktreeUnit | undefined>;
  discoveringWorktrees: ReadonlySet<string>;
  newDiscoveryWorktrees: ReadonlySet<string>;
  onSetWorktreeState: (worktree: string, state: WorktreeState) => void;
  onDiscoverWorktree: (worktree: string, sessionId: string) => void;
  onClaimWorktreeReward: (worktree: string) => void;
  onLootWorktree: (worktree: string) => void;
};

export function WorktreesTable({
  groupedWorktreeItems,
  copiedBranchPath,
  pendingRestoreActions,
  pendingCutGrooveActions,
  pendingStopActions,
  pendingPlayActions,
  activeTerminalWorktrees,
  onCopyBranchName,
  onRestoreAction,
  onCutConfirm,
  onStopAction,
  onPlayAction,
  onOpenTerminalAction,
  workspaceSummaries,
  worktreeSummaries,
  onSummarizeWorktree,
  summarizingWorktreeIds,
  onViewSectionSummary,
  onViewWorktreeSummary,
  onForgetAllDeletedWorktrees,
  isForgetAllDeletedWorktreesPending,
  worktreeStates,
  worktreeUnits,
  discoveringWorktrees,
  newDiscoveryWorktrees,
  onSetWorktreeState,
  onDiscoverWorktree,
  onClaimWorktreeReward,
  onLootWorktree,
}: WorktreesTableProps) {
  const grooveBusiness = useGrooveBusiness();
  // The Target column holds gamification content (units/bounties). It is only
  // removed when gamification is fully hidden via the master toggle — the
  // "hide labels" sub-toggle keeps the column and merely relabels its contents.
  const isGamificationDisabled = useSyncExternalStore(
    subscribeToGlobalSettings,
    getIsGrooveBusinessDisabledSnapshot,
    getIsGrooveBusinessDisabledSnapshot,
  );
  const showTargetColumn = !isGamificationDisabled;
  const [sortMode, setSortMode] = useState<SortMode>(readStoredSortMode);
  const handleSortModeChange = (mode: SortMode) => {
    setSortMode(mode);
    writeStoredSortMode(mode);
  };
  const activeSortLabel =
    SORT_OPTIONS.find((option) => option.value === sortMode)?.label ??
    SORT_OPTIONS[0].label;
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleStates, setVisibleStates] = useState<ReadonlySet<WorktreeState>>(
    () => new Set(WORKTREE_STATES.filter((state) => state !== "forgotten")),
  );
  const toggleStateVisibility = (state: WorktreeState) => {
    setVisibleStates((previous) => {
      const next = new Set(previous);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      return next;
    });
  };
  const hiddenStateCount = WORKTREE_STATES.length - visibleStates.size;

  const groupedSections = useMemo(() => {
    type SectionBucket = {
      section: Extract<GroupedWorktreeItem, { type: "section" }>;
      rows: Array<Extract<GroupedWorktreeItem, { type: "row" }>>;
    };

    if (sortMode === "date") {
      const sections: SectionBucket[] = [];
      let activeSection: SectionBucket | null = null;

      for (const item of groupedWorktreeItems) {
        if (item.type === "section") {
          activeSection = {
            section: item,
            rows: [],
          };
          sections.push(activeSection);
          continue;
        }

        if (!activeSection) {
          activeSection = {
            section: {
              type: "section",
              label: "Ungrouped",
              key: "section:Ungrouped",
            },
            rows: [],
          };
          sections.push(activeSection);
        }

        activeSection.rows.push(item);
      }

      return sections;
    }

    // Status / Groove modes regroup the flat (date-sorted) row list so rows
    // stay ordered by recency within each new section.
    const rowItems = groupedWorktreeItems.filter(
      (item): item is Extract<GroupedWorktreeItem, { type: "row" }> =>
        item.type === "row",
    );
    const activeRowItems = rowItems.filter(
      (item) => item.row.status !== "deleted",
    );
    const deletedRowItems = rowItems.filter(
      (item) => item.row.status === "deleted",
    );

    const sections: SectionBucket[] = [];

    if (sortMode === "status") {
      const buckets = new Map<WorktreeState, SectionBucket["rows"]>();
      for (const item of activeRowItems) {
        const state =
          worktreeStates[item.row.worktree] ?? DEFAULT_WORKTREE_STATE;
        const bucket = buckets.get(state);
        if (bucket) {
          bucket.push(item);
        } else {
          buckets.set(state, [item]);
        }
      }
      for (const state of WORKTREE_STATES) {
        const rows = buckets.get(state);
        if (!rows || rows.length === 0) continue;
        sections.push({
          section: {
            type: "section",
            label: resolveWorktreeStateLabel(state, grooveBusiness.mode),
            key: `section:state:${state}`,
          },
          rows,
        });
      }
    } else {
      const buckets = new Map<WorktreeStatus, SectionBucket["rows"]>();
      for (const item of activeRowItems) {
        const status = deriveWorktreeStatus(
          item.row.status,
          activeTerminalWorktrees.has(item.row.worktree),
        );
        const bucket = buckets.get(status);
        if (bucket) {
          bucket.push(item);
        } else {
          buckets.set(status, [item]);
        }
      }
      for (const status of GROOVE_STATUS_ORDER) {
        const rows = buckets.get(status);
        if (!rows || rows.length === 0) continue;
        sections.push({
          section: {
            type: "section",
            label: GROOVE_STATUS_LABELS[status] ?? status,
            key: `section:groove:${status}`,
          },
          rows,
        });
      }
    }

    if (deletedRowItems.length > 0) {
      sections.push({
        section: {
          type: "section",
          label: "Deleted worktrees",
          key: "section:Deleted worktrees",
        },
        rows: deletedRowItems,
      });
    }

    return sections;
  }, [
    groupedWorktreeItems,
    sortMode,
    worktreeStates,
    activeTerminalWorktrees,
    grooveBusiness.mode,
  ]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const visibleSections = useMemo(() => {
    return groupedSections
      .map(({ section, rows }) => ({
        section,
        rows: rows.filter(({ row }) => {
          const state =
            worktreeStates[row.worktree] ?? DEFAULT_WORKTREE_STATE;
          if (!visibleStates.has(state)) return false;
          if (!isSearching) return true;
          return (
            row.branchGuess.toLowerCase().includes(trimmedQuery) ||
            row.worktree.toLowerCase().includes(trimmedQuery) ||
            row.path.toLowerCase().includes(trimmedQuery)
          );
        }),
      }))
      .filter(({ rows }) => rows.length > 0);
  }, [
    groupedSections,
    isSearching,
    trimmedQuery,
    visibleStates,
    worktreeStates,
  ]);

  const firstActiveSectionKey = useMemo(() => {
    for (const { section } of groupedSections) {
      const normalized = section.label.trim().toLowerCase();
      if (DEFAULT_COLLAPSED_SECTION_LABELS.has(normalized)) {
        continue;
      }
      return section.key;
    }
    return null;
  }, [groupedSections]);

  const totalMatchedRows = useMemo(
    () => visibleSections.reduce((sum, { rows }) => sum + rows.length, 0),
    [visibleSections],
  );

  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  const allCollapsed =
    visibleSections.length > 0 &&
    visibleSections.every(
      ({ section }) =>
        collapsedSections[section.key] ??
        shouldCollapseSectionByDefault(
          section.label,
          section.key === firstActiveSectionKey,
        ),
    );

  const toggleAllSections = () => {
    const collapseAll = !allCollapsed;
    setCollapsedSections((previous) => {
      const next: Record<string, boolean> = { ...previous };
      for (const { section } of visibleSections) {
        next[section.key] = collapseAll;
      }
      return next;
    });
  };

  useEffect(() => {
    setCollapsedSections((previous) => {
      const next: Record<string, boolean> = {};
      for (const { section } of groupedSections) {
        next[section.key] =
          previous[section.key] ??
          shouldCollapseSectionByDefault(
            section.label,
            section.key === firstActiveSectionKey,
          );
      }
      return next;
    });
  }, [groupedSections, firstActiveSectionKey]);

  const renderWorktreeRow = (
    item: Extract<GroupedWorktreeItem, { type: "row" }>,
  ) => {
    const { row } = item;
    const restoreActionKey = `${row.path}:restore`;
    const cutActionKey = `${row.path}:cut`;
    const stopActionKey = `${row.path}:stop`;
    const playActionKey = `${row.path}:play`;
    const branchCopied = copiedBranchPath === row.path;
    const restorePending = pendingRestoreActions.includes(restoreActionKey);
    const cutPending = pendingCutGrooveActions.includes(cutActionKey);
    const stopPending = pendingStopActions.includes(stopActionKey);
    const playPending = pendingPlayActions.includes(playActionKey);
    const rowPending =
      restorePending || cutPending || stopPending || playPending;
    const status = deriveWorktreeStatus(
      row.status,
      activeTerminalWorktrees.has(row.worktree),
    );
    const worktreeState =
      worktreeStates[row.worktree] ?? DEFAULT_WORKTREE_STATE;

    return (
      <WorktreeStateContextMenu
        key={item.key}
        worktree={row.worktree}
        worktreePath={row.path}
        currentState={worktreeState}
        onSelect={(nextState) => {
          onSetWorktreeState(row.worktree, nextState);
        }}
        onPauseGroove={() => {
          onStopAction(row);
        }}
      >
        <TableRow className="[content-visibility:auto] [contain-intrinsic-size:auto_3.5rem]">
          <TableCell className="w-[30%] md:w-[24%]">
            <button
              type="button"
              onClick={() => {
                onCopyBranchName(row);
              }}
              aria-label={`Copy branch name ${row.branchGuess}`}
              className="group/branch flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">
                {row.branchGuess}
              </span>
              {branchCopied ? (
                <Check
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-emerald-700"
                />
              ) : (
                <Copy
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/branch:opacity-100"
                />
              )}
            </button>
          </TableCell>
          <TableCell>
            <WorktreeStateDropdownMenu
              worktree={row.worktree}
              currentState={worktreeState}
              onSelect={(nextState) => {
                onSetWorktreeState(row.worktree, nextState);
              }}
            />
          </TableCell>
          <TableCell>
            <Badge
              variant="outline"
              className={getWorktreeStatusBadgeClasses(status)}
              title={getWorktreeStatusTitle(status)}
            >
              {getWorktreeStatusIcon(status)}
              {status}
            </Badge>
          </TableCell>
          {showTargetColumn && (
            <TableCell>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const unit = worktreeUnits[row.worktree];
                  if (unit) {
                    const isNewDiscovery = newDiscoveryWorktrees.has(
                      row.worktree,
                    );
                    return (
                      <Badge
                        variant="outline"
                        className={cn(
                          getWorktreeUnitBadgeClasses(unit),
                          "[&>svg]:size-4",
                        )}
                        title={getWorktreeUnitTitle(unit)}
                      >
                        {getWorktreeUnitKindIcon(unit)}
                        {getWorktreeUnitLevelIcon(unit)}
                        <span className={cn(unit.rewarded && "line-through")}>
                          {unit.name}
                          {isNewDiscovery && (
                            <span aria-label="New discovery" className="text-blue-400">
                              !
                            </span>
                          )}
                        </span>
                      </Badge>
                    );
                  }
                  return (
                    <Badge
                      variant="outline"
                      className="border-gray-700 bg-gray-800 text-white [&>svg]:text-white dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:[&>svg]:text-white"
                      title="Target is unknown."
                    >
                      <ShieldQuestionMark aria-hidden="true" />
                      unknown
                    </Badge>
                  );
                })()}
                <BountyBadge
                  unit={worktreeUnits[row.worktree]}
                  state={
                    worktreeStates[row.worktree] ?? DEFAULT_WORKTREE_STATE
                  }
                  isDiscovering={discoveringWorktrees.has(row.worktree)}
                  onDiscover={
                    row.worktreeId
                      ? () => {
                          onDiscoverWorktree(row.worktree, row.worktreeId!);
                        }
                      : undefined
                  }
                  onReward={() => {
                    onClaimWorktreeReward(row.worktree);
                  }}
                  onLoot={() => {
                    onLootWorktree(row.worktree);
                  }}
                />
              </div>
            </TableCell>
          )}
          <TableCell className="text-right">
            <TooltipProvider>
              <WorktreeRowActions
                row={row}
                status={status}
                rowPending={rowPending}
                restorePending={restorePending}
                cutPending={cutPending}
                stopPending={stopPending}
                playPending={playPending}
                onRepair={onRestoreAction}
                onPlay={onPlayAction}
                onOpenTerminal={onOpenTerminalAction}
                onStop={onStopAction}
                onCutConfirm={onCutConfirm}
                onSummarize={onSummarizeWorktree}
                isSummarizePending={
                  row.worktreeId
                    ? summarizingWorktreeIds.has(row.worktreeId)
                    : false
                }
                onViewSummary={onViewWorktreeSummary}
                latestSummary={
                  row.worktreeId
                    ? (worktreeSummaries[row.worktreeId]?.at(-1) ?? null)
                    : null
                }
              />
            </TooltipProvider>
          </TableCell>
        </TableRow>
      </WorktreeStateContextMenu>
    );
  };

  return (
    <div
      role="region"
      aria-label="Groove worktrees table"
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search worktrees by branch or path"
            aria-label="Search worktrees"
            className="h-8 pl-8 pr-8 text-sm"
          />
          {searchQuery.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              aria-label={
                hiddenStateCount > 0
                  ? `Filter states (${hiddenStateCount} hidden)`
                  : "Filter states"
              }
            >
              <ListFilter aria-hidden="true" className="size-3.5" />
              <span>Filter</span>
              {hiddenStateCount > 0 ? (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                  {hiddenStateCount}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {WORKTREE_STATES.map((state) => {
              const isVisible = visibleStates.has(state);
              return (
                <DropdownMenuItem
                  key={state}
                  onSelect={(event) => {
                    event.preventDefault();
                    toggleStateVisibility(state);
                  }}
                  className="gap-2"
                >
                  <span
                    className={cn(
                      "inline-flex size-4 items-center justify-center [&>svg]:size-4",
                      getWorktreeStateIconColorClass(state),
                    )}
                  >
                    {getWorktreeStateIcon(state, grooveBusiness.mode)}
                  </span>
                  <span className="flex-1">{grooveBusiness.stateLabel(state)}</span>
                  <Check
                    aria-hidden="true"
                    className={cn(
                      "size-3.5",
                      isVisible ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              aria-label={`Sort worktrees (${activeSortLabel})`}
            >
              <ArrowUpDown aria-hidden="true" className="size-3.5" />
              <span>Sort</span>
              <span className="ml-1 inline-flex h-4 items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                {activeSortLabel}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => {
                  handleSortModeChange(option.value);
                }}
                className="gap-2"
              >
                <span
                  className={cn(
                    "inline-flex size-4 items-center justify-center [&>svg]:size-4",
                    option.iconColorClass,
                  )}
                >
                  <option.icon aria-hidden="true" />
                </span>
                <span className="flex-1">{option.label}</span>
                <Check
                  aria-hidden="true"
                  className={cn(
                    "size-3.5",
                    sortMode === option.value ? "opacity-100" : "opacity-0",
                  )}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-8 p-0"
                onClick={toggleAllSections}
                disabled={visibleSections.length === 0}
                aria-label={allCollapsed ? "Expand all" : "Collapse all"}
              >
                {allCollapsed ? (
                  <ChevronsUpDown aria-hidden="true" className="size-3.5" />
                ) : (
                  <ChevronsDownUp aria-hidden="true" className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {allCollapsed ? "Expand all" : "Collapse all"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%] md:w-[24%]">Branch</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Groove</TableHead>
            {showTargetColumn && <TableHead>Target</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isSearching && totalMatchedRows === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showTargetColumn ? 5 : 4}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                No worktrees match &ldquo;{searchQuery}&rdquo;.
              </TableCell>
            </TableRow>
          ) : null}
          {visibleSections.map(({ section, rows }) => {
            const isDeletedWorktreesSection =
              section.label === "Deleted worktrees";
            const isCollapsed = isSearching
              ? false
              : (collapsedSections[section.key] ??
                shouldCollapseSectionByDefault(
                  section.label,
                  section.key === firstActiveSectionKey,
                ));

            let sectionIcon: ReactNode = null;
            if (section.key.startsWith("section:state:")) {
              const state = section.key.slice(
                "section:state:".length,
              ) as WorktreeState;
              sectionIcon = (
                <span
                  className={cn(
                    "inline-flex size-4 items-center justify-center [&>svg]:size-3.5",
                    getWorktreeStateIconColorClass(state),
                  )}
                >
                  {getWorktreeStateIcon(state, grooveBusiness.mode)}
                </span>
              );
            } else if (section.key.startsWith("section:groove:")) {
              const status = section.key.slice(
                "section:groove:".length,
              ) as WorktreeStatus;
              sectionIcon = (
                <span className="inline-flex size-4 items-center justify-center [&>svg]:size-3.5">
                  {getWorktreeStatusIcon(status)}
                </span>
              );
            }

            return (
              <Fragment key={section.key}>
                <TableRow
                  className="group cursor-pointer select-none bg-muted/25"
                  onClick={() => {
                    setCollapsedSections((previous) => ({
                      ...previous,
                      [section.key]: !isCollapsed,
                    }));
                  }}
                >
                  <TableCell
                    colSpan={showTargetColumn ? 5 : 4}
                    className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCollapsedSections((previous) => ({
                              ...previous,
                              [section.key]: !isCollapsed,
                            }));
                          }}
                          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${section.label} section`}
                          aria-expanded={!isCollapsed}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`size-3.5 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                          />
                        </button>
                        {sectionIcon}
                        <span>{section.label}</span>
                        {isDeletedWorktreesSection ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  aria-label="About deleted worktrees"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                >
                                  <CircleHelp
                                    aria-hidden="true"
                                    className="size-3"
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                These are worktrees that are no longer present
                                in folders.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {!isDeletedWorktreesSection &&
                          (() => {
                            const sessionIds = rows
                              .map((item) => item.row.worktreeId)
                              .filter((id): id is string => id != null);
                            if (sessionIds.length === 0) return null;
                            const sessionIdSet = new Set(sessionIds);
                            const matchingSummary = [...workspaceSummaries]
                              .reverse()
                              .find((s) =>
                                s.worktreeIds.some((id) =>
                                  sessionIdSet.has(id),
                                ),
                              );
                            return (
                              <>
                                {matchingSummary ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onViewSectionSummary(matchingSummary);
                                    }}
                                    aria-label={`View summary for ${section.label}`}
                                  >
                                    <ScrollText
                                      aria-hidden="true"
                                      className="size-3"
                                    />
                                    View Summary
                                  </Button>
                                ) : null}
                              </>
                            );
                          })()}
                        {isDeletedWorktreesSection && !isCollapsed ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] font-semibold uppercase tracking-wide text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              onForgetAllDeletedWorktrees();
                            }}
                            disabled={
                              isForgetAllDeletedWorktreesPending ||
                              rows.length === 0
                            }
                            aria-label={
                              isForgetAllDeletedWorktreesPending
                                ? "Forgetting all deleted worktrees"
                                : "Forget all deleted worktrees"
                            }
                          >
                            {isForgetAllDeletedWorktreesPending
                              ? "Forgetting..."
                              : "Forget all"}
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {isCollapsed
                  ? null
                  : rows.map((item) => renderWorktreeRow(item))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
