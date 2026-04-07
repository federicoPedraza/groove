import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorktreesTable } from "@/components/pages/dashboard/worktrees-table";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import type { GroupedWorktreeItem } from "@/lib/utils/time/grouping";

vi.mock("@/components/pages/dashboard/worktree-row-actions", () => ({
  WorktreeRowActions: ({
    row,
    hasConnectedRepository,
    onOpenTerminal,
  }: {
    row: WorktreeRow;
    hasConnectedRepository: boolean;
    onOpenTerminal?: (worktree: string) => void;
  }) => (
    <div data-testid={`row-actions-${row.worktree}`} data-has-connected-repository={String(hasConnectedRepository)}>
      <button
        type="button"
        data-testid={`open-terminal-${row.worktree}`}
        onClick={() => {
          onOpenTerminal?.(row.worktree);
        }}
      >
        Open terminal
      </button>
    </div>
  ),
}));

function buildRow(options: { worktree: string; branchGuess: string; path: string; status?: WorktreeRow["status"] }): WorktreeRow {
  return {
    worktree: options.worktree,
    branchGuess: options.branchGuess,
    path: options.path,
    status: options.status ?? "paused",
    lastExecutedAt: undefined,
  };
}

function renderWorktreesTable(options: {
  groupedWorktreeItems: GroupedWorktreeItem[];
  onForgetAllDeletedWorktrees?: () => void;
  isForgetAllDeletedWorktreesPending?: boolean;
  hasConnectedRepository?: boolean;
  onOpenTerminalAction?: (worktree: string) => void;
}) {
  render(
    <WorktreesTable
      groupedWorktreeItems={options.groupedWorktreeItems}
      copiedBranchPath={null}
      pendingRestoreActions={[]}
      pendingCutGrooveActions={[]}
      pendingStopActions={[]}
      pendingPlayActions={[]}
      pendingTestActions={[]}
      runtimeStateByWorktree={{}}
      testingTargetWorktrees={[]}
      testingRunningWorktrees={[]}
      hasConnectedRepository={options.hasConnectedRepository ?? true}
      repositoryRemoteUrl={undefined}
      onCopyBranchName={() => {}}
      onRestoreAction={() => {}}
      onCutConfirm={() => {}}
      onStopAction={() => {}}
      onPlayAction={() => {}}
      onOpenTerminalAction={options.onOpenTerminalAction ?? (() => {})}
      onSetTestingTargetAction={() => {}}
      workspaceSummaries={[]}
      worktreeSummaries={{}}
      onSummarizeSection={() => {}}
      onSummarizeWorktree={() => {}}
      summarizingWorktreeId={null}
      onViewSectionSummary={() => {}}
      onViewWorktreeSummary={() => {}}
      summarizingSectionKey={null}
      onForgetAllDeletedWorktrees={options.onForgetAllDeletedWorktrees ?? (() => {})}
      isForgetAllDeletedWorktreesPending={options.isForgetAllDeletedWorktreesPending ?? false}
    />,
  );
}

describe("WorktreesTable", () => {
  it("auto-collapses requested groups by default", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      { type: "row", key: "row:/worktrees/today", row: buildRow({ worktree: "today", branchGuess: "feature/today", path: "/worktrees/today" }) },
      { type: "section", label: "1 month old", key: "section:1 month old" },
      { type: "row", key: "row:/worktrees/month-old", row: buildRow({ worktree: "month-old", branchGuess: "feature/month-old", path: "/worktrees/month-old" }) },
      { type: "section", label: "Deleted worktrees", key: "section:Deleted worktrees" },
      {
        type: "row",
        key: "row:/worktrees/deleted",
        row: buildRow({ worktree: "deleted", branchGuess: "feature/deleted", path: "/worktrees/deleted", status: "deleted" }),
      },
      { type: "section", label: "No activity yet", key: "section:No activity yet" },
      { type: "row", key: "row:/worktrees/no-activity", row: buildRow({ worktree: "no-activity", branchGuess: "feature/no-activity", path: "/worktrees/no-activity" }) },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    expect(screen.getByText("feature/today")).toBeTruthy();
    expect(screen.queryByText("feature/month-old")).toBeNull();
    expect(screen.queryByText("feature/deleted")).toBeNull();
    expect(screen.queryByText("feature/no-activity")).toBeNull();

    const expandOneMonthOldButton = screen.getByRole("button", { name: "Expand 1 month old section" });
    expect(expandOneMonthOldButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandOneMonthOldButton);

    expect(screen.getByText("feature/month-old")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse 1 month old section" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps non-targeted groups expanded by default and supports collapsing", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Yesterday", key: "section:Yesterday" },
      {
        type: "row",
        key: "row:/worktrees/yesterday",
        row: buildRow({ worktree: "yesterday", branchGuess: "feature/yesterday", path: "/worktrees/yesterday" }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    expect(screen.getByText("feature/yesterday")).toBeTruthy();
    const collapseButton = screen.getByRole("button", { name: "Collapse Yesterday section" });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseButton);

    expect(screen.queryByText("feature/yesterday")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand Yesterday section" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows Forget all only for expanded deleted section and triggers handler", () => {
    const onForgetAllDeletedWorktrees = vi.fn();
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Deleted worktrees", key: "section:Deleted worktrees" },
      {
        type: "row",
        key: "row:/worktrees/deleted",
        row: buildRow({ worktree: "deleted", branchGuess: "feature/deleted", path: "/worktrees/deleted", status: "deleted" }),
      },
      { type: "section", label: "Today", key: "section:Today" },
      { type: "row", key: "row:/worktrees/today", row: buildRow({ worktree: "today", branchGuess: "feature/today", path: "/worktrees/today" }) },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      onForgetAllDeletedWorktrees,
    });

    expect(screen.queryByRole("button", { name: "Forget all deleted worktrees" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand Deleted worktrees section" }));

    const forgetAllButton = screen.getByRole("button", { name: "Forget all deleted worktrees" });
    expect(forgetAllButton).toBeTruthy();
    fireEvent.click(forgetAllButton);
    expect(onForgetAllDeletedWorktrees).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Deleted worktrees section" }));
    expect(screen.queryByRole("button", { name: "Forget all deleted worktrees" })).toBeNull();
  });

  it("passes repository connection state to row actions", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      { type: "row", key: "row:/worktrees/today", row: buildRow({ worktree: "today", branchGuess: "feature/today", path: "/worktrees/today" }) },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      hasConnectedRepository: false,
    });

    expect(screen.getByTestId("row-actions-today").getAttribute("data-has-connected-repository")).toBe("false");
  });

  it("passes the worktree terminal action through to row actions", () => {
    const onOpenTerminalAction = vi.fn();
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      { type: "row", key: "row:/worktrees/today", row: buildRow({ worktree: "today", branchGuess: "feature/today", path: "/worktrees/today" }) },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      onOpenTerminalAction,
    });

    fireEvent.click(screen.getByTestId("open-terminal-today"));

    expect(onOpenTerminalAction).toHaveBeenCalledWith("today");
  });
});
