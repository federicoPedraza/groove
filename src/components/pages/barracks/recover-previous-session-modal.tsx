"use client";

import { Loader2, Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import type { RunningGrooveRecord } from "@/src/lib/ipc";

type RecoverPreviousSessionModalProps = {
  open: boolean;
  grooves: RunningGrooveRecord[];
  selected: ReadonlySet<string>;
  loading: boolean;
  onToggle: (worktree: string) => void;
  onOpenChange: (open: boolean) => void;
  onDismiss: () => void;
  onRecover: () => void;
};

function RecoverPreviousSessionModal({
  open,
  grooves,
  selected,
  loading,
  onToggle,
  onOpenChange,
  onDismiss,
  onRecover,
}: RecoverPreviousSessionModalProps) {
  const selectedCount = grooves.reduce(
    (count, groove) => (selected.has(groove.worktree) ? count + 1 : count),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recover previous session</DialogTitle>
          <DialogDescription>
            {grooves.length === 1
              ? "1 groove was running when Groove closed unexpectedly. Pick which to resume."
              : `${grooves.length} grooves were running when Groove closed unexpectedly. Pick which to resume.`}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {grooves.map((groove) => {
            const checkboxId = `recover-${groove.worktree}`;
            return (
              <li key={groove.worktree}>
                <label
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selected.has(groove.worktree)}
                    disabled={loading}
                    onCheckedChange={() => onToggle(groove.worktree)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {groove.worktree}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {groove.command}
                      {groove.stillRunning ? " · still running" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            type="button"
            disabled={loading || selectedCount === 0}
            onClick={onRecover}
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Play aria-hidden="true" className="size-4" />
            )}
            <span>Recover ({selectedCount})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { RecoverPreviousSessionModal };
export type { RecoverPreviousSessionModalProps };
