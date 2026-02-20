import { BrushCleaning, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";

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
  hasLoadedProcessSnapshots,
  isLoadingMostConsumingPrograms,
  isCleaningAllDevServers,
  onLoadProcessSnapshots,
  onLoadMostConsumingPrograms,
  onCleanAll,
}: DiagnosticsHeaderProps) {
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
            onClick={onLoadProcessSnapshots}
            disabled={isLoadingProcessSnapshots}
          >
            {isLoadingProcessSnapshots ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
            <span>{hasLoadedProcessSnapshots ? "Refresh process snapshots" : "Load process snapshots"}</span>
          </Button>
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
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className={SOFT_RED_BUTTON_CLASSES}
            onClick={onCleanAll}
            disabled={isCleaningAllDevServers}
          >
            {isCleaningAllDevServers ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <BrushCleaning aria-hidden="true" className="size-4" />}
            <span>Clean all</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
