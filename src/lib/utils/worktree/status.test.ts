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
  it("includes only ready worktrees", () => {
    const rows = [
      buildRow({ worktree: "charlie", status: "paused" }),
      buildRow({ worktree: "alpha", status: "paused" }),
      buildRow({ worktree: "bravo", status: "deleted" }),
    ];

    const activeWorktrees = new Set(["alpha", "bravo"]);
    const activeRows = getActiveWorktreeRows(rows, activeWorktrees);

    expect(activeRows.map((row) => row.worktree)).toEqual(["alpha"]);
  });

  it("sorts by play start time (most recent first)", () => {
    const rows = [
      buildRow({
        worktree: "alpha",
        path: "/tmp/.worktrees/alpha",
        lastExecutedAt: "2025-01-01T00:00:00Z",
      }),
      buildRow({
        worktree: "charlie",
        path: "/tmp/.worktrees/charlie",
        lastExecutedAt: "2025-06-01T00:00:00Z",
      }),
      buildRow({
        worktree: "bravo",
        path: "/tmp/.worktrees/bravo",
        lastExecutedAt: "2025-03-01T00:00:00Z",
      }),
    ];

    const activeWorktrees = new Set(["alpha", "bravo", "charlie"]);
    const activeRows = getActiveWorktreeRows(rows, activeWorktrees);

    expect(activeRows.map((row) => row.worktree)).toEqual([
      "charlie",
      "bravo",
      "alpha",
    ]);
  });

  it("orders rows without a play start time last, tie-broken by name", () => {
    const rows = [
      buildRow({ worktree: "zulu", path: "/tmp/.worktrees/zulu" }),
      buildRow({ worktree: "alpha", path: "/tmp/.worktrees/alpha" }),
      buildRow({
        worktree: "bravo",
        path: "/tmp/.worktrees/bravo",
        lastExecutedAt: "2025-03-01T00:00:00Z",
      }),
    ];

    const activeWorktrees = new Set(["zulu", "alpha", "bravo"]);
    const activeRows = getActiveWorktreeRows(rows, activeWorktrees);

    expect(activeRows.map((row) => row.worktree)).toEqual([
      "bravo",
      "alpha",
      "zulu",
    ]);
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
