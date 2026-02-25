import { ChevronDown, CircleStop, Loader2, OctagonX, RefreshCw } from "lucide-react";

import { ProcessActionButton } from "@/components/pages/diagnostics/process-action-button";
import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { groupRowsByWorktree } from "@/lib/utils/worktree/process-grouping";
import type { DiagnosticsNodeAppRow } from "@/src/lib/ipc";

type NodeAppsCardProps = {
  nodeAppRows: DiagnosticsNodeAppRow[];
  pendingStopPids: number[];
  hasLoadedSnapshots: boolean;
  isLoadingNodeApps: boolean;
  isCleaningAllDevServers: boolean;
  isClosingAllNodeInstances: boolean;
  nodeAppsError: string | null;
  nodeAppsWarning: string | null;
  onRefresh: () => void;
  onCloseAllNodeInstances: () => void;
  onStopProcess: (pid: number) => void;
  onStopWorktreeProcesses: (worktree: string, pids: number[]) => void;
};

export function NodeAppsCard({
  nodeAppRows,
  pendingStopPids,
  hasLoadedSnapshots,
  isLoadingNodeApps,
  isCleaningAllDevServers,
  isClosingAllNodeInstances,
  nodeAppsError,
  nodeAppsWarning,
  onRefresh,
  onCloseAllNodeInstances,
  onStopProcess,
  onStopWorktreeProcesses,
}: NodeAppsCardProps) {
  const closeAllNodeLabel = isClosingAllNodeInstances ? "Closing all Node instances" : "Close all Node instances";
  const groupedNodeApps = groupRowsByWorktree(nodeAppRows, (row) => row.cmd);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-2">
            <CardTitle>Current Node Apps Running</CardTitle>
            <CardDescription>
              Worktree process view for likely Node commands that include <code>.worktree/</code> or <code>.worktrees/</code> paths.
            </CardDescription>
            {nodeAppRows.length > 0 && (
              <CardDescription>
                Running in worktrees: <span className="font-medium text-foreground">{String(groupedNodeApps.length)}</span>
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={isLoadingNodeApps || isCleaningAllDevServers || isClosingAllNodeInstances}
            >
              {isLoadingNodeApps ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
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
                    onClick={onCloseAllNodeInstances}
                    disabled={isLoadingNodeApps || isCleaningAllDevServers || isClosingAllNodeInstances || nodeAppRows.length === 0}
                    aria-label={closeAllNodeLabel}
                  >
                    {isClosingAllNodeInstances ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{closeAllNodeLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {nodeAppsWarning && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{nodeAppsWarning}</p>}

        {nodeAppsError && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{nodeAppsError}</p>}

        {!nodeAppsError && nodeAppRows.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {isLoadingNodeApps
              ? "Scanning worktree node apps..."
              : hasLoadedSnapshots
                ? "No matching node apps are currently running in worktrees."
                : "Process snapshots are not loaded yet. Click Refresh to load worktree node apps."}
          </p>
        )}

        {nodeAppRows.length > 0 &&
          groupedNodeApps.map((group) => {
            const groupPids = group.rows.map((row) => row.pid);
            const isGroupPending = groupPids.some((pid) => pendingStopPids.includes(pid)) || isCleaningAllDevServers || isClosingAllNodeInstances;

            return (
              <Collapsible key={group.worktree} className="space-y-2">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-between [&[data-state=open]>svg]:rotate-180"
                    aria-label={`Toggle Node app process group for ${group.worktree}`}
                  >
                    <span>
                      {group.worktree} ({String(group.rows.length)})
                    </span>
                    <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border" role="region" aria-label={`Node app processes for ${group.worktree}`}>
                    <div className="flex justify-end border-b p-2">
                      <ProcessActionButton
                        pending={isGroupPending}
                        label={`Clean Node apps in ${group.worktree}`}
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
                          <TableHead>PPID</TableHead>
                          <TableHead>Command</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rows.map((row) => {
                          const isPending = pendingStopPids.includes(row.pid) || isCleaningAllDevServers || isClosingAllNodeInstances;
                          return (
                            <TableRow key={`${row.pid}:${row.ppid}:${row.cmd}`}>
                              <TableCell className="font-mono text-xs">{String(row.pid)}</TableCell>
                              <TableCell className="font-mono text-xs">{String(row.ppid)}</TableCell>
                              <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={row.cmd}>
                                {row.cmd}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end">
                                  <ProcessActionButton
                                    pending={isPending}
                                    label="Stop"
                                    icon={<CircleStop aria-hidden="true" className="size-4" />}
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
