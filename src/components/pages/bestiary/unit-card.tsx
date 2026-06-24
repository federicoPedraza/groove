import { useEffect, useState, useSyncExternalStore } from "react";

import { ItemSprite } from "@/src/components/pages/items/item-sprite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { getKingdom, type BugDefinition } from "@/src/lib/bestiary/definitions";
import {
  getIconicForBug,
  getKingdomItems,
  getRarityBadgeClassName,
  type ItemDefinition,
  type ItemRarity,
} from "@/src/lib/items/definitions";
import {
  getWorkspaceContextStoreSnapshot,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";
import { cn } from "@/src/lib/utils";

type UnitCardProps = {
  open: boolean;
  definition: BugDefinition | null;
  onClose: () => void;
};

export function UnitCard({ open, definition, onClose }: UnitCardProps) {
  const isOpen = open && definition !== null;
  const kingdom = definition ? getKingdom(definition.kingdom) : null;
  const [isFlipped, setIsFlipped] = useState(false);

  const workspaceSnapshot = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );
  const inventory =
    workspaceSnapshot.context?.workspaceMeta?.inventory ?? null;
  const kingdomItems = definition ? getKingdomItems(definition.kingdom) : [];
  const iconic = definition ? getIconicForBug(definition.name) ?? null : null;
  const iconicOwned =
    iconic !== null && (inventory?.[iconic.id] ?? 0) > 0;

  useEffect(() => {
    if (!isOpen) {
      setIsFlipped(false);
    }
  }, [isOpen, definition?.name]);

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
        {definition && kingdom ? (
          <div className="[perspective:1200px]">
            <button
              type="button"
              onClick={() => {
                setIsFlipped((flipped) => !flipped);
              }}
              aria-label={
                isFlipped
                  ? `Show front of ${definition.name} card`
                  : `Show back of ${definition.name} card`
              }
              className={cn(
                "relative block aspect-[3/4] w-full rounded-lg transition-transform duration-500 [transform-style:preserve-3d]",
                isFlipped
                  ? "[transform:rotateY(180deg)]"
                  : "[transform:rotateY(0deg)]",
              )}
            >
              <CardFace
                className={cn(
                  "border-2 p-2 [backface-visibility:hidden]",
                  kingdom.cardClassName,
                )}
                ariaHidden={isFlipped}
              >
                <div
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border-4 p-4 text-center",
                    kingdom.cardInnerBorderClassName,
                  )}
                >
                  <DialogTitle asChild>
                    <h2 className="text-3xl font-bold leading-tight tracking-wide">
                      {definition.name}
                    </h2>
                  </DialogTitle>
                  <DialogDescription asChild>
                    <p
                      className={cn(
                        "text-sm uppercase tracking-[0.2em]",
                        kingdom.cardSubtitleClassName,
                      )}
                    >
                      {kingdom.label}
                    </p>
                  </DialogDescription>
                </div>
              </CardFace>
                <CardFace
                  className={cn(
                    "border-2 p-2 [backface-visibility:hidden] [transform:rotateY(180deg)]",
                    kingdom.cardClassName,
                  )}
                  ariaHidden={!isFlipped}
                >
                  <div
                    className={cn(
                      "flex h-full w-full flex-col gap-3 overflow-y-auto rounded-md border-4 p-4 text-left",
                      kingdom.cardInnerBorderClassName,
                    )}
                  >
                    <section className="space-y-1">
                      <h3
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-[0.18em]",
                          kingdom.cardSubtitleClassName,
                        )}
                      >
                        History
                      </h3>
                      <p className="text-sm leading-relaxed">
                        {definition.history}
                      </p>
                    </section>
                    <section className="space-y-1">
                      <h3
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-[0.18em]",
                          kingdom.cardSubtitleClassName,
                        )}
                      >
                        Physical capabilities
                      </h3>
                      <p className="text-sm leading-relaxed">
                        {definition.description}
                      </p>
                    </section>
                    <DropsSection
                      kingdomLabel={kingdom.label}
                      subtitleClassName={kingdom.cardSubtitleClassName}
                      kingdomItems={kingdomItems}
                      iconic={iconic}
                      iconicOwned={iconicOwned}
                      bugName={definition.name}
                    />
                  </div>
                </CardFace>
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type CardFaceProps = {
  className: string;
  ariaHidden: boolean;
  children: React.ReactNode;
};

function CardFace({ className, ariaHidden, children }: CardFaceProps) {
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn(
        "absolute inset-0 rounded-lg shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

type DropsSectionProps = {
  kingdomLabel: string;
  subtitleClassName: string;
  kingdomItems: readonly ItemDefinition[];
  iconic: ItemDefinition | null;
  iconicOwned: boolean;
  bugName: string;
};

function DropsSection({
  kingdomLabel,
  subtitleClassName,
  kingdomItems,
  iconic,
  iconicOwned,
  bugName,
}: DropsSectionProps) {
  return (
    <section className="space-y-2">
      <h3
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.18em]",
          subtitleClassName,
        )}
      >
        Possible drops
      </h3>
      <ul className="space-y-1 text-xs leading-tight">
        {kingdomItems.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <RarityChip rarity={item.rarity} />
            <span className="truncate">{item.name}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 rounded-md border-2 border-amber-500/55 bg-amber-500/10 p-1.5">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden">
          {iconic && iconicOwned ? (
            <ItemSprite sprite={iconic.sprite} scale={0.6} />
          ) : (
            <div
              className="h-7 w-7 rounded-sm bg-foreground/15"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <RarityChip rarity={iconic?.rarity ?? "legendary"} />
            <span className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              Iconic
            </span>
          </div>
          <p className="truncate text-xs">
            {iconic && iconicOwned
              ? iconic.name
              : `??? — iconic of ${bugName}`}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Drops shared across {kingdomLabel}.
      </p>
    </section>
  );
}

function RarityChip({ rarity }: { rarity: ItemRarity }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border px-1 text-[9px] uppercase tracking-[0.12em]",
        getRarityBadgeClassName(rarity),
      )}
    >
      {rarity}
    </span>
  );
}
