import { Check, Copy, FlaskConical } from "lucide-react";

import { WorktreeRowActions } from "@/components/pages/dashboard/worktree-row-actions";
import { getWorktreeStatusBadgeClasses, getWorktreeStatusIcon, getWorktreeStatusTitle } from "@/components/pages/dashboard/worktree-status";
import type { RuntimeStateRow, WorktreeRow } from "@/components/pages/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  testingTargetWorktree: string | undefined;
  onCopyBranchName: (row: WorktreeRow) => void;
  onRestoreAction: (row: WorktreeRow) => void;
  onCutConfirm: (row: WorktreeRow) => void;
  onStopAction: (row: WorktreeRow, runtimeRow: RuntimeStateRow | undefined) => void;
  onPlayAction: (row: WorktreeRow) => void;
  onSelectTestingTarget: (row: WorktreeRow) => void;
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
  testingTargetWorktree,
  onCopyBranchName,
  onRestoreAction,
  onCutConfirm,
  onStopAction,
  onPlayAction,
  onSelectTestingTarget,
}: WorktreesTableProps) {
  return (
    <div role="region" aria-label="Groove worktrees table" className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Worktree</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedWorktreeItems.map((item) => {
            if (item.type === "section") {
              return (
                <TableRow key={item.key} className="bg-muted/25">
                  <TableCell colSpan={4} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.label}
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
            const isCurrentTestingTarget = testingTargetWorktree === row.worktree;

            return (
              <TableRow key={item.key} className={isCurrentTestingTarget ? "bg-muted/25" : undefined}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    {isCurrentTestingTarget ? <FlaskConical aria-hidden="true" className="size-3.5 text-muted-foreground" /> : null}
                    <span>{row.worktree}</span>
                  </span>
                </TableCell>
                <TableCell>
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
                <TableCell>
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
                      isCurrentTestingTarget={isCurrentTestingTarget}
                      onRepair={onRestoreAction}
                      onPlay={onPlayAction}
                      onStop={onStopAction}
                      onSetTestingTarget={onSelectTestingTarget}
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
