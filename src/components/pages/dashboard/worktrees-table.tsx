import { Fragment, useEffect, useMemo, useState } from "react";

import {
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Scroll,
  ScrollText,
} from "lucide-react";

import { WorktreeRowActions } from "@/src/components/pages/dashboard/worktree-row-actions";
import {
  getWorktreeStatusBadgeClasses,
  getWorktreeStatusIcon,
  getWorktreeStatusTitle,
} from "@/src/components/pages/dashboard/worktree-status";
import type { WorktreeRow } from "@/src/components/pages/dashboard/types";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
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
import type { SummaryRecord } from "@/src/lib/ipc";

const DEFAULT_COLLAPSED_SECTION_LABELS = new Set([
  "1 month old",
  "1 month ago",
  "1 months ago",
  "deleted worktrees",
  "no activity yet",
]);

function shouldCollapseSectionByDefault(label: string): boolean {
  return DEFAULT_COLLAPSED_SECTION_LABELS.has(label.trim().toLowerCase());
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
}: WorktreesTableProps) {
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

  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setCollapsedSections((previous) => {
      const next: Record<string, boolean> = {};
      for (const { section } of groupedSections) {
        next[section.key] =
          previous[section.key] ??
          shouldCollapseSectionByDefault(section.label);
      }
      return next;
    });
  }, [groupedSections]);

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

    return (
      <TableRow key={item.key}>
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
          <Badge
            variant="outline"
            className={getWorktreeStatusBadgeClasses(status)}
            title={getWorktreeStatusTitle(status)}
          >
            {getWorktreeStatusIcon(status)}
            {status}
          </Badge>
        </TableCell>
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
    );
  };

  return (
    <div
      role="region"
      aria-label="Groove worktrees table"
      className="rounded-lg border bg-card"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%] md:w-[24%]">Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedSections.map(({ section, rows }) => {
            const isDeletedWorktreesSection =
              section.label === "Deleted worktrees";
            const isCollapsed =
              collapsedSections[section.key] ??
              shouldCollapseSectionByDefault(section.label);

            return (
              <Fragment key={section.key}>
                <TableRow className="bg-muted/25">
                  <TableCell
                    colSpan={3}
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
