import type { TestingEnvironmentColor } from "@/components/pages/dashboard/types";

export const READY_STATUS_CLASSES = "border-green-700/30 bg-green-500/15 text-green-800 dark:border-green-400/70 dark:text-white dark:[&>svg]:text-green-100";
export const CLOSING_STATUS_CLASSES = "border-rose-700/35 bg-rose-500/15 text-rose-900 dark:border-rose-400/70 dark:text-white dark:[&>svg]:text-rose-100";
export const PAUSED_STATUS_CLASSES = "border-yellow-700/35 bg-yellow-500/15 text-yellow-900 dark:border-yellow-400/70 dark:text-white dark:[&>svg]:text-yellow-100";
export const CORRUPTED_STATUS_CLASSES = "border-orange-700/35 bg-orange-500/15 text-orange-900 dark:border-orange-400/70 dark:text-white dark:[&>svg]:text-orange-100";
export const DELETED_STATUS_CLASSES = "border-slate-600/35 bg-slate-500/10 text-slate-700 dark:border-slate-300/60 dark:text-white dark:[&>svg]:text-slate-100";
export const SOFT_GREEN_BUTTON_CLASSES =
  "transition-colors hover:bg-green-500/20 hover:text-green-700 hover:border-green-700/55 active:bg-green-500/25 active:text-green-700 active:border-green-700/60 dark:hover:text-green-200 dark:hover:border-green-300/70 dark:active:text-green-100 dark:active:border-green-200/75";
export const SOFT_RED_BUTTON_CLASSES =
  "transition-colors hover:bg-rose-500/20 hover:text-rose-700 hover:border-rose-700/55 active:bg-rose-500/25 active:text-rose-700 active:border-rose-700/60 dark:hover:text-rose-200 dark:hover:border-rose-300/70 dark:active:text-rose-100 dark:active:border-rose-200/75";
export const ACTIVE_GREEN_BUTTON_CLASSES =
  "bg-green-500/25 text-green-800 border-green-700/55 transition-colors dark:text-green-100 dark:border-green-200/75";
export const ACTIVE_TESTING_BUTTON_CLASSES =
  "bg-cyan-500/20 text-cyan-700 border-cyan-700/55 transition-colors dark:text-cyan-100 dark:border-cyan-200/75";
export const ACTIVE_ORANGE_BUTTON_CLASSES =
  "bg-orange-500/20 text-orange-700 border-orange-700/55 transition-colors dark:text-orange-100 dark:border-orange-200/75";
export const SOFT_YELLOW_BUTTON_CLASSES =
  "transition-colors hover:bg-yellow-500/20 hover:text-yellow-800 hover:border-yellow-700/55 active:bg-yellow-500/25 active:text-yellow-800 active:border-yellow-700/60 dark:hover:text-yellow-200 dark:hover:border-yellow-300/70 dark:active:text-yellow-100 dark:active:border-yellow-200/75";
export const SOFT_ORANGE_BUTTON_CLASSES =
  "transition-colors hover:bg-orange-500/20 hover:text-orange-700 hover:border-orange-700/55 active:bg-orange-500/25 active:text-orange-700 active:border-orange-700/60 dark:hover:text-orange-200 dark:hover:border-orange-300/70 dark:active:text-orange-100 dark:active:border-orange-200/75";

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
