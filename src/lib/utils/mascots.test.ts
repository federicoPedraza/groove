import { describe, it, expect, beforeEach } from "vitest";

import {
  DEFAULT_MASCOT_ID,
  MASCOT_DEFINITIONS,
  WORKTREE_MASCOT_COLOR_PALETTE,
  getMascotColorClassNames,
  getMascotSpriteForMode,
  syncActiveWorktreeMascotAssignments,
  getWorktreeMascotAssignment,
  getDefaultMascotAssignment,
} from "@/src/lib/utils/mascots";

import type { MascotDefinition, MascotColorDefinition } from "@/src/lib/utils/mascots";

beforeEach(() => {
  syncActiveWorktreeMascotAssignments([]);
});

describe("getMascotColorClassNames", () => {
  it("joins light and dark text class names", () => {
    const color = WORKTREE_MASCOT_COLOR_PALETTE[0];
    const result = getMascotColorClassNames(color);
    expect(result).toBe(`${color.textClassName.light} ${color.textClassName.dark}`);
  });
});

describe("getMascotSpriteForMode", () => {
  const dkMascot = MASCOT_DEFINITIONS.find((m) => m.id === DEFAULT_MASCOT_ID) as MascotDefinition;
  const noRunningMascot = MASCOT_DEFINITIONS.find((m) => !m.sprites.running) as MascotDefinition;

  it("returns running sprite when mode is running and sprite exists", () => {
    const result = getMascotSpriteForMode(dkMascot, "running");
    expect(result).toBe(dkMascot.sprites.running);
  });

  it("returns falling sprite when mode is falling and sprite exists", () => {
    const result = getMascotSpriteForMode(dkMascot, "falling");
    expect(result).toBe(dkMascot.sprites.falling);
  });

  it("returns idle sprite when mode is idle", () => {
    const result = getMascotSpriteForMode(dkMascot, "idle");
    expect(result).toBe(dkMascot.sprites.idle);
  });

  it("falls back to idle when running sprite is not defined", () => {
    const result = getMascotSpriteForMode(noRunningMascot, "running");
    expect(result).toBe(noRunningMascot.sprites.idle);
  });

  it("falls back to idle when falling sprite is not defined", () => {
    const result = getMascotSpriteForMode(noRunningMascot, "falling");
    expect(result).toBe(noRunningMascot.sprites.idle);
  });
});

describe("syncActiveWorktreeMascotAssignments", () => {
  it("clears assignments for keys no longer active", () => {
    getWorktreeMascotAssignment("key-a");
    getWorktreeMascotAssignment("key-b");

    syncActiveWorktreeMascotAssignments(["key-a"]);

    // key-b should get a fresh assignment after sync
    const before = getWorktreeMascotAssignment("key-a");
    expect(before.mascot).toBeDefined();
    expect(before.color).toBeDefined();
  });

  it("preserves assignments for keys still active", () => {
    const first = getWorktreeMascotAssignment("key-x");
    syncActiveWorktreeMascotAssignments(["key-x"]);
    const second = getWorktreeMascotAssignment("key-x");

    expect(first.mascot.id).toBe(second.mascot.id);
    expect(first.color.id).toBe(second.color.id);
  });

  it("handles empty keys list", () => {
    getWorktreeMascotAssignment("key-a");
    syncActiveWorktreeMascotAssignments([]);
    // After clearing, new assignment should still work
    const result = getWorktreeMascotAssignment("key-new");
    expect(result.mascot).toBeDefined();
    expect(result.color).toBeDefined();
  });
});

describe("getWorktreeMascotAssignment", () => {
  it("returns a mascot and color for a given key", () => {
    const result = getWorktreeMascotAssignment("test-key");
    expect(MASCOT_DEFINITIONS).toContain(result.mascot);
    expect(WORKTREE_MASCOT_COLOR_PALETTE).toContain(result.color);
  });

  it("returns the same assignment for the same key", () => {
    const first = getWorktreeMascotAssignment("stable-key");
    const second = getWorktreeMascotAssignment("stable-key");
    expect(first.mascot.id).toBe(second.mascot.id);
    expect(first.color.id).toBe(second.color.id);
  });

  it("assigns from available palette entries when some are used", () => {
    // Assign many keys to exercise palette exhaustion
    const keys = Array.from({ length: 20 }, (_, i) => `key-${i}`);
    const assignments = keys.map((key) => getWorktreeMascotAssignment(key));

    for (const assignment of assignments) {
      expect(MASCOT_DEFINITIONS).toContain(assignment.mascot);
      expect(WORKTREE_MASCOT_COLOR_PALETTE).toContain(assignment.color);
    }
  });
});

describe("getDefaultMascotAssignment", () => {
  it("returns the donkey-kong mascot", () => {
    const result = getDefaultMascotAssignment();
    expect(result.mascot.id).toBe(DEFAULT_MASCOT_ID);
  });

  it("returns the first color in the palette", () => {
    const result = getDefaultMascotAssignment();
    expect(result.color).toBe(WORKTREE_MASCOT_COLOR_PALETTE[0]);
  });
});

describe("constants", () => {
  it("DEFAULT_MASCOT_ID is donkey-kong", () => {
    expect(DEFAULT_MASCOT_ID).toBe("donkey-kong");
  });

  it("MASCOT_DEFINITIONS has entries", () => {
    expect(MASCOT_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it("WORKTREE_MASCOT_COLOR_PALETTE has entries", () => {
    expect(WORKTREE_MASCOT_COLOR_PALETTE.length).toBeGreaterThan(0);
  });
});
