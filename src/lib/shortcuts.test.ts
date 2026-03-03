import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYBOARD_LEADER_BINDINGS,
  normalizeKeyboardLeaderBindings,
  OPEN_ACTION_LAUNCHER_COMMAND_ID,
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
} from "@/src/lib/shortcuts";

describe("shortcut defaults", () => {
  it("maps open actions to leader+k and worktree details to leader+p", () => {
    expect(DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("k");
    expect(DEFAULT_KEYBOARD_LEADER_BINDINGS[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("p");
  });

  it("migrates legacy action-only default binding without creating duplicate keys", () => {
    const normalized = normalizeKeyboardLeaderBindings({
      [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "p",
    });

    expect(normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID]).toBe("k");
    expect(normalized[OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]).toBe("p");
  });
});
