import { useEffect, useRef, useState } from "react";

import { Coins } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

// How long the displayed total takes to roll from the old to the new amount.
const ROLL_DURATION_MS = 700;
// How long the floating "+N" stays before it is removed (the fade itself is
// driven by the `groove-gold-gain` CSS animation).
const GAIN_VISIBLE_MS = 1100;

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

type GoldGain = {
  amount: number;
  // Bumped on every gain so React remounts the floating element, restarting
  // the CSS fade even when consecutive gains land in quick succession.
  id: number;
};

type SidebarGoldCounterProps = {
  gold: number;
  collapsed: boolean;
  // True once the workspace context has loaded. Until then the counter tracks
  // the gold value silently so the initial load does not look like a reward.
  ready: boolean;
};

export function SidebarGoldCounter({
  gold,
  collapsed,
  ready,
}: SidebarGoldCounterProps) {
  const [displayed, setDisplayed] = useState(gold);
  const [gain, setGain] = useState<GoldGain | null>(null);
  const previousGoldRef = useRef(gold);
  const hasBaselineRef = useRef(false);
  const gainIdRef = useRef(0);

  useEffect(() => {
    const from = previousGoldRef.current;
    previousGoldRef.current = gold;

    // Keep the counter in sync without any flourish until the workspace
    // context has settled on its first real total.
    if (!ready || !hasBaselineRef.current) {
      if (ready) {
        hasBaselineRef.current = true;
      }
      setDisplayed(gold);
      return;
    }

    if (gold === from) {
      return;
    }

    // Spending gold (or any decrease) snaps; only gains are celebrated.
    if (gold < from) {
      setDisplayed(gold);
      return;
    }

    const delta = gold - from;
    gainIdRef.current += 1;
    setGain({ amount: delta, id: gainIdRef.current });

    let rafId = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) {
        start = now;
      }
      const progress = Math.min(1, (now - start) / ROLL_DURATION_MS);
      setDisplayed(Math.round(from + delta * easeOutCubic(progress)));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplayed(gold);
      }
    };
    rafId = requestAnimationFrame(step);

    const clearGainTimer = setTimeout(() => {
      setGain((current) =>
        current?.id === gainIdRef.current ? null : current,
      );
    }, GAIN_VISIBLE_MS);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(clearGainTimer);
    };
  }, [gold, ready]);

  const goldLabel = gold.toLocaleString();
  const displayedLabel = displayed.toLocaleString();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex items-center gap-1.5 text-sm font-bold text-yellow-500",
              collapsed ? "px-0" : "px-2",
            )}
            aria-label={`Gold: ${goldLabel}`}
          >
            <Coins aria-hidden="true" className="size-4 shrink-0" />
            {!collapsed && (
              <span className="tabular-nums">{displayedLabel}</span>
            )}
            {gain ? (
              <span
                key={gain.id}
                aria-hidden="true"
                className="groove-gold-gain pointer-events-none absolute -top-3 right-1 text-xs font-semibold tabular-nums text-yellow-400/70"
              >
                +{gain.amount.toLocaleString()}
              </span>
            ) : null}
          </div>
        </TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right">{goldLabel}</TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
