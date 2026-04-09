import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYBOARD_LEADER_BINDINGS,
  normalizeKeyboardLeaderBindings,
  normalizeShortcutKey,
  toShortcutDisplayLabel,
  OPEN_ACTION_LAUNCHER_COMMAND_ID,
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
} from "@/src/lib/shortcuts";

describe("shortcut defaults", () => {
  it("maps open actions to leader+k and worktree details to leader+p", () => {
    expect(
      DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID],
    ).toBe("k");
    expect(
      DEFAULT_KEYBOARD_LEADER_BINDINGS[
        OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID
      ],
    ).toBe("p");
  });

  it("migrates legacy action-only default binding without creating duplicate keys", () => {
    const normalized = normalizeKeyboardLeaderBindings({
      [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "p",
    });

    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("k");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("p");
  });
});

describe("normalizeShortcutKey", () => {
  it("returns 'Space' for 'space' string", () => {
    expect(normalizeShortcutKey("space", "fallback")).toBe("Space");
  });

  it("returns 'Space' for '  Space  ' with whitespace", () => {
    expect(normalizeShortcutKey("  Space  ", "fallback")).toBe("Space");
  });

  it("returns lowercase single char for valid alpha", () => {
    expect(normalizeShortcutKey("A", "fallback")).toBe("a");
  });

  it("returns fallback for non-string value", () => {
    expect(normalizeShortcutKey(42, "fallback")).toBe("fallback");
    expect(normalizeShortcutKey(null, "default")).toBe("default");
    expect(normalizeShortcutKey(undefined, "def")).toBe("def");
  });

  it("returns fallback for invalid string", () => {
    expect(normalizeShortcutKey("!!", "fallback")).toBe("fallback");
    expect(normalizeShortcutKey("ab", "fallback")).toBe("fallback");
  });

  it("returns digit for valid numeric string", () => {
    expect(normalizeShortcutKey("5", "fallback")).toBe("5");
  });
});

describe("toShortcutDisplayLabel", () => {
  it("returns 'Space' as-is", () => {
    expect(toShortcutDisplayLabel("Space")).toBe("Space");
  });

  it("uppercases single letter keys", () => {
    expect(toShortcutDisplayLabel("k")).toBe("K");
  });
});

describe("normalizeKeyboardLeaderBindings", () => {
  it("returns defaults for null input", () => {
    const normalized = normalizeKeyboardLeaderBindings(null);
    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("k");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("p");
  });

  it("returns defaults for non-object input", () => {
    const normalized = normalizeKeyboardLeaderBindings("invalid");
    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("k");
  });

  it("ignores unknown command ids", () => {
    const normalized = normalizeKeyboardLeaderBindings({
      unknownCommand: "x",
    });
    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("k");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("p");
  });

  it("overrides known command bindings", () => {
    const normalized = normalizeKeyboardLeaderBindings({
      [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "j",
      [OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]: "m",
    });
    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("j");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("m");
  });

  it("does not migrate when both bindings are explicitly set", () => {
    const normalized = normalizeKeyboardLeaderBindings({
      [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "p",
      [OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]: "o",
    });
    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("p");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("o");
  });

  it("does not migrate when action launcher is set to non-legacy key", () => {
    const normalized = normalizeKeyboardLeaderBindings({
      [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "j",
    });
    // j is not the legacy "p", so no migration
    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("j");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("p");
  });
});
