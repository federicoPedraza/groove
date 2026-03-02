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
export const ACTIVE_AMBER_BUTTON_CLASSES =
  "bg-amber-500/20 text-amber-800 border-amber-700/55 transition-colors dark:text-amber-100 dark:border-amber-200/75";
export const SOFT_YELLOW_BUTTON_CLASSES =
  "transition-colors hover:bg-yellow-500/20 hover:text-yellow-800 hover:border-yellow-700/55 active:bg-yellow-500/25 active:text-yellow-800 active:border-yellow-700/60 dark:hover:text-yellow-200 dark:hover:border-yellow-300/70 dark:active:text-yellow-100 dark:active:border-yellow-200/75";
export const SOFT_AMBER_BUTTON_CLASSES =
  "transition-colors hover:bg-amber-500/20 hover:text-amber-800 hover:border-amber-700/55 active:bg-amber-500/25 active:text-amber-800 active:border-amber-700/60 dark:hover:text-amber-200 dark:hover:border-amber-300/70 dark:active:text-amber-100 dark:active:border-amber-200/75";
export const SOFT_ORANGE_BUTTON_CLASSES =
  "transition-colors hover:bg-orange-500/20 hover:text-orange-700 hover:border-orange-700/55 active:bg-orange-500/25 active:text-orange-700 active:border-orange-700/60 dark:hover:text-orange-200 dark:hover:border-orange-300/70 dark:active:text-orange-100 dark:active:border-orange-200/75";

const RED_TESTING_ENVIRONMENT_COLOR_PALETTE: TestingEnvironmentColor[] = [
  {
    iconClassName: "text-rose-700",
    cardBorderClassName: "border-rose-700/45",
    cardBackgroundClassName: "bg-rose-500/10",
  },
  {
    iconClassName: "text-red-700",
    cardBorderClassName: "border-red-700/45",
    cardBackgroundClassName: "bg-red-500/10",
  },
  {
    iconClassName: "text-pink-700",
    cardBorderClassName: "border-pink-700/45",
    cardBackgroundClassName: "bg-pink-500/10",
  },
  {
    iconClassName: "text-fuchsia-700",
    cardBorderClassName: "border-fuchsia-700/45",
    cardBackgroundClassName: "bg-fuchsia-500/10",
  },
];

const ORANGE_TESTING_ENVIRONMENT_COLOR_PALETTE: TestingEnvironmentColor[] = [
  {
    iconClassName: "text-orange-700",
    cardBorderClassName: "border-orange-700/45",
    cardBackgroundClassName: "bg-orange-500/10",
  },
  {
    iconClassName: "text-amber-700",
    cardBorderClassName: "border-amber-700/50",
    cardBackgroundClassName: "bg-amber-500/10",
  },
];

const YELLOW_TESTING_ENVIRONMENT_COLOR_PALETTE: TestingEnvironmentColor[] = [
  {
    iconClassName: "text-yellow-700",
    cardBorderClassName: "border-yellow-700/45",
    cardBackgroundClassName: "bg-yellow-500/10",
  },
  {
    iconClassName: "text-lime-700",
    cardBorderClassName: "border-lime-700/45",
    cardBackgroundClassName: "bg-lime-500/10",
  },
];

