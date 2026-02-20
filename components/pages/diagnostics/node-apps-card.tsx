import { CircleStop, Loader2, RefreshCw } from "lucide-react";

import { ProcessActionButton } from "@/components/pages/diagnostics/process-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DiagnosticsNodeAppRow } from "@/src/lib/ipc";

type NodeAppsCardProps = {
  nodeAppRows: DiagnosticsNodeAppRow[];
  pendingStopPids: number[];
  hasLoadedSnapshots: boolean;
  isLoadingNodeApps: boolean;
  isCleaningAllDevServers: boolean;
  nodeAppsError: string | null;
  nodeAppsWarning: string | null;
  onRefresh: () => void;
  onStopProcess: (pid: number) => void;
};

export function NodeAppsCard({
  nodeAppRows,
  pendingStopPids,
  hasLoadedSnapshots,
  isLoadingNodeApps,
  isCleaningAllDevServers,
  nodeAppsError,
  nodeAppsWarning,
  onRefresh,
  onStopProcess,
}: NodeAppsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>Current Node Apps Running</CardTitle>
            <CardDescription>
              Worktree process view for likely Node commands that include <code>.worktree/</code> or <code>.worktrees/</code> paths.
            </CardDescription>
            {nodeAppRows.length > 0 && (
              <CardDescription>
                Running in worktrees: <span className="font-medium text-foreground">{String(nodeAppRows.length)}</span>
              </CardDescription>
            )}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={isLoadingNodeApps || isCleaningAllDevServers}>
            {isLoadingNodeApps ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
            <span>Refresh</span>
          </Button>
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

        {nodeAppRows.length > 0 && (
          <div className="rounded-lg border" role="region" aria-label="Current node apps running table">
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
                {nodeAppRows.map((row) => {
                  const isPending = pendingStopPids.includes(row.pid) || isCleaningAllDevServers;
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
        )}
      </CardContent>
    </Card>
  );
}
