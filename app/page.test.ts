import { describe, expect, it, vi } from "vitest";

import type { WorktreeRow } from "../components/pages/dashboard/types";
import { buildDashboardWorktreeDetailShortcutActionables } from "./page";

function makeWorktreeRow(worktree: string, branchGuess: string): WorktreeRow {
  return {
    worktree,
    branchGuess,
    status: "ready",
  } as WorktreeRow;
}

describe("buildDashboardWorktreeDetailShortcutActionables", () => {
  it("returns per-worktree dropdowns directly at root", () => {
    const items = buildDashboardWorktreeDetailShortcutActionables(
      [makeWorktreeRow("alpha", "feature/alpha"), makeWorktreeRow("beta", "feature/beta")],
      vi.fn(),
      vi.fn(async () => {}),
    );

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.id)).toEqual([
      "dashboard.worktree-details.alpha",
      "dashboard.worktree-details.beta",
    ]);
    expect(items.some((item) => item.id === "dashboard.worktree-details")).toBe(false);
  });

  it("wires open details and play actions for each worktree", () => {
    const navigate = vi.fn();
    const runPlayGrooveAction = vi.fn(async () => {});
    const row = makeWorktreeRow("alpha", "feature/alpha");
    const [item] = buildDashboardWorktreeDetailShortcutActionables([row], navigate, runPlayGrooveAction);

    if (item.type !== "dropdown") {
      throw new Error("Expected dropdown item");
    }

    const [openDetailsItem, playItem] = item.items;
    if (openDetailsItem.type !== "button" || playItem.type !== "button") {
      throw new Error("Expected button actions");
    }

    openDetailsItem.run();
    playItem.run();

    expect(navigate).toHaveBeenCalledWith("/worktrees/alpha");
    expect(runPlayGrooveAction).toHaveBeenCalledWith(row);
  });
});
