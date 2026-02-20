import type { TestingEnvironmentColor } from "@/components/pages/dashboard/types";

export const READY_STATUS_CLASSES = "border-green-700/30 bg-green-500/15 text-green-800";
export const CLOSING_STATUS_CLASSES = "border-rose-700/35 bg-rose-500/15 text-rose-900";
export const PAUSED_STATUS_CLASSES = "border-yellow-700/35 bg-yellow-500/15 text-yellow-900";
export const CORRUPTED_STATUS_CLASSES = "border-orange-700/35 bg-orange-500/15 text-orange-900";
export const SOFT_GREEN_BUTTON_CLASSES = "transition-colors hover:bg-green-500/20 hover:text-green-700 active:bg-green-500/25 active:text-green-700";
export const SOFT_RED_BUTTON_CLASSES = "transition-colors hover:bg-rose-500/20 hover:text-rose-700 active:bg-rose-500/25 active:text-rose-700";
export const ACTIVE_GREEN_BUTTON_CLASSES = "bg-green-500/25 text-green-800 transition-colors";
export const ACTIVE_TESTING_BUTTON_CLASSES = "bg-cyan-500/20 text-cyan-700 transition-colors";
export const SOFT_YELLOW_BUTTON_CLASSES = "transition-colors hover:bg-yellow-500/20 hover:text-yellow-800 active:bg-yellow-500/25 active:text-yellow-800";

const TESTING_ENVIRONMENT_COLOR_PALETTE: TestingEnvironmentColor[] = [
  {
    iconClassName: "text-emerald-700",
    cardBorderClassName: "border-emerald-700/45",
    cardBackgroundClassName: "bg-emerald-500/10",
  },
  {
    iconClassName: "text-blue-700",
    cardBorderClassName: "border-blue-700/45",
    cardBackgroundClassName: "bg-blue-500/10",
  },
  {
    iconClassName: "text-amber-700",
    cardBorderClassName: "border-amber-700/50",
    cardBackgroundClassName: "bg-amber-500/10",
  },
  {
    iconClassName: "text-indigo-700",
    cardBorderClassName: "border-indigo-700/45",
    cardBackgroundClassName: "bg-indigo-500/10",
  },
  {
    iconClassName: "text-cyan-700",
    cardBorderClassName: "border-cyan-700/45",
    cardBackgroundClassName: "bg-cyan-500/10",
  },
  {
    iconClassName: "text-orange-700",
    cardBorderClassName: "border-orange-700/45",
    cardBackgroundClassName: "bg-orange-500/10",
  },
  {
    iconClassName: "text-lime-700",
    cardBorderClassName: "border-lime-700/45",
    cardBackgroundClassName: "bg-lime-500/10",
  },
  {
    iconClassName: "text-sky-700",
    cardBorderClassName: "border-sky-700/45",
    cardBackgroundClassName: "bg-sky-500/10",
  },
];

const NON_RED_TESTING_ENVIRONMENT_FALLBACK_COLOR: TestingEnvironmentColor = {
  iconClassName: "text-indigo-700",
  cardBorderClassName: "border-indigo-700/45",
  cardBackgroundClassName: "bg-indigo-500/10",
};

function hasDisallowedTestingEnvironmentColor(color: TestingEnvironmentColor): boolean {
  const combinedClassNames = `${color.iconClassName} ${color.cardBorderClassName} ${color.cardBackgroundClassName}`;
  return /(rose|red)-/u.test(combinedClassNames);
}

function hashLabel(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}

export function getTestingEnvironmentColor(worktree: string): TestingEnvironmentColor {
  const paletteIndex = hashLabel(worktree) % TESTING_ENVIRONMENT_COLOR_PALETTE.length;
  const assignedColor = TESTING_ENVIRONMENT_COLOR_PALETTE[paletteIndex];
  return hasDisallowedTestingEnvironmentColor(assignedColor) ? NON_RED_TESTING_ENVIRONMENT_FALLBACK_COLOR : assignedColor;
}
