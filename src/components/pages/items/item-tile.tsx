import { ItemSprite } from "@/src/components/pages/items/item-sprite";
import {
  getRarityBorderClassName,
  getRarityTextClassName,
  type ItemDefinition,
  type ItemRarity,
} from "@/src/lib/items/definitions";
import { cn } from "@/src/lib/utils";

type ItemTileProps = {
  /**
   * The item to render. Pass `null` to render a hidden / silhouette tile
   * (used for un-discovered iconics in the bestiary).
   */
  item: ItemDefinition | null;
  count?: number;
  /** Override the rarity of the silhouette outline when item is null. */
  silhouetteRarity?: ItemRarity;
  /** Optional caption under the sprite. Defaults to item.name when item is set. */
  caption?: string | null;
  className?: string;
};

export function ItemTile({
  item,
  count,
  silhouetteRarity,
  caption,
  className,
}: ItemTileProps) {
  const rarity = item?.rarity ?? silhouetteRarity ?? "common";
  const labelText = caption ?? item?.name ?? "???";

  return (
    <div
      role="listitem"
      title={item?.description ?? "Undiscovered item."}
      className={cn(
        "relative flex h-24 w-24 flex-col items-center justify-between rounded-md border-2 bg-background/50 p-1.5",
        getRarityBorderClassName(rarity),
        className,
      )}
    >
      <div className="flex h-12 w-full items-center justify-center overflow-hidden">
        {item ? (
          <ItemSprite sprite={item.sprite} scale={0.75} />
        ) : (
          <div className="h-10 w-10 rounded-sm bg-foreground/15" aria-hidden="true" />
        )}
      </div>
      <span
        className={cn(
          "line-clamp-2 w-full text-center text-[10px] leading-tight",
          getRarityTextClassName(rarity),
        )}
      >
        {labelText}
      </span>
      {typeof count === "number" && count > 1 ? (
        <span className="absolute right-1 top-1 rounded bg-background/75 px-1 text-[10px] tabular-nums text-foreground/80">
          ×{String(count)}
        </span>
      ) : null}
    </div>
  );
}
