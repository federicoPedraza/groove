import { BrushCleaning, Loader2, RefreshCw } from "lucide-react";

import { PageHeader } from "@/src/components/pages/page-header";
import { useGrooveBusiness } from "@/src/lib/groove-business";
import { Button } from "@/src/components/ui/button";
import { SOFT_RED_BUTTON_CLASSES } from "@/src/components/pages/diagnostics/constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

type DiagnosticsHeaderProps = {
  isLoadingMostConsumingPrograms: boolean;
  isCleaningAllDevServers: boolean;
  onLoadMostConsumingPrograms: () => void;
  onCleanAll: () => void;
};

export function DiagnosticsHeader({
  isLoadingMostConsumingPrograms,
  isCleaningAllDevServers,
  onLoadMostConsumingPrograms,
  onCleanAll,
}: DiagnosticsHeaderProps) {
  const grooveBusiness = useGrooveBusiness();
  const cleanAllLabel = isCleaningAllDevServers
    ? "Cleaning all processes"
    : "Clean all processes";

  return (
    <PageHeader
      title={grooveBusiness.label("situationRoom")}
      description="Inspect and stop local processes that can interfere with Groove workflows."
      actions={
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onLoadMostConsumingPrograms}
            disabled={isLoadingMostConsumingPrograms}
          >
            {isLoadingMostConsumingPrograms ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            <span>Load top processes</span>
          </Button>
          <TooltipProvider>
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
                  {isCleaningAllDevServers ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <BrushCleaning aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{cleanAllLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      }
    />
  );
}
