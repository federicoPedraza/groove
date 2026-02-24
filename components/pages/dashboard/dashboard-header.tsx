import { FolderOpen, Loader2, Plus, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DashboardHeaderProps = {
  gitignoreSanity: {
    isApplicable: boolean;
    missingEntries: string[];
  } | null;
  isGitignoreSanityChecking: boolean;
  isGitignoreSanityApplyPending: boolean;
  gitignoreSanityStatusMessage: string | null;
  gitignoreSanityErrorMessage: string | null;
  isBusy: boolean;
  isCreatePending: boolean;
  onCreate: () => void;
  onApplyGitignoreSanityPatch: () => void;
  onRefresh: () => void;
  onPickDirectory: () => void;
  onCloseWorkspace: () => void;
};

export function DashboardHeader({
  gitignoreSanity,
  isGitignoreSanityChecking,
  isGitignoreSanityApplyPending,
  gitignoreSanityStatusMessage,
  gitignoreSanityErrorMessage,
  isBusy,
  isCreatePending,
  onCreate,
  onApplyGitignoreSanityPatch,
  onRefresh,
  onPickDirectory,
  onCloseWorkspace,
}: DashboardHeaderProps) {
  const shouldShowApplyPatch = Boolean(gitignoreSanity?.isApplicable && gitignoreSanity.missingEntries.length > 0);

  let sanityLabel = "Checking .gitignore sanity...";
  if (gitignoreSanityErrorMessage) {
    sanityLabel = "Unable to check .gitignore sanity.";
  } else if (!isGitignoreSanityChecking) {
    if (!gitignoreSanity?.isApplicable) {
      sanityLabel = "No .gitignore found in this directory.";
    } else if (gitignoreSanity.missingEntries.length > 0) {
      sanityLabel = `Missing ${gitignoreSanity.missingEntries.join(" and ")} in .gitignore.`;
    } else {
      sanityLabel = ".gitignore includes Groove entries.";
    }
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Gitignore sanity: {sanityLabel}</p>
        {gitignoreSanityStatusMessage ? (
          <p className="text-xs text-emerald-700">{gitignoreSanityStatusMessage}</p>
        ) : null}
        {gitignoreSanityErrorMessage ? <p className="text-xs text-destructive">{gitignoreSanityErrorMessage}</p> : null}
      </div>
      <TooltipProvider>
        <div className="flex flex-wrap gap-2">
          {shouldShowApplyPatch ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onApplyGitignoreSanityPatch}
              disabled={isBusy || isGitignoreSanityApplyPending}
              size="sm"
            >
              {isGitignoreSanityApplyPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              <span>Apply Patch</span>
            </Button>
          ) : null}
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
