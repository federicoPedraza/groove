export type MascotSpriteMode = "idle" | "running" | "falling";
export type MascotIdleAnimationMode = "ping-pong" | "forward-loop";

type ThemeVariantClassNames = {
  light: string;
  dark: string;
};

export type MascotColorDefinition = {
  id: string;
  borderClassName: ThemeVariantClassNames;
  textClassName: ThemeVariantClassNames;
};

export type MascotSpriteDefinition = {
  src: string;
  frameCount: number;
  frameWidthPx: number;
  frameHeightPx: number;
  frameYOffsetPx: number;
  renderedHeightPx?: number;
  renderScale?: number;
  animationSpeedMultiplier?: number;
};

export type MascotDefinition = {
  id: string;
  name: string;
  idleAnimationMode?: MascotIdleAnimationMode;
  sprites: {
    idle: MascotSpriteDefinition;
    running?: MascotSpriteDefinition;
    falling?: MascotSpriteDefinition;
  };
};

export const DEFAULT_MASCOT_ID = "donkey-kong";

export const MASCOT_DEFINITIONS: readonly MascotDefinition[] = [
  {
    id: DEFAULT_MASCOT_ID,
    name: "Donkey Kong",
    sprites: {
      idle: {
        src: "/idle.png",
        frameCount: 11,
        frameWidthPx: 144,
        frameHeightPx: 96,
        frameYOffsetPx: 0,
        renderedHeightPx: 96,
      },
      running: {
        src: "/running.png",
        frameCount: 20,
        frameWidthPx: 144,
        frameHeightPx: 96,
        frameYOffsetPx: 0,
        renderedHeightPx: 96,
      },
      falling: {
        src: "/falling.png",
        frameCount: 18,
        frameWidthPx: 144,
        frameHeightPx: 60,
        frameYOffsetPx: 18,
        renderedHeightPx: 96,
      },
    },
  },
  {
    id: "enguarde",
    name: "En Garde",
    sprites: {
      idle: {
        src: "/enguarde/idle.png",
        frameCount: 16,
        frameWidthPx: 144,
        frameHeightPx: 96,
        frameYOffsetPx: 0,
        renderedHeightPx: 96,
      },
    },
  },
  {
    id: "wilhem",
    name: "Wilhem",
    idleAnimationMode: "forward-loop",
    sprites: {
      idle: {
        src: "/wilhem/idle.png",
        frameCount: 16,
        frameWidthPx: 72,
        frameHeightPx: 62,
        frameYOffsetPx: 0,
        renderedHeightPx: 62,
        renderScale: 1.8,
        animationSpeedMultiplier: 1.2,
      },
    },
  },
];

export const WORKTREE_MASCOT_COLOR_PALETTE: readonly MascotColorDefinition[] = [
  {
    id: "emerald",
    borderClassName: {
      light: "border-emerald-700/45",
      dark: "dark:border-emerald-300/55",
    },
    textClassName: {
      light: "text-emerald-700",
      dark: "dark:text-emerald-300",
    },
  },
  {
    id: "sky",
    borderClassName: {
      light: "border-sky-700/45",
      dark: "dark:border-sky-300/55",
    },
    textClassName: {
      light: "text-sky-700",
      dark: "dark:text-sky-300",
    },
  },
  {
    id: "amber",
    borderClassName: {
      light: "border-amber-700/45",
      dark: "dark:border-amber-300/55",
    },
    textClassName: {
      light: "text-amber-700",
      dark: "dark:text-amber-300",
    },
  },
  {
    id: "cyan",
    borderClassName: {
      light: "border-cyan-700/45",
      dark: "dark:border-cyan-300/55",
    },
    textClassName: {
      light: "text-cyan-700",
      dark: "dark:text-cyan-300",
    },
  },
  {
    id: "indigo",
    borderClassName: {
      light: "border-indigo-700/45",
      dark: "dark:border-indigo-300/55",
    },
    textClassName: {
      light: "text-indigo-700",
      dark: "dark:text-indigo-300",
    },
  },
  {
    id: "orange",
    borderClassName: {
      light: "border-orange-700/45",
      dark: "dark:border-orange-300/55",
    },
    textClassName: {
      light: "text-orange-700",
      dark: "dark:text-orange-300",
    },
  },
];

