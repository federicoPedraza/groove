import { useEffect, useState } from "react";

import { Beef } from "lucide-react";

import { ItemCard } from "@/src/components/pages/items/item-card";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  getItemDefinition,
  type ItemDefinition,
} from "@/src/lib/items/definitions";
import type { WorktreeLootEntry } from "@/src/lib/ipc";
import { cn } from "@/src/lib/utils";

export type LootingSnapshot = {
  worktree: string;
  unitName: string;
  loot: readonly WorktreeLootEntry[];
};

type LootingModalProps = {
  snapshot: LootingSnapshot | null;
  onClose: () => void;
};

type ResolvedLootEntry = {
  key: string;
  rawItemId: string;
  definition: ItemDefinition | null;
};

function resolveEntries(
  loot: readonly WorktreeLootEntry[],
): ResolvedLootEntry[] {
  return loot.map((entry, index) => ({
    key: `${entry.itemId}-${String(index)}`,
    rawItemId: entry.itemId,
    definition: getItemDefinition(entry.itemId) ?? null,
  }));
}

export function LootingModal({ snapshot, onClose }: LootingModalProps) {
  const isOpen = snapshot !== null;
  const [revealedCount, setRevealedCount] = useState(0);

  // Re-arm the reveal counter whenever a new looting session opens. We start
  // at 1 (or 0 for empty loot) so the first card is visible immediately.
  useEffect(() => {
    if (!snapshot) {
      setRevealedCount(0);
      return;
    }
    setRevealedCount(snapshot.loot.length === 0 ? 0 : 1);
  }, [snapshot]);

  const entries = snapshot ? resolveEntries(snapshot.loot) : [];
  const totalEntries = entries.length;
  const allRevealed = revealedCount >= totalEntries;
  const currentEntry =
    revealedCount > 0 ? entries[revealedCount - 1] ?? null : null;

  const advance = () => {
    setRevealedCount((prev) => Math.min(prev + 1, totalEntries));
  };

  const acceptAll = () => {
    setRevealedCount(totalEntries);
    onClose();
  };

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
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Beef
                  aria-hidden="true"
                  className="h-5 w-5 text-rose-500"
                />
                Looting {snapshot.unitName}
              </DialogTitle>
              <DialogDescription>
                {totalEntries === 0
                  ? "Nothing dropped this time."
                  : `${String(revealedCount)} / ${String(totalEntries)} revealed — click the card to flip the next one.`}
              </DialogDescription>
            </header>

            <div className="flex min-h-[18rem] items-center justify-center">
              {totalEntries === 0 ? (
                <div className="rounded-md border border-dashed border-muted-foreground/40 px-6 py-10 text-center text-sm text-muted-foreground">
                  No loot was found on this unit.
                </div>
              ) : currentEntry ? (
                <LootRevealCard
                  entry={currentEntry}
                  index={revealedCount - 1}
                  total={totalEntries}
                  hasNext={revealedCount < totalEntries}
                  onAdvance={advance}
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-xs tabular-nums text-muted-foreground">
                {totalEntries === 0
                  ? "Nothing collected"
                  : `${String(Math.min(revealedCount, totalEntries))} / ${String(totalEntries)}`}
              </p>
              <Button
                type="button"
                variant={allRevealed ? "default" : "secondary"}
                onClick={acceptAll}
              >
                {totalEntries === 0
                  ? "Close"
                  : allRevealed
                    ? "Done"
                    : "Accept all"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type LootRevealCardProps = {
  entry: ResolvedLootEntry;
  index: number;
  total: number;
  hasNext: boolean;
  onAdvance: () => void;
};

function LootRevealCard({
  entry,
  index,
  total,
  hasNext,
  onAdvance,
}: LootRevealCardProps) {
  // Re-key per index so React unmounts/remounts the card on advance — that
  // gives us the entrance transition for free without juggling refs or
  // animation state machines.
  return (
    <button
      key={`reveal-${String(index)}`}
      type="button"
      onClick={onAdvance}
      disabled={!hasNext}
      aria-label={
        hasNext
          ? `Reveal next loot card (${String(index + 1)} of ${String(total)})`
          : `Loot card ${String(index + 1)} of ${String(total)}`
      }
      className={cn(
        "relative inline-flex items-center justify-center rounded-md transition-transform duration-300 ease-out",
        hasNext && "cursor-pointer hover:scale-[1.02]",
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
      )}
    >
      {entry.definition ? (
        <ItemCard item={entry.definition} />
      ) : (
        <div className="rounded-md border border-dashed border-muted-foreground/40 px-6 py-10 text-center text-sm text-muted-foreground">
          Unknown item: {entry.rawItemId}
        </div>
      )}
    </button>
  );
}
