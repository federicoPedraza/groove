import { useEffect, useState } from "react";

import { ItemSprite } from "@/src/components/pages/items/item-sprite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  getBugDefinition,
  getKingdom,
  type KingdomMeta,
} from "@/src/lib/bestiary/definitions";
import {
  getRarityBadgeClassName,
  type ItemDefinition,
} from "@/src/lib/items/definitions";
import { cn } from "@/src/lib/utils";

type ItemDetailCardProps = {
  open: boolean;
  item: ItemDefinition | null;
  count: number;
  onClose: () => void;
};

type ItemTheme = {
  cardClassName: string;
  cardInnerBorderClassName: string;
  cardSubtitleClassName: string;
  sourceLabel: string;
};

const UNIVERSAL_THEME: ItemTheme = {
  cardClassName: "border-zinc-700 bg-zinc-900 text-zinc-50",
  cardInnerBorderClassName: "border-zinc-400",
  cardSubtitleClassName: "text-zinc-300/80",
  sourceLabel: "Universal drop",
};

function themeFromKingdom(kingdom: KingdomMeta, sourceLabel: string): ItemTheme {
  return {
    cardClassName: kingdom.cardClassName,
    cardInnerBorderClassName: kingdom.cardInnerBorderClassName,
    cardSubtitleClassName: kingdom.cardSubtitleClassName,
    sourceLabel,
  };
}

function getItemTheme(item: ItemDefinition): ItemTheme {
  if (item.source.kind === "universal") {
    return UNIVERSAL_THEME;
  }
  if (item.source.kind === "kingdom") {
    const kingdom = getKingdom(item.source.kingdom);
    return themeFromKingdom(kingdom, `${kingdom.label} · shared drop`);
  }
  const bug = getBugDefinition(item.source.bugName);
  if (!bug) {
    return UNIVERSAL_THEME;
  }
  const kingdom = getKingdom(bug.kingdom);
  return themeFromKingdom(kingdom, `${item.source.bugName} · iconic`);
}

export function ItemDetailCard({
  open,
  item,
  count,
  onClose,
}: ItemDetailCardProps) {
  const isOpen = open && item !== null;
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsFlipped(false);
    }
  }, [isOpen, item?.id]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm border-none bg-transparent p-0 shadow-none">
        {item ? (
          <div className="[perspective:1200px]">
            <button
              type="button"
              onClick={() => {
                setIsFlipped((flipped) => !flipped);
              }}
              aria-label={
                isFlipped
                  ? `Show front of ${item.name} card`
                  : `Show back of ${item.name} card`
              }
              className={cn(
                "relative block aspect-[3/4] w-full rounded-lg transition-transform duration-500 will-change-transform [transform-style:preserve-3d]",
                isFlipped
                  ? "[transform:rotateY(180deg)]"
                  : "[transform:rotateY(0deg)]",
              )}
            >
              <ItemCardFront
                item={item}
                count={count}
                ariaHidden={isFlipped}
              />
              <ItemCardBack
                item={item}
                count={count}
                ariaHidden={!isFlipped}
              />
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type FaceProps = {
  item: ItemDefinition;
  count: number;
  ariaHidden: boolean;
};

function ItemCardFront({ item, count, ariaHidden }: FaceProps) {
  const theme = getItemTheme(item);
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn(
        "absolute inset-0 rounded-lg border-2 p-2 shadow-lg [backface-visibility:hidden]",
        theme.cardClassName,
      )}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-between gap-3 rounded-2xs border-4 p-4 text-center",
          theme.cardInnerBorderClassName,
        )}
      >
        <div className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
              getRarityBadgeClassName(item.rarity),
            )}
          >
            {item.rarity}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <ItemSprite sprite={item.sprite} scale={3} animate />
        </div>
        <div className="space-y-1">
          <DialogTitle asChild>
            <h2 className="text-2xl font-bold leading-tight tracking-wide">
              {item.name}
            </h2>
          </DialogTitle>
          <DialogDescription asChild>
            <p
              className={cn(
                "text-xs uppercase tracking-[0.18em]",
                theme.cardSubtitleClassName,
              )}
            >
              {theme.sourceLabel}
            </p>
          </DialogDescription>
          {count > 0 ? (
            <p
              className={cn(
                "pt-1 text-[10px] uppercase tracking-[0.2em]",
                theme.cardSubtitleClassName,
              )}
            >
              In stash · ×{String(count)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ItemCardBack({ item, count, ariaHidden }: FaceProps) {
  const theme = getItemTheme(item);
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn(
        "absolute inset-0 rounded-lg border-2 p-2 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]",
        theme.cardClassName,
      )}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col gap-3 overflow-y-auto rounded-2xs border-4 p-4 text-left",
          theme.cardInnerBorderClassName,
        )}
      >
        <section className="space-y-1">
          <h3
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em]",
              theme.cardSubtitleClassName,
            )}
          >
            Description
          </h3>
          <p className="text-sm leading-relaxed">{item.description}</p>
        </section>
        <section className="space-y-1">
          <h3
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em]",
              theme.cardSubtitleClassName,
            )}
          >
            Source
          </h3>
          <p className="text-sm leading-relaxed">{theme.sourceLabel}</p>
        </section>
        <section className="space-y-1">
          <h3
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em]",
              theme.cardSubtitleClassName,
            )}
          >
            Rarity
          </h3>
          <span
            className={cn(
              "inline-block rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
              getRarityBadgeClassName(item.rarity),
            )}
          >
            {item.rarity}
          </span>
        </section>
        <section className="mt-auto space-y-1">
          <h3
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em]",
              theme.cardSubtitleClassName,
            )}
          >
            Owned
          </h3>
          <p className="text-sm font-semibold tabular-nums">
            {count > 0 ? `×${String(count)}` : "None yet"}
          </p>
        </section>
      </div>
    </div>
  );
}
