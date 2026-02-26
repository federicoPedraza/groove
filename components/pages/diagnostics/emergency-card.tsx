import { Loader2, OctagonX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SOFT_RED_BUTTON_CLASSES } from "@/components/pages/diagnostics/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KILL_ANIMATION_FRAME_COUNT = 8;
const KILL_ANIMATION_FRAME_DURATION_MS = 180;
const KILL_ANIMATION_SPRITE_PATH = "/settings/kill-animation.png";
const KILL_ANIMATION_FRAME_WIDTH_PX = 100;
const KILL_ANIMATION_FRAME_HEIGHT_PX = 100;

type EmergencyCardProps = {
  isKillingAllNonWorktreeOpencode: boolean;
  onKillAllNonWorktreeOpencode: () => void;
};

export function EmergencyCard({ isKillingAllNonWorktreeOpencode, onKillAllNonWorktreeOpencode }: EmergencyCardProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isKillButtonHovered, setIsKillButtonHovered] = useState(false);
  const [spriteScale, setSpriteScale] = useState(1);
  const animationPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setFrameIndex((previousFrameIndex) => (previousFrameIndex + 1) % KILL_ANIMATION_FRAME_COUNT);
    }, KILL_ANIMATION_FRAME_DURATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const animationPaneElement = animationPaneRef.current;
    if (!animationPaneElement) {
      return;
    }

    const updateSpriteScale = (widthPx: number, heightPx: number) => {
      const widthBasedScale = Math.floor(widthPx / KILL_ANIMATION_FRAME_WIDTH_PX);
      const heightBasedScale = Math.floor(heightPx / KILL_ANIMATION_FRAME_HEIGHT_PX);
      const nextScale = Math.max(1, Math.min(widthBasedScale, heightBasedScale));
      setSpriteScale((previousScale) => (previousScale === nextScale ? previousScale : nextScale));
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) {
        return;
      }

      updateSpriteScale(entry.contentRect.width, entry.contentRect.height);
    });

    resizeObserver.observe(animationPaneElement);
    updateSpriteScale(animationPaneElement.clientWidth, animationPaneElement.clientHeight);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const spriteWidthPx = KILL_ANIMATION_FRAME_WIDTH_PX * spriteScale;
  const spriteHeightPx = KILL_ANIMATION_FRAME_HEIGHT_PX * spriteScale;

  return (
    <Card>
      <CardContent className="grid grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] items-stretch gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="space-y-1.5">
            <CardTitle>Emergency</CardTitle>
            <CardDescription>
              Kill all OpenCode processes that are not worktree-related. This is intended for stuck global sessions only.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className={SOFT_RED_BUTTON_CLASSES}
            onClick={onKillAllNonWorktreeOpencode}
            onMouseEnter={() => {
              setIsKillButtonHovered(true);
            }}
            onMouseLeave={() => {
              setIsKillButtonHovered(false);
            }}
            disabled={isKillingAllNonWorktreeOpencode}
          >
            {isKillingAllNonWorktreeOpencode ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <OctagonX aria-hidden="true" className="size-4" />}
            <span>Kill non-worktree OpenCode</span>
          </Button>
        </div>
        <div
          ref={animationPaneRef}
          className={cn(
            "pointer-events-none relative h-full min-h-40 w-full overflow-hidden rounded-sm border bg-background transition-colors",
            isKillButtonHovered ? "text-red-600 dark:text-red-400" : "text-foreground dark:text-white",
          )}
          aria-hidden="true"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `${String(spriteWidthPx)}px`,
              height: `${String(spriteHeightPx)}px`,
              backgroundColor: "currentColor",
              WebkitMaskImage: `url("${KILL_ANIMATION_SPRITE_PATH}")`,
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskSize: `${String(KILL_ANIMATION_FRAME_COUNT * KILL_ANIMATION_FRAME_WIDTH_PX * spriteScale)}px ${String(KILL_ANIMATION_FRAME_HEIGHT_PX * spriteScale)}px`,
              WebkitMaskPosition: `${String(-frameIndex * KILL_ANIMATION_FRAME_WIDTH_PX * spriteScale)}px 0px`,
              maskImage: `url("${KILL_ANIMATION_SPRITE_PATH}")`,
              maskRepeat: "no-repeat",
              maskSize: `${String(KILL_ANIMATION_FRAME_COUNT * KILL_ANIMATION_FRAME_WIDTH_PX * spriteScale)}px ${String(KILL_ANIMATION_FRAME_HEIGHT_PX * spriteScale)}px`,
              maskPosition: `${String(-frameIndex * KILL_ANIMATION_FRAME_WIDTH_PX * spriteScale)}px 0px`,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
