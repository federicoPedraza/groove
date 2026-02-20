import { FlaskConical, FlaskConicalOff, Loader2, Pause, Play, Wrench, X } from "lucide-react";
import { useState } from "react";

import {
  ACTIVE_GREEN_BUTTON_CLASSES,
  ACTIVE_TESTING_BUTTON_CLASSES,
  SOFT_GREEN_BUTTON_CLASSES,
  SOFT_RED_BUTTON_CLASSES,
  SOFT_YELLOW_BUTTON_CLASSES,
} from "@/components/pages/dashboard/constants";
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
  isTestingTarget: boolean;
  isTestingRunning: boolean;
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
  isTestingTarget,
  isTestingRunning,
  onRepair,
  onPlay,
  onStop,
  onSetTestingTarget,
  onCutConfirm,
}: WorktreeRowActionsProps) {
  const [isReadyPlayHovered, setIsReadyPlayHovered] = useState(false);
  const [isTestingToggleHovered, setIsTestingToggleHovered] = useState(false);

  const opencodeState = runtimeRow?.opencodeState ?? "unknown";
  const opencodeInstanceId = runtimeRow?.opencodeInstanceId;
  const hasRunningOpencodeInstance =
    status !== "corrupted" &&
    opencodeState === "running" &&
    typeof opencodeInstanceId === "string" &&
    opencodeInstanceId.trim().length > 0;
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
    : "h-8 w-8 p-0 transition-colors hover:bg-cyan-500/20 hover:text-cyan-700";

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={testingButtonClasses}
                onClick={() => {
                  onSetTestingTarget(row);
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
                className={`h-8 w-8 p-0 ${isReadyPlayHovered ? SOFT_YELLOW_BUTTON_CLASSES : ACTIVE_GREEN_BUTTON_CLASSES}`}
                onClick={() => {
                  onStop(row, runtimeRow);
                }}
                onMouseEnter={() => setIsReadyPlayHovered(true)}
                onMouseLeave={() => setIsReadyPlayHovered(false)}
                aria-label={isReadyPlayHovered ? `Pause groove for ${row.worktree}` : `Groove running for ${row.worktree}`}
                disabled={rowPending || !hasRunningOpencodeInstance}
              >
                {stopPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : isReadyPlayHovered ? (
                  <Pause aria-hidden="true" className="size-4" />
                ) : (
                  <Play aria-hidden="true" className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isReadyPlayHovered ? "Pause groove" : "Groove running"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={testingButtonClasses}
                onClick={() => {
                  onSetTestingTarget(row);
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
    </div>
  );
}
