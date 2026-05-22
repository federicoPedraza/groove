import { Fragment, useEffect, useMemo, useState } from "react";

import {
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  Copy,
  ListFilter,
  Scroll,
  ScrollText,
  Search,
  ShieldQuestionMark,
  X,
} from "lucide-react";

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
  type WorktreeUnit,
} from "@/src/lib/ipc";
import { useGrooveBusiness } from "@/src/lib/groove-business";
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
import { deriveWorktreeStatus } from "@/src/lib/utils/worktree/status";
import type { GroupedWorktreeItem } from "@/src/lib/utils/time/grouping";
import type { CommentRecord, SummaryRecord } from "@/src/lib/ipc";

const ALWAYS_EXPANDED_SECTION_LABELS = new Set(["today", "ungrouped"]);
const DEFAULT_COLLAPSED_SECTION_LABELS = new Set(["deleted worktrees"]);

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
  onSummarizeSection: (sectionKey: string, sessionIds: string[]) => void;
  onSummarizeWorktree: (sessionId: string) => void;
  summarizingWorktreeIds: Set<string>;
  onViewSectionSummary: (summary: SummaryRecord) => void;
  onViewWorktreeSummary: (summary: SummaryRecord) => void;
  summarizingSectionKeys: Set<string>;
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
  worktreeComments: Record<string, CommentRecord[]>;
  commentingWorktrees: ReadonlySet<string>;
  onCommentWorktree: (worktree: string) => void;
  onViewWorktreeComment: (worktree: string, comment: CommentRecord) => void;
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
  onSummarizeSection,
  onSummarizeWorktree,
  summarizingWorktreeIds,
  onViewSectionSummary,
  onViewWorktreeSummary,
  summarizingSectionKeys,
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
  worktreeComments,
  commentingWorktrees,
  onCommentWorktree,
  onViewWorktreeComment,
}: WorktreesTableProps) {
  const grooveBusiness = useGrooveBusiness();
  const showTargetColumn = !grooveBusiness.isBusiness;
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
    const sections: Array<{
      section: Extract<GroupedWorktreeItem, { type: "section" }>;
      rows: Array<Extract<GroupedWorktreeItem, { type: "row" }>>;
    }> = [];
    let activeSection: {
      section: Extract<GroupedWorktreeItem, { type: "section" }>;
      rows: Array<Extract<GroupedWorktreeItem, { type: "row" }>>;
    } | null = null;

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
  }, [groupedWorktreeItems]);

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
        currentState={worktreeState}
        onSelect={(nextState) => {
          onSetWorktreeState(row.worktree, nextState);
        }}
      >
        <TableRow>
          <TableCell className="w-[30%] md:w-[24%]">
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="min-w-0 flex-1 truncate select-text">
                {row.branchGuess}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                onClick={() => {
                  onCopyBranchName(row);
                }}
                aria-label={`Copy branch name ${row.branchGuess}`}
              >
                {branchCopied ? (
                  <Check
                    aria-hidden="true"
                    className="size-3.5 text-emerald-700"
                  />
                ) : (
                  <Copy aria-hidden="true" className="size-3.5" />
                )}
              </Button>
            </div>
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
                  isNewDiscovery={newDiscoveryWorktrees.has(row.worktree)}
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
                onComment={onCommentWorktree}
                isCommentPending={commentingWorktrees.has(row.worktree)}
                onViewComment={(comment) => {
                  onViewWorktreeComment(row.worktree, comment);
                }}
                latestComment={worktreeComments[row.worktree]?.at(-1) ?? null}
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
      className="rounded-lg border bg-card"
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

            return (
              <Fragment key={section.key}>
                <TableRow className="bg-muted/25">
                  <TableCell
                    colSpan={showTargetColumn ? 5 : 4}
                    className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          onClick={() => {
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
                        <span>{section.label}</span>
                        {isDeletedWorktreesSection ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  aria-label="About deleted worktrees"
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
                            const isSectionSummarizing =
                              summarizingSectionKeys.has(section.key);
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
                                    onClick={() => {
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
                                {!matchingSummary ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      onSummarizeSection(
                                        section.key,
                                        sessionIds,
                                      );
                                    }}
                                    disabled={isSectionSummarizing}
                                    aria-label={
                                      isSectionSummarizing
                                        ? "Summarizing..."
                                        : `Summarize ${section.label} section`
                                    }
                                  >
                                    <Scroll
                                      aria-hidden="true"
                                      className="size-3"
                                    />
                                    {isSectionSummarizing
                                      ? "Summarizing..."
                                      : "Summarize"}
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
                            onClick={onForgetAllDeletedWorktrees}
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
