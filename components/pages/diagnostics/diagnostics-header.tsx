import { BrushCleaning, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DiagnosticsHeaderProps = {
  isLoadingProcessSnapshots: boolean;
  hasLoadedProcessSnapshots: boolean;
  isLoadingMostConsumingPrograms: boolean;
  isCleaningAllDevServers: boolean;
  onLoadProcessSnapshots: () => void;
  onLoadMostConsumingPrograms: () => void;
  onCleanAll: () => void;
};

export function DiagnosticsHeader({
  isLoadingProcessSnapshots,
  isLoadingMostConsumingPrograms,
  isCleaningAllDevServers,
  onLoadProcessSnapshots,
  onLoadMostConsumingPrograms,
  onCleanAll,
}: DiagnosticsHeaderProps) {
  const refreshProcessSnapshotsLabel = "Refresh all";
  const cleanAllLabel = isCleaningAllDevServers ? "Cleaning all processes" : "Clean all processes";

  return (
    <header className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Diagnostics</h1>
          <p className="text-sm text-muted-foreground">Inspect and stop local processes that can interfere with Groove workflows.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onLoadMostConsumingPrograms}
            disabled={isLoadingMostConsumingPrograms}
          >
            {isLoadingMostConsumingPrograms ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
            <span>Load top processes</span>
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={onLoadProcessSnapshots}
                  disabled={isLoadingProcessSnapshots}
                  aria-label={refreshProcessSnapshotsLabel}
                >
                  {isLoadingProcessSnapshots ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{refreshProcessSnapshotsLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                  onClick={onCleanAll}
                  disabled={isCleaningAllDevServers}
                  aria-label={cleanAllLabel}
                >
                  {isCleaningAllDevServers ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <BrushCleaning aria-hidden="true" className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{cleanAllLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  );
}
