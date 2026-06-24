import { useEffect, useState } from "react";

import { cn } from "@/src/lib/utils";
import type { MascotSpriteDefinition } from "@/src/lib/utils/mascots";

const BASE_FRAME_DURATION_MS = 90;
// Global render tweaks for item sprites: halve display size and play
// animations at 50% speed (double the per-frame duration).
const ITEM_SPRITE_GLOBAL_SCALE = 0.5;
const ITEM_SPRITE_SPEED_MULTIPLIER = 0.5;
const DEFAULT_FRAME_DURATION_MS =
  BASE_FRAME_DURATION_MS / ITEM_SPRITE_SPEED_MULTIPLIER;

type ItemSpriteProps = {
  sprite: MascotSpriteDefinition;
  className?: string;
  scale?: number;
  /** Force pause regardless of hover (used for static previews). */
  paused?: boolean;
  /** When defined, overrides the sprite's internal hover detection. */
  animate?: boolean;
};

export function ItemSprite({
  sprite,
  className,
  scale = 1,
  paused = false,
  animate,
}: ItemSpriteProps) {
  const effectiveScale = scale * ITEM_SPRITE_GLOBAL_SCALE;
  const frameCount = Math.max(sprite.frameCount, 1);
  const renderedHeightPx = sprite.renderedHeightPx ?? sprite.frameHeightPx;
  const widthPx = sprite.frameWidthPx * effectiveScale;
  const heightPx = renderedHeightPx * effectiveScale;
  const [frameIndex, setFrameIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const animateRequested = animate ?? isHovered;
  const shouldAnimate = !paused && animateRequested && frameCount > 1;

  useEffect(() => {
    if (!shouldAnimate) {
      setFrameIndex(0);
      return;
    }
    const intervalId = window.setInterval(() => {
      setFrameIndex((previous) => (previous + 1) % frameCount);
    }, DEFAULT_FRAME_DURATION_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldAnimate, frameCount]);

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      className={cn("inline-block bg-no-repeat", className)}
      style={{
        width: `${String(widthPx)}px`,
        height: `${String(heightPx)}px`,
        backgroundImage: `url("${sprite.src}")`,
        backgroundSize: `${String(sprite.frameCount * sprite.frameWidthPx * effectiveScale)}px ${String(sprite.frameHeightPx * effectiveScale)}px`,
        backgroundPosition: `${String(-frameIndex * sprite.frameWidthPx * effectiveScale)}px ${String(sprite.frameYOffsetPx * effectiveScale)}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