type WorktreeMascotAssignmentIndex = {
  mascotIndex: number;
  colorIndex: number;
};

const worktreeMascotAssignmentByKey = new Map<string, WorktreeMascotAssignmentIndex>();
const activeWorktreeMascotKeys = new Set<string>();

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

function ensureWorktreeMascotAssignment(instanceKey: string): WorktreeMascotAssignmentIndex {
  const existingAssignment = worktreeMascotAssignmentByKey.get(instanceKey);
  if (existingAssignment) {
    activeWorktreeMascotKeys.add(instanceKey);
    return existingAssignment;
  }

  const usedMascotIndices = new Set<number>();
  const usedColorIndices = new Set<number>();

  for (const activeKey of activeWorktreeMascotKeys) {
    const assignment = worktreeMascotAssignmentByKey.get(activeKey);
    if (!assignment) {
      continue;
    }

    usedMascotIndices.add(assignment.mascotIndex);
    usedColorIndices.add(assignment.colorIndex);
  }

  const nextAssignment: WorktreeMascotAssignmentIndex = {
    mascotIndex: pickPaletteIndex(MASCOT_DEFINITIONS.length, usedMascotIndices),
    colorIndex: pickPaletteIndex(WORKTREE_MASCOT_COLOR_PALETTE.length, usedColorIndices),
  };

  worktreeMascotAssignmentByKey.set(instanceKey, nextAssignment);
  activeWorktreeMascotKeys.add(instanceKey);
  return nextAssignment;
}

function findDefaultMascot(): MascotDefinition {
  return MASCOT_DEFINITIONS.find((mascot) => mascot.id === DEFAULT_MASCOT_ID) ?? MASCOT_DEFINITIONS[0];
}

export function getMascotColorClassNames(color: MascotColorDefinition): string {
  return [
    color.textClassName.light,
    color.textClassName.dark,
  ].join(" ");
}

export function getMascotSpriteForMode(mascot: MascotDefinition, mode: MascotSpriteMode): MascotSpriteDefinition {
  if (mode === "running") {
    return mascot.sprites.running ?? mascot.sprites.idle;
  }

  if (mode === "falling") {
    return mascot.sprites.falling ?? mascot.sprites.idle;
  }

  return mascot.sprites.idle;
}

export function syncActiveWorktreeMascotAssignments(instanceKeys: readonly string[]): void {
  const nextActiveKeys = new Set(instanceKeys);

  activeWorktreeMascotKeys.clear();
  for (const instanceKey of nextActiveKeys) {
    activeWorktreeMascotKeys.add(instanceKey);
  }

  for (const instanceKey of worktreeMascotAssignmentByKey.keys()) {
    if (!nextActiveKeys.has(instanceKey)) {
      worktreeMascotAssignmentByKey.delete(instanceKey);
    }
  }

  for (const instanceKey of nextActiveKeys) {
    ensureWorktreeMascotAssignment(instanceKey);
  }
}

export function getWorktreeMascotAssignment(instanceKey: string): { mascot: MascotDefinition; color: MascotColorDefinition } {
  const assignment = ensureWorktreeMascotAssignment(instanceKey);
  return {
    mascot: MASCOT_DEFINITIONS[assignment.mascotIndex],
    color: WORKTREE_MASCOT_COLOR_PALETTE[assignment.colorIndex],
  };
}

export function getDefaultMascotAssignment(): { mascot: MascotDefinition; color: MascotColorDefinition } {
  return {
    mascot: findDefaultMascot(),
    color: WORKTREE_MASCOT_COLOR_PALETTE[0],
  };
}
