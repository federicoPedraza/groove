import {
  Archive,
  Ban,
  BrickWallShield,
  CircleCheck,
  CircleDashed,
  Clock,
  Crosshair,
  Droplet,
  Hammer,
  Shield,
  ShieldCheck,
  ShieldOff,
  Stethoscope,
  Swords,
} from "lucide-react";

import {
  BLOCKED_STATE_CLASSES,
  DEFEATED_STATE_CLASSES,
  FIGHTING_STATE_CLASSES,
  FORGOTTEN_STATE_CLASSES,
  HUNTING_STATE_CLASSES,
  PENDING_STATE_CLASSES,
  WOUNDED_STATE_CLASSES,
} from "@/src/components/pages/barracks/constants";
import type { WorktreeState } from "@/src/components/pages/barracks/types";
import type { GrooveBusinessMode } from "@/src/lib/groove-business";

export function getWorktreeStateBadgeClasses(state: WorktreeState): string {
  if (state === "hunting") {
    return HUNTING_STATE_CLASSES;
  }
  if (state === "fighting") {
    return FIGHTING_STATE_CLASSES;
  }
  if (state === "wounded") {
    return WOUNDED_STATE_CLASSES;
  }
  if (state === "defeated") {
    return DEFEATED_STATE_CLASSES;
  }
  if (state === "blocked") {
    return BLOCKED_STATE_CLASSES;
  }
  if (state === "forgotten") {
    return FORGOTTEN_STATE_CLASSES;
  }
  return PENDING_STATE_CLASSES;
}

export function getWorktreeStateTitle(state: WorktreeState): string {
  if (state === "hunting") {
    return "Worktree is on the hunt (on diagnosis).";
  }
  if (state === "fighting") {
    return "Worktree is in active battle.";
  }
  if (state === "wounded") {
    return "Worktree took a hit.";
  }
  if (state === "defeated") {
    return "Worktree is defeated (done).";
  }
  if (state === "blocked") {
    return "Worktree is blocked.";
  }
  if (state === "forgotten") {
    return "Worktree is forgotten (archived).";
  }
  return "Worktree is pending.";
}

export function getWorktreeStateIcon(
  state: WorktreeState,
  mode: GrooveBusinessMode = "groove",
) {
  if (mode === "business") {
    if (state === "hunting") {
      return <Stethoscope aria-hidden="true" fill="currentColor" />;
    }
    if (state === "fighting") {
      return <Hammer aria-hidden="true" fill="currentColor" />;
    }
    if (state === "wounded") {
      return <Clock aria-hidden="true" fill="currentColor" />;
    }
    if (state === "defeated") {
      return <CircleCheck aria-hidden="true" fill="currentColor" />;
    }
    if (state === "blocked") {
      return <Ban aria-hidden="true" fill="currentColor" />;
    }
    if (state === "forgotten") {
      return <Archive aria-hidden="true" fill="currentColor" />;
    }
    return <CircleDashed aria-hidden="true" fill="currentColor" />;
  }

  if (state === "hunting") {
    return <Crosshair aria-hidden="true" fill="currentColor" />;
  }
  if (state === "fighting") {
    return <Swords aria-hidden="true" fill="currentColor" />;
  }
  if (state === "wounded") {
    return <Droplet aria-hidden="true" fill="currentColor" />;
  }
  if (state === "defeated") {
    return <ShieldCheck aria-hidden="true" fill="currentColor" />;
  }
  if (state === "blocked") {
    return <BrickWallShield aria-hidden="true" fill="currentColor" />;
  }
  if (state === "forgotten") {
    return <ShieldOff aria-hidden="true" fill="currentColor" />;
  }
  return <Shield aria-hidden="true" fill="currentColor" />;
}

export function getWorktreeStateIconColorClass(state: WorktreeState): string {
  if (state === "hunting") return "text-sky-500";
  if (state === "fighting") return "text-orange-500";
  if (state === "wounded") return "text-rose-500";
  if (state === "defeated") return "text-emerald-500";
  if (state === "blocked") return "text-amber-500";
  if (state === "forgotten") return "text-zinc-500";
  return "text-slate-500";
}
