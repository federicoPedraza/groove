import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { getKingdom, type BugDefinition } from "@/src/lib/bestiary/definitions";
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
