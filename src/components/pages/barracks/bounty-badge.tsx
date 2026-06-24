import type { ReactNode } from "react";

import { Beef, Coins, DiamondPlus, Loader2, Pickaxe } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import type { WorktreeState, WorktreeUnit } from "@/src/lib/ipc";
import { cn } from "@/src/lib/utils";

type BountyBadgeProps = {
  unit?: WorktreeUnit;
  state: WorktreeState;
  isDiscovering?: boolean;
  isNewDiscovery?: boolean;
  onDiscover?: () => void;
  onReward?: () => void;
  onLoot?: () => void;
};

// 1:1 square "icon badge" sized to match the height of the regular Badge
// primitive (text-xs line-height + py-0.5 + border = 22 px tall). `aspect-square`
// forces the width to follow the height so it stays a perfect square.
const BADGE_BASE_CLASSES =
  "inline-flex aspect-square items-center justify-center rounded-md border bg-transparent px-0.5 py-0.5 text-xs font-medium [&>svg]:size-4 transition-colors";
const NEUTRAL_CLASSES = "border-input text-muted-foreground";
const NEUTRAL_INTERACTIVE_CLASSES =
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const GOLD_CLASSES = "border-yellow-500 text-yellow-400";
const GOLD_INTERACTIVE_CLASSES =
  "hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-yellow-500/60 disabled:pointer-events-none disabled:opacity-50";
const LOOT_CLASSES = "border-rose-500 text-rose-400";
const LOOT_INTERACTIVE_CLASSES =
  "hover:text-rose-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/60 disabled:pointer-events-none disabled:opacity-50";

function NewDiscoveryIndicator() {
  return (
    <span
      aria-label="New discovery"
      className="pointer-events-none absolute -top-1 -right-1 inline-flex items-center justify-center text-cyan-300 drop-shadow-[0_0_2px_rgba(0,0,0,0.65)]"
    >
      <DiamondPlus aria-hidden="true" className="size-3" />
    </span>
  );
}

export function BountyBadge({
  unit,
  state,
  isDiscovering = false,
  isNewDiscovery = false,
  onDiscover,
  onReward,
  onLoot,
}: BountyBadgeProps) {
  const wrap = (node: ReactNode) => {
    if (!isNewDiscovery) return node;
    return (
      <span className="relative inline-flex">
        {node}
        <NewDiscoveryIndicator />
      </span>
    );
  };

  // Discovery in flight → always-visible spinner, regardless of state/unit.
  if (isDiscovering) {
    return wrap(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(BADGE_BASE_CLASSES, NEUTRAL_CLASSES)}
              role="status"
              aria-label="Discovering"
              tabIndex={0}
            >
              <Loader2 aria-hidden="true" className="animate-spin" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Discovering…</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
  }

  // Only the wounded / defeated lifecycle stages surface the loot UI.
  if (state !== "wounded" && state !== "defeated") {
    return null;
  }

  // No unit yet (wounded or defeated) → Discover button.
  if (!unit) {
    return wrap(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                BADGE_BASE_CLASSES,
                NEUTRAL_CLASSES,
                NEUTRAL_INTERACTIVE_CLASSES,
              )}
              onClick={onDiscover}
              disabled={!onDiscover}
              aria-label="Discover"
            >
              <Pickaxe aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Discover</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
  }

  // Wounded with a unit → discovery is complete, the unit owns the row;
  // there's no separate loot affordance to surface.
  if (state === "wounded") {
    return null;
  }

  // Defeated with a unit, gold not yet claimed → bounty (Coins).
  if (unit.rewarded !== true) {
    const tooltip = String(unit.reward);
    return wrap(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                BADGE_BASE_CLASSES,
                GOLD_CLASSES,
                GOLD_INTERACTIVE_CLASSES,
              )}
              onClick={onReward}
              disabled={!onReward}
              aria-label={`Claim bounty ${tooltip}`}
            >
              <Coins aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
  }

  // Gold already claimed but loot still uncollected → looting badge (Beef).
  // `looted` may be undefined on units saved before the gold/loot split;
  // treat that as "not looted yet" per the new schema contract.
  if (unit.looted !== true) {
    return wrap(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                BADGE_BASE_CLASSES,
                LOOT_CLASSES,
                LOOT_INTERACTIVE_CLASSES,
              )}
              onClick={onLoot}
              disabled={!onLoot}
              aria-label="Loot"
            >
              <Beef aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Loot</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
  }

  // Both gold claimed and loot collected → row is done, hide.
  return null;
}
