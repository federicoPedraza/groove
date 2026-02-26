import { describe, expect, it } from "vitest";

import type { WorkspaceRow } from "@/src/lib/ipc";
import {
  deriveWorktreeStatus,
  getActiveWorktreeRows,
  shouldPromptForceCutRetry,
} from "@/lib/utils/worktree/status";

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
  it("keeps terminal statuses over runtime state", () => {
    expect(deriveWorktreeStatus("deleted", { opencodeState: "running" })).toBe("deleted");
    expect(deriveWorktreeStatus("corrupted", { opencodeState: "running" })).toBe("corrupted");
    expect(deriveWorktreeStatus("closing", { opencodeState: "running" })).toBe("closing");
  });

  it("maps running runtime rows to ready", () => {
    expect(deriveWorktreeStatus("paused", { opencodeState: "running" })).toBe("ready");
    expect(deriveWorktreeStatus("paused", { opencodeState: "not-running" })).toBe("paused");
  });
});

describe("getActiveWorktreeRows", () => {
  it("includes ready and testing worktrees, sorted by name", () => {
    const rows = [
      buildRow({ worktree: "charlie", status: "paused" }),
      buildRow({ worktree: "alpha", status: "paused" }),
      buildRow({ worktree: "bravo", status: "deleted" }),
    ];

    const activeRows = getActiveWorktreeRows(
      rows,
      {
        alpha: { opencodeState: "running" },
        bravo: { opencodeState: "running" },
      },
      ["charlie"],
    );

    expect(activeRows.map((row) => row.worktree)).toEqual(["alpha", "charlie"]);
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
