import { Coins } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import type { WorktreeUnit } from "@/src/lib/ipc";
import { cn } from "@/src/lib/utils";

export type RewardClaimSnapshot = {
  worktree: string;
  unit: WorktreeUnit | null;
  gold: number;
};

type RewardClaimModalProps = {
  snapshot: RewardClaimSnapshot | null;
  onClose: () => void;
};

export function RewardClaimModal({ snapshot, onClose }: RewardClaimModalProps) {
  const isOpen = snapshot !== null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        {snapshot ? (
          <div className="space-y-4">
            <header className="space-y-1">
              <DialogTitle className="text-lg">Bounty claimed</DialogTitle>
              <DialogDescription>
                {snapshot.unit?.name ?? "Unit"} from{" "}
                <span className="font-mono text-foreground">
                  {snapshot.worktree}
                </span>{" "}
                paid its bounty. Loot is collected separately from the looting
                badge.
              </DialogDescription>
            </header>

            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border-2 border-amber-500/55 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300",
              )}
            >
              <Coins aria-hidden="true" className="h-5 w-5" />
              <span className="text-2xl font-bold tabular-nums">
                {String(snapshot.gold)}
              </span>
              <span className="text-xs uppercase tracking-[0.18em]">gold</span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
