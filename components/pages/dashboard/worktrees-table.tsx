import { Check, CircleHelp, Copy } from "lucide-react";

import { WorktreeRowActions } from "@/components/pages/dashboard/worktree-row-actions";
import { getWorktreeStatusBadgeClasses, getWorktreeStatusIcon, getWorktreeStatusTitle } from "@/components/pages/dashboard/worktree-status";
import type { RuntimeStateRow, WorktreeRow } from "@/components/pages/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { deriveWorktreeStatus } from "@/lib/utils/worktree/status";
import type { GroupedWorktreeItem } from "@/lib/utils/time/grouping";

type WorktreesTableProps = {
  groupedWorktreeItems: GroupedWorktreeItem[];
  copiedBranchPath: string | null;
  pendingRestoreActions: string[];
  pendingCutGrooveActions: string[];
  pendingStopActions: string[];
  pendingPlayActions: string[];
  pendingTestActions: string[];
  runtimeStateByWorktree: Record<string, RuntimeStateRow>;
  testingTargetWorktrees: string[];
  testingRunningWorktrees: string[];
  hasConnectedRepository: boolean;
  repositoryRemoteUrl?: string;
  onCopyBranchName: (row: WorktreeRow) => void;
  onRestoreAction: (row: WorktreeRow) => void;
  onCutConfirm: (row: WorktreeRow) => void;
  onStopAction: (row: WorktreeRow, runtimeRow: RuntimeStateRow | undefined) => void;
  onPlayAction: (row: WorktreeRow) => void;
  onSetTestingTargetAction: (row: WorktreeRow) => void;
};

export function WorktreesTable({
  groupedWorktreeItems,
  copiedBranchPath,
  pendingRestoreActions,
  pendingCutGrooveActions,
  pendingStopActions,
  pendingPlayActions,
  pendingTestActions,
  runtimeStateByWorktree,
  testingTargetWorktrees,
  testingRunningWorktrees,
  hasConnectedRepository,
  repositoryRemoteUrl,
  onCopyBranchName,
  onRestoreAction,
  onCutConfirm,
  onStopAction,
  onPlayAction,
  onSetTestingTargetAction,
}: WorktreesTableProps) {
  return (
    <div role="region" aria-label="Groove worktrees table" className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[34%] md:w-[26%]">Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedWorktreeItems.map((item) => {
            if (item.type === "section") {
              const isDeletedWorktreesSection = item.label === "Deleted worktrees";

              return (
                <TableRow key={item.key} className="bg-muted/25 hover:bg-muted/25">
                  <TableCell colSpan={3} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{item.label}</span>
                      {isDeletedWorktreesSection ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                aria-label="About deleted worktrees"
                              >
                                <CircleHelp aria-hidden="true" className="size-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>These are worktrees that are no longer present in folders.</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              );
            }

            const { row } = item;
            const restoreActionKey = `${row.path}:restore`;
            const cutActionKey = `${row.path}:cut`;
            const stopActionKey = `${row.path}:stop`;
            const playActionKey = `${row.path}:play`;
            const testActionKey = `${row.path}:test`;
            const branchCopied = copiedBranchPath === row.path;
            const restorePending = pendingRestoreActions.includes(restoreActionKey);
            const cutPending = pendingCutGrooveActions.includes(cutActionKey);
            const stopPending = pendingStopActions.includes(stopActionKey);
            const playPending = pendingPlayActions.includes(playActionKey);
            const testPending = pendingTestActions.includes(testActionKey);
            const rowPending = restorePending || cutPending || stopPending || playPending || testPending;
            const runtimeRow = runtimeStateByWorktree[row.worktree];
            const status = deriveWorktreeStatus(row.status, runtimeRow);
            const isTestingTarget = testingTargetWorktrees.includes(row.worktree);
            const isTestingRunning = testingRunningWorktrees.includes(row.worktree);

            return (
              <TableRow key={item.key}>
                <TableCell className="w-[34%] md:w-[26%]">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate select-text">{row.branchGuess}</span>
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
                      {branchCopied ? <Check aria-hidden="true" className="size-3.5 text-emerald-700" /> : <Copy aria-hidden="true" className="size-3.5" />}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getWorktreeStatusBadgeClasses(status)} title={getWorktreeStatusTitle(status)}>
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
                      testPending={testPending}
                      runtimeRow={runtimeRow}
                      isTestingTarget={isTestingTarget}
                      isTestingRunning={isTestingRunning}
                      hasConnectedRepository={hasConnectedRepository}
                      repositoryRemoteUrl={repositoryRemoteUrl}
                      onRepair={onRestoreAction}
                      onPlay={onPlayAction}
                      onStop={onStopAction}
                      onSetTestingTarget={onSetTestingTargetAction}
                      showTestingTargetButton={false}
                      onCutConfirm={onCutConfirm}
                    />
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
