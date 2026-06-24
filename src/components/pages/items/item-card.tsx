import { useState } from "react";

import { ItemSprite } from "@/src/components/pages/items/item-sprite";
import { getKingdom } from "@/src/lib/bestiary/definitions";
import {
  getRarityBadgeClassName,
  getRarityBorderClassName,
  type ItemDefinition,
} from "@/src/lib/items/definitions";
import { cn } from "@/src/lib/utils";

type ItemCardProps = {
  item: ItemDefinition;
  count?: number;
  onSelect?: (item: ItemDefinition) => void;
  className?: string;
};

function getSourceLabel(item: ItemDefinition): string {
  if (item.source.kind === "universal") {
    return "Universal";
  }
  if (item.source.kind === "kingdom") {
    return getKingdom(item.source.kingdom).label;
  }
  return `${item.source.bugName} · iconic`;
}

export function ItemCard({ item, count, onSelect, className }: ItemCardProps) {
  const owned = typeof count === "number" && count > 0;
  const sourceLabel = getSourceLabel(item);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.(item);
      }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onFocus={() => {
        setIsHovered(true);
      }}
      onBlur={() => {
        setIsHovered(false);
      }}
      className={cn(
        "group relative flex w-60 flex-col gap-3 rounded-md border-2 bg-background/50 p-4 text-left transition hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        getRarityBorderClassName(item.rarity),
        !owned && "opacity-60",
        className,
      )}
    >
      {owned ? (
        <span className="absolute right-2 top-2 z-10 rounded bg-background/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground/85 shadow-sm">
          ×{String(count)}
        </span>
      ) : null}

      <div className="flex h-32 w-full items-center justify-center overflow-hidden">
        <ItemSprite sprite={item.sprite} scale={1.5} animate={isHovered} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide",
              getRarityBadgeClassName(item.rarity),
            )}
          >
            {item.rarity}
          </span>
          <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {sourceLabel}
          </span>
        </div>
        <h3 className="text-sm font-semibold leading-tight">{item.name}</h3>
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {item.description}
        </p>
      </div>
    </button>
  );
}
