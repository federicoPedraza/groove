import { useEffect, useState } from "react";

import { ItemCard } from "@/src/components/pages/items/item-card";
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
  const hasLoot = snapshot !== null && snapshot.loot.length > 0;
  const [index, setIndex] = useState(0);

  // Start each looting session on the first card.
  useEffect(() => {
    setIndex(0);
  }, [snapshot]);

  // A loot result with nothing in it has no card to show — clear it so the
  // parent does not stay stuck holding an empty snapshot.
  useEffect(() => {
    if (snapshot !== null && snapshot.loot.length === 0) {
      onClose();
    }
  }, [snapshot, onClose]);

  const entries = snapshot ? resolveEntries(snapshot.loot) : [];
  const total = entries.length;
  const currentEntry = entries[index] ?? null;
  const isLast = index >= total - 1;

  // Clicking the card reveals the next loot item; the final click dismisses.
  const advance = () => {
    if (isLast) {
      onClose();
      return;
    }
    setIndex((prev) => Math.min(prev + 1, total - 1));
  };

  return (
    <Dialog
      open={hasLoot}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="w-fit max-w-[calc(100%-2rem)] border-none bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">
          Looting {snapshot?.unitName ?? ""}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Click the card to reveal the next item.
        </DialogDescription>
        {currentEntry ? (
          // Re-key per index so the card remounts and replays its entrance
          // animation on every advance.
          <div
            key={`loot-${String(index)}`}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            {currentEntry.definition ? (
              <ItemCard
                item={currentEntry.definition}
                onSelect={advance}
                className="cursor-pointer opacity-100 transition-transform duration-300 ease-out hover:scale-[1.02]"
              />
            ) : (
              <button
                type="button"
                onClick={advance}
                className="cursor-pointer rounded-md border border-dashed border-muted-foreground/40 px-6 py-10 text-center text-sm text-muted-foreground transition-transform duration-300 ease-out hover:scale-[1.02]"
              >
                Unknown item: {currentEntry.rawItemId}
              </button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
