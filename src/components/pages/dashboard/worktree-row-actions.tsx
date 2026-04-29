import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Scroll,
  ScrollText,
  Terminal,
  Volume2,
  VolumeOff,
  Wrench,
  X,
} from "lucide-react";

import {
  ACTIVE_AMBER_BUTTON_CLASSES,
  SOFT_AMBER_BUTTON_CLASSES,
  SOFT_GREEN_BUTTON_CLASSES,
  SOFT_ORANGE_BUTTON_CLASSES,
  SOFT_RED_BUTTON_CLASSES,
} from "@/src/components/pages/dashboard/constants";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import type { SummaryRecord } from "@/src/lib/ipc";
import type {
  WorktreeRow,
  WorktreeStatus,
} from "@/src/components/pages/dashboard/types";

type WorktreeRowActionsProps = {
  row: WorktreeRow;
  status: WorktreeStatus;
  rowPending: boolean;
  restorePending: boolean;
  cutPending: boolean;
  stopPending: boolean;
  playPending: boolean;
  onRepair: (row: WorktreeRow) => void;
  onPlay: (row: WorktreeRow) => void;
  onStop: (row: WorktreeRow) => void;
  onCutConfirm: (row: WorktreeRow) => void;
  variant?: "dashboard" | "worktree-detail";
  onOpenTerminal?: (worktree: string) => void;
  closeWorktreePending?: boolean;
  isNotificationMuted?: boolean;
  onToggleMute?: () => void;
  onSummarize?: (sessionId: string) => void;
  isSummarizePending?: boolean;
  onViewSummary?: (summary: SummaryRecord) => void;
  latestSummary?: SummaryRecord | null;
};

export function WorktreeRowActions({
  row,
  status,
  rowPending,
  restorePending,
  cutPending,
  stopPending,
  playPending,
  onRepair,
  onPlay,
  onStop,
  onCutConfirm,
  variant = "dashboard",
  onOpenTerminal,
  closeWorktreePending = false,
  isNotificationMuted = false,
  onToggleMute,
  onSummarize,
  isSummarizePending = false,
  onViewSummary,
  latestSummary = null,
}: WorktreeRowActionsProps) {
  const openTerminalAction = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-8 w-8 p-0 ${SOFT_ORANGE_BUTTON_CLASSES}`}
          onClick={() => {
            if (onOpenTerminal) {
              onOpenTerminal(row.worktree);
            }
          }}
          disabled={!onOpenTerminal || rowPending}
          aria-label={`Open terminal for ${row.worktree}`}
        >
          <Terminal aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open terminal</TooltipContent>
    </Tooltip>
  );

  const summaryActions = row.worktreeId ? (
    <>
      {latestSummary && onViewSummary ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onViewSummary(latestSummary);
              }}
              aria-label={`View summary for ${row.worktree}`}
            >
              <ScrollText aria-hidden="true" className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View summary</TooltipContent>
        </Tooltip>
      ) : null}
      {onSummarize && !latestSummary ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onSummarize(row.worktreeId!);
              }}
              disabled={isSummarizePending || rowPending}
              aria-label={
                isSummarizePending
                  ? `Summarizing ${row.worktree}...`
                  : `Summarize ${row.worktree}`
              }
            >
              {isSummarizePending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Scroll aria-hidden="true" className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isSummarizePending ? "Summarizing..." : "Summarize"}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  ) : null;

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {variant === "worktree-detail" ? (
          <>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8"
              onClick={() => {
                if (onOpenTerminal) {
                  onOpenTerminal(row.worktree);
                }
              }}
              aria-label={`New terminal for ${row.worktree}`}
            >
              <Terminal aria-hidden="true" className="size-4" />
              <span>New terminal</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    if (onToggleMute) {
                      onToggleMute();
                    }
                  }}
                  aria-label={
                    isNotificationMuted
                      ? `Unmute notifications for ${row.worktree}`
                      : `Mute notifications for ${row.worktree}`
                  }
                >
                  {isNotificationMuted ? (
                    <VolumeOff
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  ) : (
                    <Volume2 aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isNotificationMuted
                  ? "Unmute notifications"
                  : "Mute notifications"}
              </TooltipContent>
            </Tooltip>
            {summaryActions}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`h-8 ${SOFT_AMBER_BUTTON_CLASSES}`}
                  onClick={() => {
                    onStop(row);
                  }}
                  disabled={rowPending || closeWorktreePending}
                  aria-label={`Pause Groove for ${row.worktree}`}
                >
                  {closeWorktreePending ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Pause aria-hidden="true" className="size-4" />
                  )}
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
                      {restorePending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Wrench aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Repair</TooltipContent>
                </Tooltip>
                {openTerminalAction}
                {summaryActions}
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
                      {cutPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <X aria-hidden="true" className="size-4" />
                      )}
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
                      {restorePending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <RotateCcw aria-hidden="true" className="size-4" />
                      )}
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
                      {cutPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <X aria-hidden="true" className="size-4" />
                      )}
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
                      {playPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Play aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Play groove</TooltipContent>
                </Tooltip>
                {openTerminalAction}
                {summaryActions}
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
                      {cutPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <X aria-hidden="true" className="size-4" />
                      )}
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
                        onStop(row);
                      }}
                      aria-label={`Pause Groove for ${row.worktree}`}
                      disabled={rowPending}
                    >
                      {stopPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Pause aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pause Groove</TooltipContent>
                </Tooltip>
                {openTerminalAction}
                {summaryActions}
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
                      {cutPending ? (
                        <Loader2
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <X aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove worktree</TooltipContent>
                </Tooltip>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
