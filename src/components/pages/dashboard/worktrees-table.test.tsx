import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorktreesTable } from "@/src/components/pages/dashboard/worktrees-table";
import type { WorktreeRow } from "@/src/components/pages/dashboard/types";
import type { GroupedWorktreeItem } from "@/src/lib/utils/time/grouping";

vi.mock("@/src/components/pages/dashboard/worktree-row-actions", () => ({
  WorktreeRowActions: ({
    row,
    onOpenTerminal,
  }: {
    row: WorktreeRow;
    onOpenTerminal?: (worktree: string) => void;
  }) => (
    <div data-testid={`row-actions-${row.worktree}`}>
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

function buildRow(options: {
  worktree: string;
  branchGuess: string;
  path: string;
  status?: WorktreeRow["status"];
}): WorktreeRow {
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
      activeTerminalWorktrees={new Set()}
      onCopyBranchName={() => {}}
      onRestoreAction={() => {}}
      onCutConfirm={() => {}}
      onStopAction={() => {}}
      onPlayAction={() => {}}
      onOpenTerminalAction={options.onOpenTerminalAction ?? (() => {})}
      workspaceSummaries={[]}
      worktreeSummaries={{}}
      onSummarizeSection={() => {}}
      onSummarizeWorktree={() => {}}
      summarizingWorktreeIds={new Set<string>()}
      onViewSectionSummary={() => {}}
      onViewWorktreeSummary={() => {}}
      summarizingSectionKeys={new Set<string>()}
      onForgetAllDeletedWorktrees={
        options.onForgetAllDeletedWorktrees ?? (() => {})
      }
      isForgetAllDeletedWorktreesPending={
        options.isForgetAllDeletedWorktreesPending ?? false
      }
    />,
  );
}

describe("WorktreesTable", () => {
  it("auto-collapses requested groups by default", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/today",
        row: buildRow({
          worktree: "today",
          branchGuess: "feature/today",
          path: "/worktrees/today",
        }),
      },
      { type: "section", label: "1 month old", key: "section:1 month old" },
      {
        type: "row",
        key: "row:/worktrees/month-old",
        row: buildRow({
          worktree: "month-old",
          branchGuess: "feature/month-old",
          path: "/worktrees/month-old",
        }),
      },
      {
        type: "section",
        label: "Deleted worktrees",
        key: "section:Deleted worktrees",
      },
      {
        type: "row",
        key: "row:/worktrees/deleted",
        row: buildRow({
          worktree: "deleted",
          branchGuess: "feature/deleted",
          path: "/worktrees/deleted",
          status: "deleted",
        }),
      },
      {
        type: "section",
        label: "No activity yet",
        key: "section:No activity yet",
      },
      {
        type: "row",
        key: "row:/worktrees/no-activity",
        row: buildRow({
          worktree: "no-activity",
          branchGuess: "feature/no-activity",
          path: "/worktrees/no-activity",
        }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    expect(screen.getByText("feature/today")).toBeTruthy();
    expect(screen.queryByText("feature/month-old")).toBeNull();
    expect(screen.queryByText("feature/deleted")).toBeNull();
    expect(screen.queryByText("feature/no-activity")).toBeNull();

    const expandOneMonthOldButton = screen.getByRole("button", {
      name: "Expand 1 month old section",
    });
    expect(expandOneMonthOldButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandOneMonthOldButton);

    expect(screen.getByText("feature/month-old")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Collapse 1 month old section" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps non-targeted groups expanded by default and supports collapsing", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Yesterday", key: "section:Yesterday" },
      {
        type: "row",
        key: "row:/worktrees/yesterday",
        row: buildRow({
          worktree: "yesterday",
          branchGuess: "feature/yesterday",
          path: "/worktrees/yesterday",
        }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    expect(screen.getByText("feature/yesterday")).toBeTruthy();
    const collapseButton = screen.getByRole("button", {
      name: "Collapse Yesterday section",
    });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseButton);

    expect(screen.queryByText("feature/yesterday")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Expand Yesterday section" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("shows Forget all only for expanded deleted section and triggers handler", () => {
    const onForgetAllDeletedWorktrees = vi.fn();
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      {
        type: "section",
        label: "Deleted worktrees",
        key: "section:Deleted worktrees",
      },
      {
        type: "row",
        key: "row:/worktrees/deleted",
        row: buildRow({
          worktree: "deleted",
          branchGuess: "feature/deleted",
          path: "/worktrees/deleted",
          status: "deleted",
        }),
      },
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/today",
        row: buildRow({
          worktree: "today",
          branchGuess: "feature/today",
          path: "/worktrees/today",
        }),
      },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      onForgetAllDeletedWorktrees,
    });

    expect(
      screen.queryByRole("button", { name: "Forget all deleted worktrees" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand Deleted worktrees section" }),
    );

    const forgetAllButton = screen.getByRole("button", {
      name: "Forget all deleted worktrees",
    });
    expect(forgetAllButton).toBeTruthy();
    fireEvent.click(forgetAllButton);
    expect(onForgetAllDeletedWorktrees).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Collapse Deleted worktrees section",
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Forget all deleted worktrees" }),
    ).toBeNull();
  });

  it("creates an Ungrouped section for rows without a preceding section header", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      {
        type: "row",
        key: "row:/worktrees/orphan",
        row: buildRow({
          worktree: "orphan",
          branchGuess: "feature/orphan",
          path: "/worktrees/orphan",
        }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    expect(screen.getByText("Ungrouped")).toBeTruthy();
    expect(screen.getByText("feature/orphan")).toBeTruthy();
  });

  it("calls onCopyBranchName when copy branch button is clicked", () => {
    const onCopyBranchName = vi.fn();
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/today",
        row: buildRow({
          worktree: "today",
          branchGuess: "feature/today",
          path: "/worktrees/today",
        }),
      },
    ];

    render(
      <WorktreesTable
        groupedWorktreeItems={groupedWorktreeItems}
        copiedBranchPath={null}
        pendingRestoreActions={[]}
        pendingCutGrooveActions={[]}
        pendingStopActions={[]}
        pendingPlayActions={[]}
        activeTerminalWorktrees={new Set()}
        onCopyBranchName={onCopyBranchName}
        onRestoreAction={() => {}}
        onCutConfirm={() => {}}
        onStopAction={() => {}}
        onPlayAction={() => {}}
        onOpenTerminalAction={() => {}}
        workspaceSummaries={[]}
        worktreeSummaries={{}}
        onSummarizeSection={() => {}}
        onSummarizeWorktree={() => {}}
        summarizingWorktreeIds={new Set<string>()}
        onViewSectionSummary={() => {}}
        onViewWorktreeSummary={() => {}}
        summarizingSectionKeys={new Set<string>()}
        onForgetAllDeletedWorktrees={() => {}}
        isForgetAllDeletedWorktreesPending={false}
      />,
    );

    const copyButton = screen.getByRole("button", { name: /Copy branch name/ });
    fireEvent.click(copyButton);

    expect(onCopyBranchName).toHaveBeenCalledWith(
      expect.objectContaining({ worktree: "today" }),
    );
  });

  it("shows check icon when branch is copied", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/today",
        row: buildRow({
          worktree: "today",
          branchGuess: "feature/today",
          path: "/worktrees/today",
        }),
      },
    ];

    render(
      <WorktreesTable
        groupedWorktreeItems={groupedWorktreeItems}
        copiedBranchPath="/worktrees/today"
        pendingRestoreActions={[]}
        pendingCutGrooveActions={[]}
        pendingStopActions={[]}
        pendingPlayActions={[]}
        activeTerminalWorktrees={new Set()}
        onCopyBranchName={() => {}}
        onRestoreAction={() => {}}
        onCutConfirm={() => {}}
        onStopAction={() => {}}
        onPlayAction={() => {}}
        onOpenTerminalAction={() => {}}
        workspaceSummaries={[]}
        worktreeSummaries={{}}
        onSummarizeSection={() => {}}
        onSummarizeWorktree={() => {}}
        summarizingWorktreeIds={new Set<string>()}
        onViewSectionSummary={() => {}}
        onViewWorktreeSummary={() => {}}
        summarizingSectionKeys={new Set<string>()}
        onForgetAllDeletedWorktrees={() => {}}
        isForgetAllDeletedWorktreesPending={false}
      />,
    );

    // The Copy branch name button should still exist
    expect(
      screen.getByRole("button", { name: /Copy branch name/ }),
    ).toBeTruthy();
  });

  it("shows Forgetting... label when isForgetAllDeletedWorktreesPending is true", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      {
        type: "section",
        label: "Deleted worktrees",
        key: "section:Deleted worktrees",
      },
      {
        type: "row",
        key: "row:/worktrees/deleted",
        row: buildRow({
          worktree: "deleted",
          branchGuess: "feature/deleted",
          path: "/worktrees/deleted",
          status: "deleted",
        }),
      },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      isForgetAllDeletedWorktreesPending: true,
    });

    // Expand the collapsed section first
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Deleted worktrees section" }),
    );

    const forgetButton = screen.getByRole("button", {
      name: "Forgetting all deleted worktrees",
    });
    expect(forgetButton).toBeTruthy();
    expect(forgetButton).toBeDisabled();
    expect(forgetButton.textContent).toBe("Forgetting...");
  });

  it("shows about deleted worktrees tooltip button for deleted section", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      {
        type: "section",
        label: "Deleted worktrees",
        key: "section:Deleted worktrees",
      },
      {
        type: "row",
        key: "row:/worktrees/deleted",
        row: buildRow({
          worktree: "deleted",
          branchGuess: "feature/deleted",
          path: "/worktrees/deleted",
          status: "deleted",
        }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    expect(
      screen.getByRole("button", { name: "About deleted worktrees" }),
    ).toBeTruthy();
  });

  it("renders Summarize button for non-deleted sections with worktreeIds", () => {
    // Need worktreeId on rows for summarize to appear
    const row = buildRow({
      worktree: "today",
      branchGuess: "feature/today",
      path: "/worktrees/today",
    });
    (row as Record<string, unknown>).worktreeId = "wt-today";
    const items: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      { type: "row", key: "row:/worktrees/today", row },
    ];

    renderWorktreesTable({ groupedWorktreeItems: items });

    expect(
      screen.getByRole("button", { name: /Summarize Today section/i }),
    ).toBeTruthy();
  });

  it("passes the worktree terminal action through to row actions", () => {
    const onOpenTerminalAction = vi.fn();
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/today",
        row: buildRow({
          worktree: "today",
          branchGuess: "feature/today",
          path: "/worktrees/today",
        }),
      },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      onOpenTerminalAction,
    });

    fireEvent.click(screen.getByTestId("open-terminal-today"));

    expect(onOpenTerminalAction).toHaveBeenCalledWith("today");
  });
});