const COOL_TESTING_ENVIRONMENT_COLOR_PALETTE: TestingEnvironmentColor[] = [
  {
    iconClassName: "text-emerald-700",
    cardBorderClassName: "border-emerald-700/45",
    cardBackgroundClassName: "bg-emerald-500/10",
  },
  {
    iconClassName: "text-green-700",
    cardBorderClassName: "border-green-700/45",
    cardBackgroundClassName: "bg-green-500/10",
  },
  {
    iconClassName: "text-teal-700",
    cardBorderClassName: "border-teal-700/45",
    cardBackgroundClassName: "bg-teal-500/10",
  },
  {
    iconClassName: "text-cyan-700",
    cardBorderClassName: "border-cyan-700/45",
    cardBackgroundClassName: "bg-cyan-500/10",
  },
  {
    iconClassName: "text-sky-700",
    cardBorderClassName: "border-sky-700/45",
    cardBackgroundClassName: "bg-sky-500/10",
  },
  {
    iconClassName: "text-blue-700",
    cardBorderClassName: "border-blue-700/45",
    cardBackgroundClassName: "bg-blue-500/10",
  },
  {
    iconClassName: "text-indigo-700",
    cardBorderClassName: "border-indigo-700/45",
    cardBackgroundClassName: "bg-indigo-500/10",
  },
  {
    iconClassName: "text-violet-700",
    cardBorderClassName: "border-violet-700/45",
    cardBackgroundClassName: "bg-violet-500/10",
  },
  {
    iconClassName: "text-slate-700",
    cardBorderClassName: "border-slate-700/45",
    cardBackgroundClassName: "bg-slate-500/10",
  },
  {
    iconClassName: "text-stone-700",
    cardBorderClassName: "border-stone-700/45",
    cardBackgroundClassName: "bg-stone-500/10",
  },
];

const TESTING_ENVIRONMENT_COLOR_PALETTE: TestingEnvironmentColor[] = [
  ...RED_TESTING_ENVIRONMENT_COLOR_PALETTE,
  ...ORANGE_TESTING_ENVIRONMENT_COLOR_PALETTE,
  ...YELLOW_TESTING_ENVIRONMENT_COLOR_PALETTE,
  ...COOL_TESTING_ENVIRONMENT_COLOR_PALETTE,
];

type TestingEnvironmentColorAssignment = {
  paletteIndex: number;
};

const testingEnvironmentColorAssignmentByWorktree = new Map<string, TestingEnvironmentColorAssignment>();
const activeTestingEnvironmentWorktrees = new Set<string>();

function pickRandomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function pickPaletteIndex(length: number, usedIndices: Set<number>): number {
  if (length <= 0) {
    return 0;
  }

  if (usedIndices.size >= length) {
    return pickRandomIndex(length);
  }

  const availableIndices: number[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!usedIndices.has(index)) {
      availableIndices.push(index);
    }
  }

  return availableIndices[pickRandomIndex(availableIndices.length)];
}

function ensureTestingEnvironmentColorAssignment(worktree: string): TestingEnvironmentColorAssignment {
  const existingAssignment = testingEnvironmentColorAssignmentByWorktree.get(worktree);
  if (existingAssignment) {
    activeTestingEnvironmentWorktrees.add(worktree);
    return existingAssignment;
  }

  const usedPaletteIndices = new Set<number>();
  for (const activeWorktree of activeTestingEnvironmentWorktrees) {
    const assignment = testingEnvironmentColorAssignmentByWorktree.get(activeWorktree);
    if (!assignment) {
      continue;
    }

    usedPaletteIndices.add(assignment.paletteIndex);
  }

  const nextAssignment = {
    paletteIndex: pickPaletteIndex(TESTING_ENVIRONMENT_COLOR_PALETTE.length, usedPaletteIndices),
  };

  testingEnvironmentColorAssignmentByWorktree.set(worktree, nextAssignment);
  activeTestingEnvironmentWorktrees.add(worktree);
  return nextAssignment;
}

export function syncActiveTestingEnvironmentColorAssignments(worktrees: readonly string[]): void {
  const nextActiveWorktrees = new Set(worktrees);

  activeTestingEnvironmentWorktrees.clear();
  for (const worktree of nextActiveWorktrees) {
    activeTestingEnvironmentWorktrees.add(worktree);
  }

  for (const worktree of testingEnvironmentColorAssignmentByWorktree.keys()) {
    if (!nextActiveWorktrees.has(worktree)) {
      testingEnvironmentColorAssignmentByWorktree.delete(worktree);
    }
  }

  for (const worktree of nextActiveWorktrees) {
    ensureTestingEnvironmentColorAssignment(worktree);
  }
}

export function getTestingEnvironmentColor(worktree: string): TestingEnvironmentColor {
  const assignment = ensureTestingEnvironmentColorAssignment(worktree);
  return TESTING_ENVIRONMENT_COLOR_PALETTE[assignment.paletteIndex];
}
