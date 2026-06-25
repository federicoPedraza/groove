import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorktreesTable } from "@/src/components/pages/barracks/worktrees-table";
import type { WorktreeRow } from "@/src/components/pages/barracks/types";
import type { GroupedWorktreeItem } from "@/src/lib/utils/time/grouping";

vi.mock("@/src/components/pages/barracks/worktree-row-actions", () => ({
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
  worktreeStates?: Record<
    string,
    "pending" | "fighting" | "wounded" | "defeated" | "blocked" | "forgotten"
  >;
  worktreeUnits?: Record<
    string,
    | {
        kind: "bug" | "goldmine" | "gems";
        level: 1 | 2 | 3 | 4 | 5;
        reward: number;
        name: string;
        rewarded?: boolean;
      }
    | undefined
  >;
}) {
  return render(
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
      onSummarizeWorktree={() => {}}
      summarizingWorktreeIds={new Set<string>()}
      onViewSectionSummary={() => {}}
      onViewWorktreeSummary={() => {}}
      onForgetAllDeletedWorktrees={
        options.onForgetAllDeletedWorktrees ?? (() => {})
      }
      isForgetAllDeletedWorktreesPending={
        options.isForgetAllDeletedWorktreesPending ?? false
      }
      worktreeStates={options.worktreeStates ?? {}}
      worktreeUnits={options.worktreeUnits ?? {}}
      discoveringWorktrees={new Set<string>()}
      newDiscoveryWorktrees={new Set<string>()}
      onSetWorktreeState={() => {}}
      onDiscoverWorktree={() => {}}
      onClaimWorktreeReward={() => {}}
      onLootWorktree={() => {}}
    />,
  );
}

describe("WorktreesTable", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders the unit badge in the Target column when a unit is present, falls back to 'unknown' otherwise", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/has-unit",
        row: buildRow({
          worktree: "has-unit",
          branchGuess: "feature/has-unit",
          path: "/worktrees/has-unit",
        }),
      },
      {
        type: "row",
        key: "row:/worktrees/no-unit",
        row: buildRow({
          worktree: "no-unit",
          branchGuess: "feature/no-unit",
          path: "/worktrees/no-unit",
        }),
      },
    ];

    const { container } = renderWorktreesTable({
      groupedWorktreeItems,
      worktreeUnits: {
        "has-unit": {
          kind: "goldmine",
          level: 5,
          reward: 1100,
          name: "Goldmine",
        },
      },
    });

    // Has-unit row shows the unit badge with kind name; no reward number rendered.
    expect(
      container.querySelector('[title*="Goldmine"][title*="level 5"]'),
    ).toBeTruthy();
    expect(screen.getByText("Goldmine")).toBeTruthy();
    expect(screen.queryByText("1100")).toBeNull();
    expect(screen.queryByText("L5")).toBeNull();
    // No-unit row falls back to the unknown placeholder.
    expect(screen.getByText("unknown")).toBeTruthy();
  });

  it("strikes through the unit name when the reward has been claimed", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/claimed",
        row: buildRow({
          worktree: "claimed",
          branchGuess: "feature/claimed",
          path: "/worktrees/claimed",
        }),
      },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      worktreeUnits: {
        claimed: {
          kind: "bug",
          level: 2,
          reward: 80,
          name: "Omen",
          rewarded: true,
        },
      },
    });

    const nameSpan = screen.getByText("Omen");
    expect(nameSpan.className).toMatch(/line-through/);
  });

  it("hides forgotten worktrees by default and reveals them via the filter", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/defeated-one",
        row: buildRow({
          worktree: "defeated-one",
          branchGuess: "feature/defeated-one",
          path: "/worktrees/defeated-one",
        }),
      },
      {
        type: "row",
        key: "row:/worktrees/forgotten-one",
        row: buildRow({
          worktree: "forgotten-one",
          branchGuess: "feature/forgotten-one",
          path: "/worktrees/forgotten-one",
        }),
      },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      worktreeStates: {
        "defeated-one": "defeated",
        "forgotten-one": "forgotten",
      },
    });

    expect(screen.getByText("feature/defeated-one")).toBeTruthy();
    expect(screen.queryByText("feature/forgotten-one")).toBeFalsy();

    const filterTrigger = screen.getByRole("button", { name: /Filter states/ });
    fireEvent.pointerDown(filterTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(filterTrigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /forgotten/ }));

    expect(screen.getByText("feature/forgotten-one")).toBeTruthy();
  });

  it("renders Branch, State, Groove, Target, Actions columns in order", () => {
    renderWorktreesTable({
      groupedWorktreeItems: [
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
      ],
    });

    const headers = screen.getAllByRole("columnheader").map((node) => node.textContent);
    expect(headers).toEqual(["Branch", "State", "Groove", "Target", "Actions"]);
  });

  it("defaults to date grouping and regroups by state when Status sort is selected", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/a",
        row: buildRow({
          worktree: "a",
          branchGuess: "feature/a",
          path: "/worktrees/a",
        }),
      },
      {
        type: "row",
        key: "row:/worktrees/b",
        row: buildRow({
          worktree: "b",
          branchGuess: "feature/b",
          path: "/worktrees/b",
        }),
      },
    ];

    renderWorktreesTable({
      groupedWorktreeItems,
      worktreeStates: { a: "pending", b: "fighting" },
    });

    // Date mode (default): a single date section, no state sections.
    expect(
      screen.getByRole("button", { name: /Today section/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /pending section/i }),
    ).toBeNull();

    const sortTrigger = screen.getByRole("button", { name: /Sort worktrees/ });
    fireEvent.pointerDown(sortTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(sortTrigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Status" }));

    // Status mode: one section per worktree state, date section gone.
    expect(
      screen.queryByRole("button", { name: /Today section/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /pending section/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /fighting section/i }),
    ).toBeTruthy();
  });

  it("regroups by groove status when Groove state sort is selected", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/paused-one",
        row: buildRow({
          worktree: "paused-one",
          branchGuess: "feature/paused-one",
          path: "/worktrees/paused-one",
          status: "paused",
        }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    const sortTrigger = screen.getByRole("button", { name: /Sort worktrees/ });
    fireEvent.pointerDown(sortTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(sortTrigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Groove state" }));

    // No active terminals, so the worktree falls under the "Paused" section.
    expect(
      screen.getByRole("button", { name: /Paused section/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Today section/i }),
    ).toBeNull();
  });

  it("persists the selected sort mode across remounts", () => {
    const groupedWorktreeItems: GroupedWorktreeItem[] = [
      { type: "section", label: "Today", key: "section:Today" },
      {
        type: "row",
        key: "row:/worktrees/paused-one",
        row: buildRow({
          worktree: "paused-one",
          branchGuess: "feature/paused-one",
          path: "/worktrees/paused-one",
          status: "paused",
        }),
      },
    ];

    const first = renderWorktreesTable({ groupedWorktreeItems });

    const sortTrigger = screen.getByRole("button", { name: /Sort worktrees/ });
    fireEvent.pointerDown(sortTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(sortTrigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Groove state" }));

    expect(window.localStorage.getItem("groove:worktrees-sort-mode")).toBe(
      "groove",
    );

    // Remount (as if reopening the app): the saved sort mode is restored
    // without going through the dropdown again.
    first.unmount();
    renderWorktreesTable({ groupedWorktreeItems });

    expect(
      screen.getByRole("button", { name: /Paused section/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Today section/i }),
    ).toBeNull();
  });

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

  it("keeps the Today group expanded by default and supports collapsing", () => {
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

    renderWorktreesTable({ groupedWorktreeItems });

    expect(screen.getByText("feature/today")).toBeTruthy();
    const collapseButton = screen.getByRole("button", {
      name: "Collapse Today section",
    });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapseButton);

    expect(screen.queryByText("feature/today")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Expand Today section" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("collapses older sections by default when Today is present", () => {
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

    expect(screen.getByText("feature/today")).toBeTruthy();
    expect(screen.queryByText("feature/yesterday")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Yesterday section" }),
    );
    expect(screen.getByText("feature/yesterday")).toBeTruthy();
  });

  it("falls back to expanding the first active section when Today is empty", () => {
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
      { type: "section", label: "3 days ago", key: "section:3 days ago" },
      {
        type: "row",
        key: "row:/worktrees/three-days",
        row: buildRow({
          worktree: "three-days",
          branchGuess: "feature/three-days",
          path: "/worktrees/three-days",
        }),
      },
    ];

    renderWorktreesTable({ groupedWorktreeItems });

    // Yesterday is now the first active section -> auto-expanded.
    expect(screen.getByText("feature/yesterday")).toBeTruthy();
    // 3 days ago stays collapsed.
    expect(screen.queryByText("feature/three-days")).toBeNull();
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
        onSummarizeWorktree={() => {}}
        summarizingWorktreeIds={new Set<string>()}
        onViewSectionSummary={() => {}}
        onViewWorktreeSummary={() => {}}
        onForgetAllDeletedWorktrees={() => {}}
        isForgetAllDeletedWorktreesPending={false}
        worktreeStates={{}}
        worktreeUnits={{}}
        discoveringWorktrees={new Set<string>()}
        newDiscoveryWorktrees={new Set<string>()}
        onSetWorktreeState={() => {}}
        onDiscoverWorktree={() => {}}
        onClaimWorktreeReward={() => {}}
      onLootWorktree={() => {}}
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
        onSummarizeWorktree={() => {}}
        summarizingWorktreeIds={new Set<string>()}
        onViewSectionSummary={() => {}}
        onViewWorktreeSummary={() => {}}
        onForgetAllDeletedWorktrees={() => {}}
        isForgetAllDeletedWorktreesPending={false}
        worktreeStates={{}}
        worktreeUnits={{}}
        discoveringWorktrees={new Set<string>()}
        newDiscoveryWorktrees={new Set<string>()}
        onSetWorktreeState={() => {}}
        onDiscoverWorktree={() => {}}
        onClaimWorktreeReward={() => {}}
      onLootWorktree={() => {}}
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

  it("does not render a section-level Summarize button", () => {
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
      screen.queryByRole("button", { name: /Summarize Today section/i }),
    ).toBeNull();
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
