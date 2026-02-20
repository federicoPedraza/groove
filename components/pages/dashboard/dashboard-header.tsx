import { FolderOpen, Loader2, Plus, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DashboardHeaderProps = {
  workspaceRootName: string | undefined;
  workspaceRoot: string | null;
  isBusy: boolean;
  isCreatePending: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onPickDirectory: () => void;
  onCloseWorkspace: () => void;
};

export function DashboardHeader({
  workspaceRootName,
  workspaceRoot,
  isBusy,
  isCreatePending,
  onCreate,
  onRefresh,
  onPickDirectory,
  onCloseWorkspace,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Directory: <span className="font-medium text-foreground">{workspaceRootName}</span>
        </p>
        <p className="text-xs text-muted-foreground">{workspaceRoot}</p>
      </div>
      <TooltipProvider>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" onClick={onCreate} disabled={isBusy || isCreatePending} size="sm">
            <Plus aria-hidden="true" className="size-4" />
            <span>Create worktree</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" onClick={onRefresh} disabled={isBusy} size="sm" className="w-8 px-0" aria-label="Refresh">
                {isBusy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                onClick={onPickDirectory}
                disabled={isBusy}
                size="sm"
                className="w-8 px-0"
                aria-label="Pick another directory"
              >
                <FolderOpen aria-hidden="true" className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pick another directory</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                onClick={onCloseWorkspace}
                disabled={isBusy}
                size="sm"
                className="w-8 px-0"
                aria-label="Close current workspace"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close current workspace</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  );
}
