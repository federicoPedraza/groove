import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DashboardHeaderProps = {
  isBusy: boolean;
  isCreatePending: boolean;
  onCreate: () => void;
  onRefresh: () => void;
};

export function DashboardHeader({
  isBusy,
  isCreatePending,
  onCreate,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage worktrees and runtime state.</p>
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
        </div>
      </TooltipProvider>
    </header>
  );
}
