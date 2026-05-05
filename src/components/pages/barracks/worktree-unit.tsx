import {
  Bug,
  HandHelping,
  Pickaxe,
  Skull,
  Tally1,
  Tally2,
  Tally3,
  Tally4,
} from "lucide-react";

import type { WorktreeUnit } from "@/src/lib/ipc";

export const BUG_BADGE_CLASSES =
  "border-red-700 bg-red-900 text-red-50 [&>svg]:text-red-50 dark:border-red-700 dark:bg-red-900 dark:text-red-50 dark:[&>svg]:text-red-50";

const GOLDMINE_BADGE_CLASSES =
  "border-yellow-500 bg-yellow-400 text-yellow-950 [&>svg]:text-yellow-950 dark:border-yellow-500 dark:bg-yellow-400 dark:text-yellow-950 dark:[&>svg]:text-yellow-950";

// Gems: rare, purple-ish theme to read as "premium loot".
const GEMS_BADGE_CLASSES =
  "border-purple-500 bg-purple-700 text-purple-50 [&>svg]:text-purple-50 dark:border-purple-500 dark:bg-purple-700 dark:text-purple-50 dark:[&>svg]:text-purple-50";

// "Spent" / rewarded variant: bg + border one shade darker AND faded to /40
// alpha so the badge reads as a ghost of its former self. Text + icon stay at
// full opacity for legibility.
const BUG_BADGE_REWARDED_CLASSES =
  "border-red-900/40 bg-red-950/40 text-red-50 [&>svg]:text-red-50 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-50 dark:[&>svg]:text-red-50";

// Goldmine rewarded: bg flips from bright yellow-400 to faded yellow-700/40,
// so dark yellow-950 text would disappear into it. Switch to a light yellow
// so the text + icon stay fully legible at full opacity.
const GOLDMINE_BADGE_REWARDED_CLASSES =
  "border-yellow-700/40 bg-yellow-700/40 text-yellow-50 [&>svg]:text-yellow-50 dark:border-yellow-700/40 dark:bg-yellow-700/40 dark:text-yellow-50 dark:[&>svg]:text-yellow-50";

const GEMS_BADGE_REWARDED_CLASSES =
  "border-purple-800/40 bg-purple-900/40 text-purple-50 [&>svg]:text-purple-50 dark:border-purple-800/40 dark:bg-purple-900/40 dark:text-purple-50 dark:[&>svg]:text-purple-50";

export function getWorktreeUnitBadgeClasses(unit: WorktreeUnit): string {
  if (unit.rewarded === true) {
    if (unit.kind === "gems") return GEMS_BADGE_REWARDED_CLASSES;
    if (unit.kind === "goldmine") return GOLDMINE_BADGE_REWARDED_CLASSES;
    return BUG_BADGE_REWARDED_CLASSES;
  }
  if (unit.kind === "gems") return GEMS_BADGE_CLASSES;
  if (unit.kind === "goldmine") return GOLDMINE_BADGE_CLASSES;
  return BUG_BADGE_CLASSES;
}

export function getWorktreeUnitKindIcon(unit: WorktreeUnit) {
  if (unit.kind === "gems") {
    return <HandHelping aria-hidden="true" />;
  }
  if (unit.kind === "goldmine") {
    return <Pickaxe aria-hidden="true" />;
  }
  return <Bug aria-hidden="true" />;
}

export function getWorktreeUnitLevelIcon(unit: WorktreeUnit) {
  switch (unit.level) {
    case 1:
      return <Tally1 aria-hidden="true" />;
    case 2:
      return <Tally2 aria-hidden="true" />;
    case 3:
      return <Tally3 aria-hidden="true" />;
    case 4:
      return <Tally4 aria-hidden="true" />;
    case 5:
    default:
      return <Skull aria-hidden="true" />;
  }
}

export function getWorktreeUnitTitle(unit: WorktreeUnit): string {
  const label =
    unit.kind === "gems"
      ? "Gems"
      : unit.kind === "goldmine"
        ? "Goldmine"
        : "Bug";
  return `${label} · level ${String(unit.level)}`;
}
