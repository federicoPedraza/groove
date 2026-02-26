export type MascotSpriteMode = "idle" | "running" | "falling";

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
  frameHeightPx: number;
  frameYOffsetPx: number;
};

export type MascotDefinition = {
  id: string;
  name: string;
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
        frameHeightPx: 96,
        frameYOffsetPx: 0,
      },
      running: {
        src: "/running.png",
        frameCount: 20,
        frameHeightPx: 96,
        frameYOffsetPx: 0,
      },
      falling: {
        src: "/falling.png",
        frameCount: 18,
        frameHeightPx: 60,
        frameYOffsetPx: 18,
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
        frameHeightPx: 96,
        frameYOffsetPx: 0,
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

function hashKey(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
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

export function getWorktreeMascotAssignment(instanceKey: string): { mascot: MascotDefinition; color: MascotColorDefinition } {
  const mascotIndex = hashKey(`${instanceKey}:mascot`) % MASCOT_DEFINITIONS.length;
  const colorIndex = hashKey(`${instanceKey}:color`) % WORKTREE_MASCOT_COLOR_PALETTE.length;
  return {
    mascot: MASCOT_DEFINITIONS[mascotIndex],
    color: WORKTREE_MASCOT_COLOR_PALETTE[colorIndex],
  };
}

export function getDefaultMascotAssignment(): { mascot: MascotDefinition; color: MascotColorDefinition } {
  return {
    mascot: findDefaultMascot(),
    color: WORKTREE_MASCOT_COLOR_PALETTE[0],
  };
}
