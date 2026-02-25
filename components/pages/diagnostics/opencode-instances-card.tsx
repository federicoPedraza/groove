import { ChevronDown, Loader2, OctagonX, RefreshCw } from "lucide-react";

import { ProcessActionButton } from "@/components/pages/diagnostics/process-action-button";
import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { groupRowsByWorktree } from "@/lib/utils/worktree/process-grouping";
import type { DiagnosticsProcessRow } from "@/src/lib/ipc";

type OpencodeInstancesCardProps = {
  opencodeRows: DiagnosticsProcessRow[];
  pendingStopPids: number[];
  hasLoadedSnapshots: boolean;
  isLoadingOpencode: boolean;
  isClosingAll: boolean;
  opencodeError: string | null;
  onRefresh: () => void;
  onCloseAll: () => void;
  onStopProcess: (pid: number) => void;
  onStopWorktreeProcesses: (worktree: string, pids: number[]) => void;
};

export function OpencodeInstancesCard({
  opencodeRows,
  pendingStopPids,
  hasLoadedSnapshots,
  isLoadingOpencode,
  isClosingAll,
  opencodeError,
  onRefresh,
  onCloseAll,
  onStopProcess,
  onStopWorktreeProcesses,
}: OpencodeInstancesCardProps) {
  const closeAllLabel = isClosingAll ? "Closing all OpenCode instances" : "Close all OpenCode instances";
  const groupedOpencodeRows = groupRowsByWorktree(opencodeRows, (row) => row.command);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-2">
            <CardTitle>OpenCode Instances</CardTitle>
            <CardDescription>Running worktree OpenCode processes detected for this workspace.</CardDescription>
            {opencodeRows.length > 0 && (
              <CardDescription>
                OpenCode worktrees: <span className="font-medium text-foreground">{String(groupedOpencodeRows.length)}</span>
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={isLoadingOpencode || isClosingAll}>
              {isLoadingOpencode ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
              <span>Refresh</span>
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                    onClick={onCloseAll}
                    disabled={isLoadingOpencode || isClosingAll || opencodeRows.length === 0}
                    aria-label={closeAllLabel}
                  >
                    {isClosingAll ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{closeAllLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {opencodeError && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{opencodeError}</p>}

        {!opencodeError && opencodeRows.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {isLoadingOpencode
              ? "Checking for worktree OpenCode processes..."
              : hasLoadedSnapshots
                ? "No running worktree OpenCode processes found."
                : "Process snapshots are not loaded yet. Click Refresh to load worktree OpenCode instances."}
          </p>
        )}

        {opencodeRows.length > 0 &&
          groupedOpencodeRows.map((group) => {
            const groupPids = group.rows.map((row) => row.pid);
            const isGroupPending = groupPids.some((pid) => pendingStopPids.includes(pid)) || isClosingAll;

            return (
              <Collapsible key={group.worktree} className="space-y-2">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-between [&[data-state=open]>svg]:rotate-180"
                    aria-label={`Toggle OpenCode process group for ${group.worktree}`}
                  >
                    <span>
                      {group.worktree} ({String(group.rows.length)})
                    </span>
                    <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border" role="region" aria-label={`OpenCode processes for ${group.worktree}`}>
                    <div className="flex justify-end border-b p-2">
                      <ProcessActionButton
                        pending={isGroupPending}
                        label={`Clean OpenCode in ${group.worktree}`}
                        variant="outline"
                        className={SOFT_RED_BUTTON_CLASSES}
                        icon={<OctagonX aria-hidden="true" className="size-4" />}
                        onClick={() => {
                          onStopWorktreeProcesses(group.worktree, groupPids);
                        }}
                      />
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PID</TableHead>
                          <TableHead>Process</TableHead>
                          <TableHead>Command</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((row) => {
                          const isPending = pendingStopPids.includes(row.pid) || isClosingAll;
                          return (
                            <TableRow key={`${row.pid}:${row.command}`}>
                              <TableCell className="font-mono text-xs">{String(row.pid)}</TableCell>
                              <TableCell>{row.processName}</TableCell>
                              <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={row.command}>
                                {row.command}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end">
                                  <ProcessActionButton
                                    pending={isPending}
                                    label={`Close OpenCode process ${String(row.pid)}`}
                                    iconOnly
                                    variant="outline"
                                    className={SOFT_RED_BUTTON_CLASSES}
                                    icon={<OctagonX aria-hidden="true" className="size-4" />}
                                    tooltip={isPending ? `Close OpenCode process ${String(row.pid)} in progress` : `Close OpenCode process ${String(row.pid)}`}
                                    onClick={() => {
                                      onStopProcess(row.pid);
                                    }}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
      </CardContent>
    </Card>
  );
}
