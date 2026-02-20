import { Loader2, OctagonX, RefreshCw } from "lucide-react";

import { ProcessActionButton } from "@/components/pages/diagnostics/process-action-button";
import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DiagnosticsProcessRow } from "@/src/lib/ipc";

type OpencodeInstancesCardProps = {
  opencodeRows: DiagnosticsProcessRow[];
  pendingStopPids: number[];
  isLoadingOpencode: boolean;
  isClosingAll: boolean;
  opencodeError: string | null;
  onRefresh: () => void;
  onCloseAll: () => void;
  onStopProcess: (pid: number) => void;
};

export function OpencodeInstancesCard({
  opencodeRows,
  pendingStopPids,
  isLoadingOpencode,
  isClosingAll,
  opencodeError,
  onRefresh,
  onCloseAll,
  onStopProcess,
}: OpencodeInstancesCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>OpenCode Instances</CardTitle>
            <CardDescription>Running OpenCode processes detected on this device.</CardDescription>
            {opencodeRows.length > 0 && (
              <CardDescription>
                OpenCode instances: <span className="font-medium text-foreground">{String(opencodeRows.length)}</span>
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={isLoadingOpencode || isClosingAll}>
              {isLoadingOpencode ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
              <span>Refresh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className={SOFT_RED_BUTTON_CLASSES}
              onClick={onCloseAll}
              disabled={isLoadingOpencode || isClosingAll || opencodeRows.length === 0}
            >
              {isClosingAll ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
              <span>Close all</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {opencodeError && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{opencodeError}</p>}

        {!opencodeError && opencodeRows.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {isLoadingOpencode ? "Checking for OpenCode processes..." : "No running OpenCode processes found."}
          </p>
        )}

        {opencodeRows.length > 0 && (
          <div className="rounded-lg border" role="region" aria-label="OpenCode process table">
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
                {opencodeRows.map((row) => {
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
                            label="Close"
                            icon={<OctagonX aria-hidden="true" className="size-4" />}
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
