import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  CircleSlash,
  FlaskConical,
  FlaskConicalOff,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  GitPullRequestCreate,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  ACTIVE_AMBER_BUTTON_CLASSES,
  ACTIVE_TESTING_BUTTON_CLASSES,
  SOFT_AMBER_BUTTON_CLASSES,
  SOFT_GREEN_BUTTON_CLASSES,
  SOFT_ORANGE_BUTTON_CLASSES,
  SOFT_RED_BUTTON_CLASSES,
} from "@/components/pages/dashboard/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/lib/toast";
import { buildCreatePrUrl } from "@/lib/utils/git/pull-request-url";
import {
  ghCheckBranchPr,
  ghOpenActivePr,
  ghOpenBranch,
  gitListFileStates,
  gitCommit,
  gitHasStagedChanges,
  gitHasUpstream,
  gitMergeAbort,
  gitMergeInProgress,
  gitPull,
  gitPush,
  gitStageFiles,
  gitStatus,
  gitUnstageFiles,
} from "@/src/lib/ipc";
import type { RuntimeStateRow, WorktreeRow, WorktreeStatus } from "@/components/pages/dashboard/types";

type WorktreeRowActionsProps = {
  row: WorktreeRow;
  status: WorktreeStatus;
  rowPending: boolean;
  restorePending: boolean;
  cutPending: boolean;
  stopPending: boolean;
  playPending: boolean;
  testPending?: boolean;
  runtimeRow: RuntimeStateRow | undefined;
  isTestingTarget?: boolean;
  isTestingRunning?: boolean;
  hasConnectedRepository: boolean;
  repositoryRemoteUrl?: string;
  onRepair: (row: WorktreeRow) => void;
  onPlay: (row: WorktreeRow) => void;
  onStop: (row: WorktreeRow, runtimeRow: RuntimeStateRow | undefined) => void;
  onSetTestingTarget?: (row: WorktreeRow) => void;
  showTestingTargetButton?: boolean;
  onCutConfirm: (row: WorktreeRow) => void;
  variant?: "dashboard" | "worktree-detail";
  isTestingInstancePending?: boolean;
  isNewSplitPending?: boolean;
  onRunLocal?: (worktree: string) => void;
  onOpenTerminal?: (worktree: string) => void;
  onNewSplitTerminal?: (worktree: string) => void;
  closeWorktreePending?: boolean;
};

type CommitingFileState = {
  staged: string[];
  unstaged: string[];
  untracked: string[];
};

const EMPTY_COMMITING_FILE_STATE: CommitingFileState = {
  staged: [],
  unstaged: [],
  untracked: [],
};

