import { describe, expect, it } from "vitest";

import type { WorkspaceRow } from "@/src/lib/ipc";
import {
  deriveWorktreeStatus,
  getActiveWorktreeRows,
  shouldPromptForceCutRetry,
} from "@/src/lib/utils/worktree/status";

function buildRow(overrides: Partial<WorkspaceRow>): WorkspaceRow {
  return {
    worktree: "alpha",
    branchGuess: "feature/alpha",
    path: "/tmp/.worktrees/alpha",
    status: "paused",
    ...overrides,
  };
}

describe("deriveWorktreeStatus", () => {
  it("keeps terminal statuses over active terminal state", () => {
    expect(deriveWorktreeStatus("deleted", true)).toBe("deleted");
    expect(deriveWorktreeStatus("corrupted", true)).toBe("corrupted");
  });

  it("maps active terminal to ready", () => {
    expect(deriveWorktreeStatus("paused", true)).toBe("ready");
    expect(deriveWorktreeStatus("paused", false)).toBe("paused");
  });
});

describe("getActiveWorktreeRows", () => {
  it("includes ready worktrees, sorted by name", () => {
    const rows = [
      buildRow({ worktree: "charlie", status: "paused" }),
      buildRow({ worktree: "alpha", status: "paused" }),
      buildRow({ worktree: "bravo", status: "deleted" }),
    ];

    const activeWorktrees = new Set(["alpha", "bravo"]);
    const activeRows = getActiveWorktreeRows(rows, activeWorktrees);

    expect(activeRows.map((row) => row.worktree)).toEqual(["alpha"]);
  });
});

describe("shouldPromptForceCutRetry", () => {
  it("returns true only when both required guidance phrases appear", () => {
    const actionableResult = {
      ok: false,
      exitCode: 1,
      stdout: "Error: contains modified or untracked files.",
      stderr: "Hint: use --force to delete it.",
      error: undefined,
    };

    expect(shouldPromptForceCutRetry(actionableResult)).toBe(true);
  });

  it("does not prompt when the force guidance phrase is missing", () => {
    const incompleteResult = {
      ok: false,
      exitCode: 1,
      stdout: "Error: contains modified or untracked files.",
      stderr: "",
      error: undefined,
    };

    expect(shouldPromptForceCutRetry(incompleteResult)).toBe(false);
  });
});
