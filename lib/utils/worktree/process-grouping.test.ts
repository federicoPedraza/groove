import { describe, expect, it } from "vitest";

import {
  UNKNOWN_WORKTREE_LABEL,
  detectWorktreeNameFromCommand,
  groupRowsByWorktree,
} from "@/lib/utils/worktree/process-grouping";

describe("detectWorktreeNameFromCommand", () => {
  it("detects worktree names from unix and windows command paths", () => {
    expect(detectWorktreeNameFromCommand("/tmp/.worktrees/feature-123/bin/run")).toBe("feature-123");
    expect(detectWorktreeNameFromCommand("C:\\repo\\.worktree\\hotfix-2\\script.ps1")).toBe("hotfix-2");
  });

  it("returns null when no .worktree path segment exists", () => {
    expect(detectWorktreeNameFromCommand("node ./scripts/start.js")).toBeNull();
  });
});

describe("groupRowsByWorktree", () => {
  it("groups by detected worktree and keeps unknown group last", () => {
    const rows = [
      { id: 1, command: "node /repo/.worktrees/bravo/dev.js" },
      { id: 2, command: "node /repo/.worktrees/alpha/dev.js" },
      { id: 3, command: "node scripts/standalone.js" },
    ];

    const grouped = groupRowsByWorktree(rows, (row) => row.command);

    expect(grouped.map((group) => group.worktree)).toEqual(["alpha", "bravo", UNKNOWN_WORKTREE_LABEL]);
    expect(grouped[2]?.rows.map((row) => row.id)).toEqual([3]);
  });
});