export function WorktreeRowActions({
  row,
  status,
  rowPending,
  restorePending,
  cutPending,
  stopPending,
  playPending,
  testPending = false,
  runtimeRow,
  isTestingTarget = false,
  isTestingRunning = false,
  hasConnectedRepository,
  repositoryRemoteUrl,
  onRepair,
  onPlay,
  onStop,
  onSetTestingTarget,
  showTestingTargetButton = true,
  onCutConfirm,
  variant = "dashboard",
  isTestingInstancePending = false,
  isNewSplitPending = false,
  onRunLocal,
  onOpenTerminal,
  onNewSplitTerminal,
  closeWorktreePending = false,
}: WorktreeRowActionsProps) {
  const [isTestingToggleHovered, setIsTestingToggleHovered] = useState(false);
  const [isPrCheckPending, setIsPrCheckPending] = useState(false);
  const [activePr, setActivePr] = useState<{ number: number; title: string; url: string } | null>(null);
  const [hasCheckedForPr, setHasCheckedForPr] = useState(false);
  const [prCheckError, setPrCheckError] = useState<string | null>(null);
  const [pendingGitAction, setPendingGitAction] = useState<string | null>(null);
  const [isGitConditionRefreshPending, setIsGitConditionRefreshPending] = useState(false);
  const [isMergeInProgress, setIsMergeInProgress] = useState(false);
  const [hasUpstream, setHasUpstream] = useState(true);
  const [isCommitingDialogOpen, setIsCommitingDialogOpen] = useState(false);
  const [isCommitingStatePending, setIsCommitingStatePending] = useState(false);
  const [commitingState, setCommitingState] = useState<CommitingFileState>(EMPTY_COMMITING_FILE_STATE);
  const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<string[]>([]);
  const [selectedUntrackedFiles, setSelectedUntrackedFiles] = useState<string[]>([]);
  const [selectedStagedFiles, setSelectedStagedFiles] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");

  const showUnsetTestingPreview = isTestingTarget && isTestingToggleHovered;
  const testingTooltipLabel = isTestingTarget
    ? showUnsetTestingPreview
      ? "Unset testing target"
      : isTestingRunning
        ? "Testing running on this target"
        : "Testing target set"
    : "Set testing target";
  const testingAriaLabel = isTestingTarget
    ? showUnsetTestingPreview
      ? `Unset testing target for ${row.worktree}`
      : `Testing target set to ${row.worktree}`
    : `Set testing target to ${row.worktree}`;
  const testingButtonClasses = isTestingTarget
    ? showUnsetTestingPreview
      ? `h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`
      : `h-8 w-8 p-0 ${ACTIVE_TESTING_BUTTON_CLASSES} ${SOFT_RED_BUTTON_CLASSES}`
    : "h-8 w-8 p-0 transition-colors hover:bg-cyan-500/20 hover:text-cyan-700 hover:border-cyan-700/55 dark:hover:text-cyan-200 dark:hover:border-cyan-300/70";
  const branchName = (row.branchGuess || row.worktree).trim();
  const createPrUrl = buildCreatePrUrl(repositoryRemoteUrl, branchName);
  const hasRepositoryRemote = Boolean(repositoryRemoteUrl);
  const pushActionLabel = hasUpstream ? "Push" : "Push (set upstream)";
  const gitActionIconClasses = "mr-2 size-4 transition-colors group-data-[highlighted]:text-sky-600 dark:group-data-[highlighted]:text-sky-300";

  const handleOpenBranch = async (): Promise<void> => {
    const result = await ghOpenBranch({
      path: row.path,
      branch: branchName,
    });
    if (!result.ok) {
      toast.error("Failed to open branch.");
    }
  };

  const handleRefreshPrCheck = async (): Promise<void> => {
    setHasCheckedForPr(false);
    setActivePr(null);
    setIsPrCheckPending(true);
    setPrCheckError(null);
    try {
      const result = await ghCheckBranchPr({
        path: row.path,
        branch: branchName,
      });
      setHasCheckedForPr(true);
      if (!result.ok) {
        setActivePr(null);
        setPrCheckError(result.error ?? "Failed to check active pull request.");
        return;
      }

      setActivePr(result.prs.length === 1 ? result.prs[0] : null);
    } catch {
      setHasCheckedForPr(true);
      setActivePr(null);
      setPrCheckError("Failed to check active pull request.");
    } finally {
      setIsPrCheckPending(false);
    }
  };

  const handleOpenActivePr = async (): Promise<void> => {
    if (!activePr) {
      return;
    }

    const result = await ghOpenActivePr({
      path: row.path,
      branch: branchName,
    });
    if (!result.ok) {
      toast.error("Failed to open active PR.");
    }
  };

  const refreshGitDropdownConditions = async (): Promise<void> => {
    if (pendingGitAction) {
      return;
    }

    setIsGitConditionRefreshPending(true);
    try {
      const [statusResult, stagedResult, mergeResult, upstreamResult] = await Promise.all([
        gitStatus({ path: row.path }),
        gitHasStagedChanges({ path: row.path }),
        gitMergeInProgress({ path: row.path }),
        gitHasUpstream({ path: row.path }),
      ]);

      if (!statusResult.ok) {
        toast.error("Failed to refresh git state.");
      }

      if (!stagedResult.ok) {
        toast.error("Failed to check staged changes.");
      }

      if (!mergeResult.ok) {
        toast.error("Failed to check merge status.");
      }

      if (!upstreamResult.ok) {
        toast.error("Failed to check upstream status.");
      }

      if (mergeResult.ok) {
        setIsMergeInProgress(mergeResult.value);
      }
      if (upstreamResult.ok) {
        setHasUpstream(upstreamResult.value);
      }
    } catch {
      toast.error("Failed to refresh git state.");
    } finally {
      setIsGitConditionRefreshPending(false);
    }
  };

  const ensureCleanWorktree = async (actionLabel: string): Promise<boolean> => {
    const result = await gitStatus({ path: row.path });
    if (!result.ok) {
      toast.error(`Failed to check git status before ${actionLabel.toLowerCase()}.`);
      return false;
    }

    if (!result.dirty) {
      return true;
    }

    toast.warning(`${actionLabel} blocked: worktree has uncommitted changes.`);
    return false;
  };

  const runGitAction = async (
    actionLabel: string,
    action: () => Promise<{ ok: boolean; error?: string; requestId?: string; outputSnippet?: string }>,
    options?: { requireClean?: boolean; refreshConditionsAfterSuccess?: boolean },
  ): Promise<boolean> => {
    if (pendingGitAction) {
      return false;
    }

    if (options?.requireClean) {
      const canContinue = await ensureCleanWorktree(actionLabel);
      if (!canContinue) {
        return false;
      }
    }

    setPendingGitAction(actionLabel);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(`${actionLabel} completed.`);
        if (options?.refreshConditionsAfterSuccess) {
          void refreshGitDropdownConditions();
        }
        return true;
      }
      toast.error(`${actionLabel} failed.`);
      return false;
    } catch {
      toast.error(`${actionLabel} request failed.`);
      return false;
    } finally {
      setPendingGitAction(null);
    }
  };

  const handleRefreshGitStatus = async (): Promise<void> => {
    if (pendingGitAction) {
      return;
    }

    setPendingGitAction("Refresh status");
    try {
      const status = await gitStatus({ path: row.path });

      if (!status.ok) {
        toast.error("Failed to refresh git status.");
        return;
      }

      toast.success("Git status refreshed.");
    } catch {
      toast.error("Failed to refresh git status.");
    } finally {
      setPendingGitAction(null);
    }
  };

  const clearCommitingSelection = (): void => {
    setSelectedUnstagedFiles([]);
    setSelectedUntrackedFiles([]);
    setSelectedStagedFiles([]);
  };

  const refreshCommitingState = async (): Promise<void> => {
    setIsCommitingStatePending(true);
    try {
      const result = await gitListFileStates({ path: row.path });
      if (!result.ok) {
        toast.error("Failed to load file states.");
        return;
      }

      setCommitingState({
        staged: result.staged,
        unstaged: result.unstaged,
        untracked: result.untracked,
      });
      clearCommitingSelection();
    } catch {
      toast.error("Failed to load file states.");
    } finally {
      setIsCommitingStatePending(false);
    }
  };

  const handleStagePanelFiles = async (actionLabel: string, files: string[]): Promise<void> => {
    if (!files.length) {
      return;
    }

    const didStage = await runGitAction(
      actionLabel,
      () => gitStageFiles({ path: row.path, files }),
      { refreshConditionsAfterSuccess: true },
    );
    if (didStage) {
      void refreshCommitingState();
    }
  };

  const handleUnstagePanelFiles = async (actionLabel: string, files: string[]): Promise<void> => {
    if (!files.length) {
      return;
    }

    const didUnstage = await runGitAction(
      actionLabel,
      () => gitUnstageFiles({ path: row.path, files }),
      { refreshConditionsAfterSuccess: true },
    );
    if (didUnstage) {
      void refreshCommitingState();
    }
  };

  const handleCommit = async (): Promise<void> => {
    if (pendingGitAction) {
      return;
    }

    if (!commitingState.staged.length) {
      toast.warning("Commit blocked: no staged changes.");
      return;
    }

    const message = commitMessage.trim();

    const didCommit = await runGitAction(
      "Commit",
      () => gitCommit({ path: row.path, message }),
      { refreshConditionsAfterSuccess: true },
    );

    if (didCommit) {
      setCommitMessage("");
      setIsCommitingDialogOpen(false);
      setCommitingState(EMPTY_COMMITING_FILE_STATE);
      clearCommitingSelection();
    }
  };

  const handleCommitAndPush = async (): Promise<void> => {
    if (pendingGitAction) {
      return;
    }

    if (!commitingState.staged.length) {
      toast.warning("Commit blocked: no staged changes.");
      return;
    }

    const message = commitMessage.trim();
    const didCommit = await runGitAction(
      "Commit",
      () => gitCommit({ path: row.path, message }),
      { refreshConditionsAfterSuccess: true },
    );

    if (!didCommit) {
      return;
    }

    const didPush = await runGitAction(
      pushActionLabel,
      () =>
        gitPush(
          hasUpstream
            ? { path: row.path }
            : { path: row.path, setUpstream: true, branch: branchName },
        ),
      { requireClean: true },
    );

    if (didPush) {
      setCommitMessage("");
      setIsCommitingDialogOpen(false);
      setCommitingState(EMPTY_COMMITING_FILE_STATE);
      clearCommitingSelection();
    }
  };

  const toggleSelection = (
    value: string,
    selected: string[],
    setSelected: (files: string[]) => void,
  ): void => {
    if (selected.includes(value)) {
      setSelected(selected.filter((entry) => entry !== value));
      return;
    }
    setSelected([...selected, value]);
  };

  const isCommitingMutationPending =
    pendingGitAction === "Add unstaged selected" ||
    pendingGitAction === "Add untracked selected" ||
    pendingGitAction === "Remove staged selected" ||
    pendingGitAction === "Add all unstaged" ||
    pendingGitAction === "Add all untracked" ||
    pendingGitAction === "Commit" ||
    pendingGitAction === pushActionLabel;

  const commitDisabledReason = isCommitingStatePending
    ? "Refreshing file state..."
    : isCommitingMutationPending
      ? "A git action is already in progress."
      : !commitingState.staged.length
        ? "Stage at least one file to commit."
        : "";
  const isCommitDisabled = Boolean(commitDisabledReason);

  const gitAction = (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          void refreshGitDropdownConditions();
          if (hasRepositoryRemote) {
            void handleRefreshPrCheck();
          } else {
            setHasCheckedForPr(false);
            setActivePr(null);
            setPrCheckError(null);
          }
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`h-8 w-8 p-0 ${SOFT_ORANGE_BUTTON_CLASSES}`}
              disabled={!hasConnectedRepository}
              aria-label={`Git actions for ${row.worktree}`}
            >
              <GitBranch aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Git actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="group"
            disabled={Boolean(pendingGitAction)}
            onSelect={(event) => {
              event.preventDefault();
              void handleRefreshGitStatus();
            }}
          >
            <RefreshCw aria-hidden="true" className={gitActionIconClasses} />
            {pendingGitAction === "Refresh status" ? "Refreshing status..." : "Refresh status"}
          </DropdownMenuItem>
        <DropdownMenuItem
          className="group"
          disabled={Boolean(pendingGitAction) || isGitConditionRefreshPending}
          onSelect={(event) => {
            event.preventDefault();
            setIsCommitingDialogOpen(true);
            void refreshCommitingState();
          }}
        >
          <GitCommitHorizontal aria-hidden="true" className={gitActionIconClasses} />
          Commit
        </DropdownMenuItem>
        <div className="my-1 h-px bg-border" role="separator" />
        <DropdownMenuItem
          className="group"
          disabled={Boolean(pendingGitAction) || !hasRepositoryRemote}
          onSelect={(event) => {
            event.preventDefault();
            void runGitAction("Pull", () => gitPull({ path: row.path, rebase: true }), { requireClean: true });
          }}
        >
          <ArrowDownToLine aria-hidden="true" className={gitActionIconClasses} />
          {pendingGitAction === "Pull" ? "Pulling..." : "Pull"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group"
          disabled={Boolean(pendingGitAction) || !hasRepositoryRemote}
          onSelect={(event) => {
            event.preventDefault();
            void runGitAction(
              pushActionLabel,
              () =>
                gitPush(
                  hasUpstream
                    ? { path: row.path }
                    : { path: row.path, setUpstream: true, branch: branchName },
                ),
              { requireClean: true },
            );
          }}
        >
          <ArrowUpToLine aria-hidden="true" className={gitActionIconClasses} />
          {pendingGitAction === pushActionLabel ? "Pushing..." : pushActionLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group"
          disabled={Boolean(pendingGitAction) || !hasRepositoryRemote}
          onSelect={(event) => {
            event.preventDefault();
            void runGitAction(
              "Push (force with lease)",
              () => gitPush({ path: row.path, forceWithLease: true }),
              { requireClean: true },
            );
          }}
        >
          <ArrowUpToLine aria-hidden="true" className={gitActionIconClasses} />
          {pendingGitAction === "Push (force with lease)" ? "Pushing..." : "Push (force with lease)"}
        </DropdownMenuItem>
        {isMergeInProgress ? (
          <DropdownMenuItem
            className="group"
            disabled={Boolean(pendingGitAction) || isGitConditionRefreshPending}
            onSelect={(event) => {
              event.preventDefault();
                void runGitAction("Abort merge", () => gitMergeAbort({ path: row.path }), { refreshConditionsAfterSuccess: true });
              }}
            >
              <X aria-hidden="true" className={gitActionIconClasses} />
              {pendingGitAction === "Abort merge" ? "Aborting merge..." : "Abort merge"}
            </DropdownMenuItem>
        ) : null}
        <div className="my-1 h-px bg-border" role="separator" />
        {!hasRepositoryRemote ? (
          <DropdownMenuItem className="group" disabled>
            <CircleSlash aria-hidden="true" className={gitActionIconClasses} />
            No remote configured; pull/push/PR actions unavailable
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="group"
          disabled={!hasRepositoryRemote}
          onSelect={(event) => {
            event.preventDefault();
            void handleOpenBranch();
          }}
        >
          <GitBranch aria-hidden="true" className={gitActionIconClasses} />
          Open branch
        </DropdownMenuItem>
        {activePr ? (
          <DropdownMenuItem
            className="group"
            disabled={isPrCheckPending}
            onSelect={(event) => {
              event.preventDefault();
              void handleOpenActivePr();
            }}
          >
            <GitPullRequest aria-hidden="true" className={gitActionIconClasses} />
            Open pull request
          </DropdownMenuItem>
        ) : null}
        {prCheckError ? (
          <DropdownMenuItem className="group" disabled>
            <CircleSlash aria-hidden="true" className={gitActionIconClasses} />
            {prCheckError}
          </DropdownMenuItem>
        ) : null}
        {hasRepositoryRemote && !activePr && hasCheckedForPr && !prCheckError && !isPrCheckPending ? (
          <DropdownMenuItem
            className="group"
            onSelect={(event) => {
              event.preventDefault();
              if (!createPrUrl) {
                return;
              }
              window.open(createPrUrl, "_blank", "noopener,noreferrer");
            }}
          >
            <GitPullRequestCreate aria-hidden="true" className={gitActionIconClasses} />
            Create pull request
          </DropdownMenuItem>
        ) : null}
        {isPrCheckPending ? (
          <DropdownMenuItem className="group" disabled>
            <Loader2 aria-hidden="true" className={`${gitActionIconClasses} animate-spin`} />
            Checking PR status
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="flex items-center justify-end gap-1">
      {variant === "worktree-detail" ? (
        <>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              if (onRunLocal) {
                onRunLocal(row.worktree);
              }
            }}
            disabled={isTestingInstancePending}
          >
            {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
            <span>Run local</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              if (onOpenTerminal) {
                onOpenTerminal(row.worktree);
              }
            }}
            disabled={isTestingInstancePending}
            aria-label={`Open terminal for ${row.worktree}`}
          >
            {isTestingInstancePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Terminal aria-hidden="true" className="size-4" />}
            <span>Open terminal</span>
          </Button>
          {onNewSplitTerminal ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                onNewSplitTerminal(row.worktree);
              }}
              disabled={isNewSplitPending}
              aria-label={`Open new terminal split for ${row.worktree}`}
            >
              {isNewSplitPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
              <span>New split</span>
            </Button>
          ) : null}
          {gitAction}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 ${SOFT_AMBER_BUTTON_CLASSES}`}
                onClick={() => {
                  onStop(row, runtimeRow);
                }}
                disabled={rowPending || closeWorktreePending}
                aria-label={`Pause Groove for ${row.worktree}`}
              >
                {closeWorktreePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Pause aria-hidden="true" className="size-4" />}
                <span>Pause Groove</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause Groove</TooltipContent>
          </Tooltip>
        </>
      ) : (
        <>
      {status === "corrupted" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  onRepair(row);
                }}
                aria-label={`Repair ${row.worktree}`}
                disabled={rowPending}
              >
                {restorePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Wrench aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Repair</TooltipContent>
          </Tooltip>
          {gitAction}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Remove worktree ${row.worktree}`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <X aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove worktree</TooltipContent>
          </Tooltip>
        </>
      )}
      {status === "deleted" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  onRepair(row);
                }}
                aria-label={`Restore ${row.worktree}`}
                disabled={rowPending}
              >
                {restorePending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restore</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Forget deleted worktree ${row.worktree} forever`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <X aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forget forever</TooltipContent>
          </Tooltip>
        </>
      )}
      {status === "paused" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_GREEN_BUTTON_CLASSES}`}
                onClick={() => {
                  onPlay(row);
                }}
                aria-label={`Play groove for ${row.worktree}`}
                disabled={rowPending}
              >
                {playPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Play groove</TooltipContent>
          </Tooltip>
          {showTestingTargetButton ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={testingButtonClasses}
                  onClick={() => {
                    if (onSetTestingTarget) {
                      onSetTestingTarget(row);
                    }
                  }}
                  onMouseEnter={() => setIsTestingToggleHovered(true)}
                  onMouseLeave={() => setIsTestingToggleHovered(false)}
                  aria-label={testingAriaLabel}
                  disabled={rowPending}
                >
                  {testPending ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : showUnsetTestingPreview ? (
                    <FlaskConicalOff aria-hidden="true" className="size-4" />
                  ) : (
                    <FlaskConical aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{testingTooltipLabel}</TooltipContent>
            </Tooltip>
          ) : null}
          {gitAction}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Remove worktree ${row.worktree}`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <X aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove worktree</TooltipContent>
          </Tooltip>
        </>
      )}
      {status === "ready" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 ${ACTIVE_AMBER_BUTTON_CLASSES}`}
                onClick={() => {
                  onStop(row, runtimeRow);
                }}
                aria-label={`Pause Groove for ${row.worktree}`}
                disabled={rowPending}
              >
                {stopPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Pause aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause Groove</TooltipContent>
          </Tooltip>
          {showTestingTargetButton ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={testingButtonClasses}
                  onClick={() => {
                    if (onSetTestingTarget) {
                      onSetTestingTarget(row);
                    }
                  }}
                  onMouseEnter={() => setIsTestingToggleHovered(true)}
                  onMouseLeave={() => setIsTestingToggleHovered(false)}
                  aria-label={testingAriaLabel}
                  disabled={rowPending}
                >
                  {testPending ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : showUnsetTestingPreview ? (
                    <FlaskConicalOff aria-hidden="true" className="size-4" />
                  ) : (
                    <FlaskConical aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{testingTooltipLabel}</TooltipContent>
            </Tooltip>
          ) : null}
          {gitAction}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Remove worktree ${row.worktree}`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <X aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove worktree</TooltipContent>
          </Tooltip>
        </>
      )}
        </>
      )}
      </div>
      <Dialog
        open={isCommitingDialogOpen}
        onOpenChange={(open) => {
          setIsCommitingDialogOpen(open);
          if (!open) {
            setCommitMessage("");
            setCommitingState(EMPTY_COMMITING_FILE_STATE);
            clearCommitingSelection();
            setIsCommitingStatePending(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Commiting</DialogTitle>
            <div className="flex items-center justify-between gap-2">
              <DialogDescription>Review, stage, and commit files for {row.worktree}.</DialogDescription>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => {
                  void refreshCommitingState();
                }}
                disabled={isCommitingMutationPending || isCommitingStatePending}
                aria-label={isCommitingStatePending ? "Refreshing file state" : "Refresh file state"}
              >
                <RefreshCw aria-hidden="true" className={isCommitingStatePending ? "size-4 animate-spin" : "size-4"} />
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="order-2 space-y-2">
                <p className="text-sm font-medium">Unstaged files ({commitingState.unstaged.length})</p>
                <div className="h-64 border p-2 text-sm">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {commitingState.unstaged.length ? (
                        commitingState.unstaged.map((file) => (
                          <label key={`unstaged-${file}`} className="flex items-center gap-2 py-1">
                            <Checkbox
                              checked={selectedUnstagedFiles.includes(file)}
                              onCheckedChange={() => {
                                toggleSelection(file, selectedUnstagedFiles, setSelectedUnstagedFiles);
                              }}
                              disabled={isCommitingMutationPending || isCommitingStatePending}
                            />
                            <span className="truncate" title={file}>{file}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No unstaged files</p>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          void handleStagePanelFiles("Add all unstaged", commitingState.unstaged);
                        }}
                        disabled={!commitingState.unstaged.length || isCommitingMutationPending || isCommitingStatePending}
                        aria-label="Add all unstaged files"
                      >
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Button>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            void handleStagePanelFiles("Add unstaged selected", selectedUnstagedFiles);
                          }}
                          disabled={!selectedUnstagedFiles.length || isCommitingMutationPending || isCommitingStatePending}
                          aria-label="Stage selected unstaged files"
                        >
                          <Plus aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          disabled
                          aria-label="Remove selected unstaged files"
                        >
                          <Minus aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-3 space-y-2">
                <p className="text-sm font-medium">Staged files ({commitingState.staged.length})</p>
                <div className="h-64 border p-2 text-sm">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {commitingState.staged.length ? (
                        commitingState.staged.map((file) => (
                          <label key={`staged-${file}`} className="flex items-center gap-2 py-1">
                            <Checkbox
                              checked={selectedStagedFiles.includes(file)}
                              onCheckedChange={() => {
                                toggleSelection(file, selectedStagedFiles, setSelectedStagedFiles);
                              }}
                              disabled={isCommitingMutationPending || isCommitingStatePending}
                            />
                            <span className="truncate" title={file}>{file}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No staged files</p>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        disabled
                        aria-label="Add selected staged files"
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          void handleUnstagePanelFiles("Remove staged selected", selectedStagedFiles);
                        }}
                        disabled={!selectedStagedFiles.length || isCommitingMutationPending || isCommitingStatePending}
                        aria-label="Unstage selected files"
                      >
                        <Minus aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 space-y-2">
                <p className="text-sm font-medium">Untracked files ({commitingState.untracked.length})</p>
                <div className="h-64 border p-2 text-sm">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {commitingState.untracked.length ? (
                        commitingState.untracked.map((file) => (
                          <label key={`untracked-${file}`} className="flex items-center gap-2 py-1">
                            <Checkbox
                              checked={selectedUntrackedFiles.includes(file)}
                              onCheckedChange={() => {
                                toggleSelection(file, selectedUntrackedFiles, setSelectedUntrackedFiles);
                              }}
                              disabled={isCommitingMutationPending || isCommitingStatePending}
                            />
                            <span className="truncate" title={file}>{file}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No untracked files</p>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          void handleStagePanelFiles("Add all untracked", commitingState.untracked);
                        }}
                        disabled={!commitingState.untracked.length || isCommitingMutationPending || isCommitingStatePending}
                        aria-label="Add all untracked files"
                      >
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Button>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            void handleStagePanelFiles("Add untracked selected", selectedUntrackedFiles);
                          }}
                          disabled={!selectedUntrackedFiles.length || isCommitingMutationPending || isCommitingStatePending}
                          aria-label="Stage selected untracked files"
                        >
                          <Plus aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          disabled
                          aria-label="Remove selected untracked files"
                        >
                          <Minus aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Input
              value={commitMessage}
              onChange={(event) => {
                setCommitMessage(event.target.value);
              }}
              placeholder="Commit message (optional)"
              disabled={isCommitingMutationPending || isCommitingStatePending}
            />
          </div>
          <DialogFooter className="sm:items-center">
            <p className="min-h-5 text-sm text-muted-foreground sm:mr-auto">{commitDisabledReason}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCommitingDialogOpen(false);
                setCommitMessage("");
                setCommitingState(EMPTY_COMMITING_FILE_STATE);
                clearCommitingSelection();
              }}
              disabled={isCommitingMutationPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void handleCommit();
              }}
              disabled={isCommitDisabled}
            >
              {pendingGitAction === "Commit" ? "Committing..." : "Commit"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleCommitAndPush();
              }}
              disabled={isCommitDisabled}
            >
              {pendingGitAction === "Commit"
                ? "Committing..."
                : pendingGitAction === pushActionLabel
                  ? "Pushing..."
                  : "Commit and push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
