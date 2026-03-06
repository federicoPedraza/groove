import { describe, expect, it } from "vitest";

import { buildWorktreeInstanceLabels } from "@/lib/utils/worktree/labels";

describe("buildWorktreeInstanceLabels", () => {
  it("prefers trimmed task title and falls back to worktree name", () => {
    const labels = buildWorktreeInstanceLabels(
      [
        { worktree: "alpha", taskId: "task-1" },
        { worktree: "beta", taskId: "task-2" },
      ],
      {
        "task-1": "  Implement auth flow  ",
        "task-2": "   ",
      },
    );

    expect(labels).toEqual([
      {
        worktree: "alpha",
        usesTaskTitle: true,
        baseLabel: "Implement auth flow",
        displayLabel: "Implement auth flow",
      },
      {
        worktree: "beta",
        usesTaskTitle: false,
        baseLabel: "beta",
        displayLabel: "beta",
      },
    ]);
  });

  it("prefixes duplicate labels in occurrence order", () => {
    const labels = buildWorktreeInstanceLabels(
      [
        { worktree: "one", taskId: "task-1" },
        { worktree: "two", taskId: "task-2" },
        { worktree: "three", taskId: "task-3" },
      ],
      {
        "task-1": "Shared",
        "task-2": "Shared",
        "task-3": "Shared",
      },
    );

    expect(labels.map((label) => label.displayLabel)).toEqual([
      "[1] Shared",
      "[2] Shared",
      "[3] Shared",
    ]);
  });
});
