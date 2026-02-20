import { CircleStop, FlaskConical, Loader2, Play, Trash2, Wrench } from "lucide-react";

import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/dashboard/constants";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RuntimeStateRow, WorktreeRow, WorktreeStatus } from "@/components/pages/dashboard/types";

type WorktreeRowActionsProps = {
  row: WorktreeRow;
  status: WorktreeStatus;
  rowPending: boolean;
  restorePending: boolean;
  cutPending: boolean;
  stopPending: boolean;
  playPending: boolean;
  testPending: boolean;
  runtimeRow: RuntimeStateRow | undefined;
  isCurrentTestingTarget: boolean;
  onRepair: (row: WorktreeRow) => void;
  onPlay: (row: WorktreeRow) => void;
  onStop: (row: WorktreeRow, runtimeRow: RuntimeStateRow | undefined) => void;
  onSetTestingTarget: (row: WorktreeRow) => void;
  onCutConfirm: (row: WorktreeRow) => void;
};

export function WorktreeRowActions({
  row,
  status,
  rowPending,
  restorePending,
  cutPending,
  stopPending,
  playPending,
  testPending,
  runtimeRow,
  isCurrentTestingTarget,
  onRepair,
  onPlay,
  onStop,
  onSetTestingTarget,
  onCutConfirm,
}: WorktreeRowActionsProps) {
  const opencodeState = runtimeRow?.opencodeState ?? "unknown";
  const opencodeInstanceId = runtimeRow?.opencodeInstanceId;
  const hasRunningOpencodeInstance =
    status !== "corrupted" &&
    opencodeState === "running" &&
    typeof opencodeInstanceId === "string" &&
    opencodeInstanceId.trim().length > 0;

  return (
    <div className="flex items-center justify-end gap-1">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Remove worktree ${row.worktree}`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove worktree</TooltipContent>
          </Tooltip>
        </>
      )}
      {status === "paused" && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-8 p-0 transition-colors hover:bg-green-500/20 hover:text-green-700"
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isCurrentTestingTarget ? "secondary" : "outline"}
                size="sm"
                className="h-8 w-8 p-0 transition-colors hover:bg-cyan-500/20 hover:text-cyan-700"
                onClick={() => {
                  onSetTestingTarget(row);
                }}
                aria-label={`Set testing target to ${row.worktree}`}
                disabled={rowPending}
              >
                {testPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <FlaskConical aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCurrentTestingTarget ? "Current test target" : "Set testing"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Remove worktree ${row.worktree}`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
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
                variant="secondary"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  onStop(row, runtimeRow);
                }}
                aria-label={`Stop groove for ${row.worktree}`}
                disabled={rowPending || !hasRunningOpencodeInstance}
              >
                {stopPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CircleStop aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop groove</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isCurrentTestingTarget ? "secondary" : "outline"}
                size="sm"
                className="h-8 w-8 p-0 transition-colors hover:bg-cyan-500/20 hover:text-cyan-700"
                onClick={() => {
                  onSetTestingTarget(row);
                }}
                aria-label={`Set testing target to ${row.worktree}`}
                disabled={rowPending}
              >
                {testPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <FlaskConical aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCurrentTestingTarget ? "Current test target" : "Set testing"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={`h-8 w-8 p-0 ${SOFT_RED_BUTTON_CLASSES}`}
                onClick={() => {
                  onCutConfirm(row);
                }}
                aria-label={`Remove worktree ${row.worktree}`}
                disabled={rowPending}
              >
                {cutPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove worktree</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
