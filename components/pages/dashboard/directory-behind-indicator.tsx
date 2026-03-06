import { FileDiff } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DirectoryBehindStatus } from "@/components/pages/dashboard/hooks/use-directory-behind-status";

type DirectoryBehindIndicatorProps = {
  collapsed: boolean;
  status: DirectoryBehindStatus | null;
};

export function DirectoryBehindIndicator({ collapsed, status }: DirectoryBehindIndicatorProps) {
  if (!status) {
    return null;
  }

  const label = `${status.behindCount} commits behind ${status.branchName}`;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            tabIndex={0}
            title={label}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-orange-500/40 bg-orange-500/10 text-orange-600"
          >
            <FileDiff aria-hidden="true" className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <p
      aria-label={label}
      className="flex h-8 min-w-0 items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 text-xs font-medium text-orange-700"
      title={label}
    >
      <FileDiff aria-hidden="true" className="size-3.5 text-orange-500" />
      <span className="truncate">{label}</span>
    </p>
  );
}
