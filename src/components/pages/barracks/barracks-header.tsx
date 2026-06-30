import { Loader2, Plus, RefreshCw } from "lucide-react";

import { PageHeader } from "@/src/components/pages/page-header";
import { useGrooveBusiness } from "@/src/lib/groove-business";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

type BarracksHeaderProps = {
  isBusy: boolean;
  isCreatePending: boolean;
  onCreate: () => void;
  onRefresh: () => void;
};

export function BarracksHeader({
  isBusy,
  isCreatePending,
  onCreate,
  onRefresh,
}: BarracksHeaderProps) {
  const grooveBusiness = useGrooveBusiness();
  return (
    <PageHeader
      title={grooveBusiness.label("barracks")}
      description="Manage worktrees and runtime state."
      actions={
        <TooltipProvider>
          <Button
            type="button"
            variant="default"
            onClick={onCreate}
            disabled={isBusy || isCreatePending}
            size="sm"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span>Create worktree</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={onRefresh}
                disabled={isBusy}
                size="sm"
                className="w-8 px-0"
                aria-label="Refresh"
              >
                {isBusy ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <RefreshCw aria-hidden="true" className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
    />
  );
}
