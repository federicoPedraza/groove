import type React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { WorktreeRow } from "../components/pages/dashboard/types";
import type { SummaryRecord } from "@/src/lib/ipc";
import { buildDashboardWorktreeDetailShortcutActionables } from "./page";

const {
  useDashboardStateMock,
  grooveSummaryMock,
  useAppLayoutMock,
} = vi.hoisted(() => ({
  useDashboardStateMock: vi.fn(),
  grooveSummaryMock: vi.fn(),
  useAppLayoutMock: vi.fn(),
}));

vi.mock("@/src/components/pages/dashboard/hooks/use-dashboard-state", () => ({
  useDashboardState: useDashboardStateMock,
}));

vi.mock("@/src/lib/ipc", () => ({
  grooveSummary: grooveSummaryMock,
}));

vi.mock("@/src/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock("@/src/components/pages/use-app-layout", () => ({
  useAppLayout: useAppLayoutMock,
}));

vi.mock("@/src/components/shortcuts/use-shortcut-registration", () => ({
  useShortcutRegistration: vi.fn(),
}));

vi.mock("@/src/components/pages/dashboard/dashboard-header", () => ({
  DashboardHeader: ({ onRefresh, onCreate }: { onRefresh: () => void; onCreate: () => void }) => (
    <div data-testid="dashboard-header">
      <button onClick={onRefresh}>Refresh</button>
      <button onClick={onCreate}>Create</button>
    </div>
  ),
}));

vi.mock("@/src/components/pages/dashboard/dashboard-modals", () => ({
  DashboardModals: (props: {
    onRunCutGrooveAction: (row: WorktreeRow, force: boolean) => void;
    onCloseCurrentWorkspace: () => void;
    onRunCreateWorktreeAction: (options: { branch: string; base: string }) => void;
  }) => (
    <div data-testid="dashboard-modals">
      <button onClick={() => props.onRunCutGrooveAction({ worktree: "alpha" } as WorktreeRow, false)}>Modal Cut</button>
      <button onClick={() => props.onCloseCurrentWorkspace()}>Modal Close Workspace</button>
      <button onClick={() => props.onRunCreateWorktreeAction({ branch: "feat/x", base: "main" })}>Modal Create</button>
    </div>
  ),
}));

vi.mock("@/src/components/pages/dashboard/summary-viewer-modal", () => ({
  SummaryViewerModal: ({ open, onClose, onCreateNewSummary, isCreatePending }: {
    open: boolean;
    onClose: () => void;
    onCreateNewSummary?: () => void;
    isCreatePending: boolean;
  }) => open ? (
    <div data-testid="summary-modal">
      <button onClick={onClose}>Close Summary</button>
      {onCreateNewSummary && <button onClick={onCreateNewSummary} disabled={isCreatePending}>Create New</button>}
    </div>
  ) : null,
}));

vi.mock("@/src/components/pages/dashboard/worktrees-table", () => ({
  WorktreesTable: (props: {
    onSummarizeWorktree: (id: string) => void;
    onSummarizeSection: (key: string, ids: string[]) => void;
    onViewWorktreeSummary: (s: SummaryRecord) => void;
    onViewSectionSummary: (s: SummaryRecord) => void;
    onForgetAllDeletedWorktrees: () => void;
    onCopyBranchName: (row: WorktreeRow) => void;
    onRestoreAction: (row: WorktreeRow) => void;
    onCutConfirm: (row: WorktreeRow) => void;
    onStopAction: (row: WorktreeRow) => void;
    onPlayAction: (row: WorktreeRow) => void;
    onOpenTerminalAction: (worktree: string) => void;
  }) => (
    <div data-testid="worktrees-table">
      <button onClick={() => props.onSummarizeWorktree("wt-1")}>Summarize WT</button>
      <button onClick={() => props.onSummarizeSection("section-1", ["wt-1", "wt-2"])}>Summarize Section</button>
      <button onClick={() => props.onViewWorktreeSummary({ worktreeIds: ["wt-1"], createdAt: "2026-01-01", summary: "Test summary" })}>View WT Summary</button>
      <button onClick={() => props.onViewSectionSummary({ worktreeIds: ["wt-1", "wt-2"], createdAt: "2026-01-01", summary: "Section summary" })}>View Section Summary</button>
      <button onClick={props.onForgetAllDeletedWorktrees}>Forget Deleted</button>
      <button onClick={() => props.onCopyBranchName({ worktree: "alpha" } as WorktreeRow)}>Copy Branch</button>
      <button onClick={() => props.onRestoreAction({ worktree: "alpha" } as WorktreeRow)}>Restore</button>
      <button onClick={() => props.onCutConfirm({ worktree: "alpha" } as WorktreeRow)}>Cut Confirm</button>
      <button onClick={() => props.onStopAction({ worktree: "alpha" } as WorktreeRow)}>Stop</button>
      <button onClick={() => props.onPlayAction({ worktree: "alpha" } as WorktreeRow)}>Play</button>
      <button onClick={() => props.onOpenTerminalAction("alpha")}>Open Terminal</button>
    </div>
  ),
}));

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

  it("returns empty array for empty input", () => {
    const items = buildDashboardWorktreeDetailShortcutActionables(
      [],
      vi.fn(),
      vi.fn(async () => {}),
    );
    expect(items).toHaveLength(0);
  });

  it("encodes worktree names with special characters in navigation path", () => {
    const navigate = vi.fn();
    const row = makeWorktreeRow("feat/my branch", "feature/my-branch");
    const [item] = buildDashboardWorktreeDetailShortcutActionables([row], navigate, vi.fn(async () => {}));

    if (item.type !== "dropdown") {
      throw new Error("Expected dropdown item");
    }

    const openDetailsItem = item.items[0];
    if (openDetailsItem.type !== "button") {
      throw new Error("Expected button");
    }

    openDetailsItem.run();
    expect(navigate).toHaveBeenCalledWith("/worktrees/feat%2Fmy%20branch");
  });

  it("uses worktree name as label and branchGuess as description", () => {
    const items = buildDashboardWorktreeDetailShortcutActionables(
      [makeWorktreeRow("my-tree", "main")],
      vi.fn(),
      vi.fn(async () => {}),
    );

    expect(items[0].label).toBe("my-tree");
    expect(items[0].description).toBe("main");
  });

  it("sets item type to dropdown with two sub-items", () => {
    const items = buildDashboardWorktreeDetailShortcutActionables(
      [makeWorktreeRow("alpha", "feature/alpha")],
      vi.fn(),
      vi.fn(async () => {}),
    );

    const item = items[0];
    expect(item.type).toBe("dropdown");
    if (item.type === "dropdown") {
      expect(item.items).toHaveLength(2);
      expect(item.items[0].label).toBe("Open details");
      expect(item.items[1].label).toBe("Play Groove");
    }
  });
});

function makeDashboardState(overrides: Record<string, unknown> = {}) {
  return {
    activeWorkspace: null,
    worktreeRows: [],
    hasWorktreesDirectory: false,
    statusMessage: null,
    errorMessage: null,
    isBusy: false,
    isWorkspaceHydrating: false,
    pendingRestoreActions: [],
    pendingCutGrooveActions: [],
    isForgetAllDeletedWorktreesPending: false,
    pendingStopActions: [],
    pendingPlayActions: [],
    copiedBranchPath: null,
    isCloseWorkspaceConfirmOpen: false,
    cutConfirmRow: null,
    forceCutConfirmRow: null,
    runtimeStateByWorktree: {},
    isCreateModalOpen: false,
    createBranch: "",
    createBase: "",
    isCreatePending: false,
    workspaceRoot: null,
    recentDirectories: [],
    forceCutConfirmLoading: false,
    groupedWorktreeItems: [],
    setIsCloseWorkspaceConfirmOpen: vi.fn(),
    setCutConfirmRow: vi.fn(),
    setForceCutConfirmRow: vi.fn(),
    setIsCreateModalOpen: vi.fn(),
    setCreateBranch: vi.fn(),
    setCreateBase: vi.fn(),
    pickDirectory: vi.fn(),
    openRecentDirectory: vi.fn(),
    refreshWorktrees: vi.fn(),
    copyBranchName: vi.fn(),
    runRestoreAction: vi.fn(),
    runCreateWorktreeAction: vi.fn(),
    runCutGrooveAction: vi.fn(),
    runForgetAllDeletedWorktreesAction: vi.fn(),
    runStopAction: vi.fn(),
    runPlayGrooveAction: vi.fn(),
    runOpenWorktreeTerminalAction: vi.fn(),
    runOpenWorkspaceTerminalAction: vi.fn(),
    closeCurrentWorkspace: vi.fn(),
    workspaceMeta: null,
    gitignoreSanity: null,
    gitignoreSanityStatusMessage: null,
    gitignoreSanityErrorMessage: null,
    isGitignoreSanityChecking: false,
    isGitignoreSanityApplyPending: false,
    applyGitignoreSanityPatch: vi.fn(),
    ...overrides,
  };
}

describe("Home component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grooveSummaryMock.mockResolvedValue({ ok: true, summaries: [] });
  });

  it("renders nothing for content area when no workspace is active", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState());
    const { default: Home } = await import("./page");
    render(<Home />);
    expect(screen.getByTestId("dashboard-modals")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-header")).toBeNull();
  });

  it("renders dashboard content when workspace is active", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [{ worktree: "alpha", branchGuess: "main", path: "/repo/.worktrees/alpha", status: "ready" }],
      groupedWorktreeItems: [{ type: "row", row: { worktree: "alpha", branchGuess: "main", path: "/repo/.worktrees/alpha", status: "ready" }, key: "row:alpha" }],
      workspaceRoot: "/repo",
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    expect(screen.getByTestId("dashboard-header")).toBeTruthy();
    expect(screen.getByTestId("worktrees-table")).toBeTruthy();
  });

  it("shows no .worktrees directory message", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: false,
      },
      hasWorktreesDirectory: false,
      worktreeRows: [],
    }));
    const { default: Home } = await import("./page");
    const { container } = render(<Home />);
    expect(container.textContent).toContain(".worktrees");
    expect(container.textContent).toContain("directory found");
  });

  it("shows empty worktrees message when directory exists but no rows", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [],
    }));
    const { default: Home } = await import("./page");
    const { container } = render(<Home />);
    expect(container.textContent).toContain(".worktrees");
    expect(container.textContent).toContain("exists");
  });

  it("shows status and error messages", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [],
      statusMessage: "All good",
      errorMessage: "Something broke",
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    expect(screen.getByText("All good")).toBeTruthy();
    expect(screen.getByText("Something broke")).toBeTruthy();
  });

  it("calls refreshWorktrees when header refresh is clicked", async () => {
    const refreshMock = vi.fn();
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
      refreshWorktrees: refreshMock,
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    fireEvent.click(screen.getByText("Refresh"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("handles summarize worktree action", async () => {
    grooveSummaryMock.mockResolvedValue({ ok: true, summaries: [{ ok: true, summary: "test" }] });
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByText("Summarize WT"));
    });
    await waitFor(() => {
      expect(grooveSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ sessionIds: ["wt-1"] }));
    });
  });

  it("handles summarize worktree failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveSummaryMock.mockResolvedValue({ ok: false, error: "Failed", summaries: [] });
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByText("Summarize WT"));
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed");
    });
  });

  it("handles summarize worktree with no successful summaries", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveSummaryMock.mockResolvedValue({ ok: true, summaries: [{ ok: false, error: "unavailable" }] });
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByText("Summarize WT"));
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
    });
  });

  it("handles summarize section", async () => {
    grooveSummaryMock.mockResolvedValue({ ok: true, summaries: [{ ok: true }] });
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByText("Summarize Section"));
    });
    await waitFor(() => {
      expect(grooveSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ sessionIds: ["wt-1", "wt-2"] }));
    });
  });

  it("handles summarize section with no successful summaries", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveSummaryMock.mockResolvedValue({ ok: true, summaries: [{ ok: false }] });
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByText("Summarize Section"));
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("No sessions had available summaries.");
    });
  });

  it("handles summarize exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveSummaryMock.mockRejectedValue(new Error("network"));
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByText("Summarize WT"));
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Summary request failed.");
    });
  });

  it("opens and closes summary viewer modal", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: {
          version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01",
          worktreeRecords: { "wt-1": { id: "wt-1", createdAt: "2026-01-01", summaries: [{ worktreeIds: ["wt-1"], createdAt: "2026-01-01", summary: "Hello" }] } },
        },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    expect(screen.queryByTestId("summary-modal")).toBeNull();
    fireEvent.click(screen.getByText("View WT Summary"));
    expect(screen.getByTestId("summary-modal")).toBeTruthy();
    fireEvent.click(screen.getByText("Close Summary"));
    expect(screen.queryByTestId("summary-modal")).toBeNull();
  });

  it("opens section summary viewer", async () => {
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: {
          version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01",
          summaries: [{ worktreeIds: ["wt-1", "wt-2"], createdAt: "2026-01-01", summary: "Section" }],
        },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      workspaceRoot: "/repo",
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    fireEvent.click(screen.getByText("View Section Summary"));
    expect(screen.getByTestId("summary-modal")).toBeTruthy();
  });

  it("calls window.confirm for forget all deleted worktrees", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const forgetMock = vi.fn();
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
      runForgetAllDeletedWorktreesAction: forgetMock,
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    fireEvent.click(screen.getByText("Forget Deleted"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(forgetMock).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("does not forget deleted worktrees when confirm is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const forgetMock = vi.fn();
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
      runForgetAllDeletedWorktreesAction: forgetMock,
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    fireEvent.click(screen.getByText("Forget Deleted"));
    expect(forgetMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("calls onCreate to open create modal", async () => {
    const setIsCreateModalOpenMock = vi.fn();
    const setCreateBranchMock = vi.fn();
    const setCreateBaseMock = vi.fn();
    useDashboardStateMock.mockReturnValue(makeDashboardState({
      activeWorkspace: {
        workspaceRoot: "/repo",
        workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        rows: [],
        hasWorktreesDirectory: true,
      },
      hasWorktreesDirectory: true,
      worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
      groupedWorktreeItems: [],
      setIsCreateModalOpen: setIsCreateModalOpenMock,
      setCreateBranch: setCreateBranchMock,
      setCreateBase: setCreateBaseMock,
    }));
    const { default: Home } = await import("./page");
    render(<Home />);
    fireEvent.click(screen.getByText("Create"));
    expect(setCreateBranchMock).toHaveBeenCalledWith("");
    expect(setCreateBaseMock).toHaveBeenCalledWith("");
    expect(setIsCreateModalOpenMock).toHaveBeenCalledWith(true);
  });

  describe("sidebar rendering via useAppLayout", () => {
    function renderWithSidebar(overrides: Record<string, unknown> = {}) {
      let capturedOptions: { pageSidebar?: (opts: { collapsed: boolean }) => React.ReactNode } = {};
      useAppLayoutMock.mockImplementation((options: { pageSidebar?: (opts: { collapsed: boolean }) => React.ReactNode }) => {
        capturedOptions = options;
      });
      useDashboardStateMock.mockReturnValue(makeDashboardState({
        activeWorkspace: {
          workspaceRoot: "/repo",
          workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          repositoryRemoteUrl: null,
          rows: [],
          hasWorktreesDirectory: true,
        },
        hasWorktreesDirectory: true,
        worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
        groupedWorktreeItems: [],
        recentDirectories: ["/old/project"],
        ...overrides,
      }));
      return { getCapturedOptions: () => capturedOptions };
    }

    it("renders sidebar with change directory button that calls pickDirectory", async () => {
      const pickDirectoryMock = vi.fn();
      const { getCapturedOptions } = renderWithSidebar({ pickDirectory: pickDirectoryMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      const sidebar = getCapturedOptions().pageSidebar?.({ collapsed: false });
      const { container } = render(<>{sidebar}</>);
      const changeBtn = container.querySelector('[aria-label="Change directory"]') as HTMLElement;
      expect(changeBtn).toBeTruthy();
      fireEvent.click(changeBtn);
      expect(pickDirectoryMock).toHaveBeenCalled();
    });

    it("renders sidebar with close directory button that opens confirm", async () => {
      const setIsCloseWorkspaceConfirmOpenMock = vi.fn();
      const { getCapturedOptions } = renderWithSidebar({ setIsCloseWorkspaceConfirmOpen: setIsCloseWorkspaceConfirmOpenMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      const sidebar = getCapturedOptions().pageSidebar?.({ collapsed: false });
      const { container } = render(<>{sidebar}</>);
      const closeBtn = container.querySelector('[aria-label="Close directory"]') as HTMLElement;
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn);
      expect(setIsCloseWorkspaceConfirmOpenMock).toHaveBeenCalledWith(true);
    });

    it("renders sidebar with open terminal button that calls runOpenWorkspaceTerminalAction", async () => {
      const runOpenWorkspaceTerminalActionMock = vi.fn();
      const { getCapturedOptions } = renderWithSidebar({ runOpenWorkspaceTerminalAction: runOpenWorkspaceTerminalActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      const sidebar = getCapturedOptions().pageSidebar?.({ collapsed: false });
      const { container } = render(<>{sidebar}</>);
      const termBtn = container.querySelector('[aria-label="Open terminal at active directory"]') as HTMLElement;
      expect(termBtn).toBeTruthy();
      fireEvent.click(termBtn);
      expect(runOpenWorkspaceTerminalActionMock).toHaveBeenCalled();
    });

    it("renders sidebar in collapsed mode", async () => {
      const { getCapturedOptions } = renderWithSidebar();
      const { default: Home } = await import("./page");
      render(<Home />);
      const sidebar = getCapturedOptions().pageSidebar?.({ collapsed: true });
      const { container } = render(<>{sidebar}</>);
      expect(container.querySelector('[aria-label="Change directory"]')).toBeTruthy();
      expect(container.querySelector('[aria-label="Close directory"]')).toBeTruthy();
    });
  });

  describe("WorktreesTable callback wrappers", () => {
    function renderDashboardWithTable(overrides: Record<string, unknown> = {}) {
      useDashboardStateMock.mockReturnValue(makeDashboardState({
        activeWorkspace: {
          workspaceRoot: "/repo",
          workspaceMeta: { version: 1, rootName: "groove", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          rows: [],
          hasWorktreesDirectory: true,
        },
        hasWorktreesDirectory: true,
        worktreeRows: [{ worktree: "a", branchGuess: "main", path: "/p", status: "ready" }],
        groupedWorktreeItems: [{ type: "row", row: { worktree: "a", branchGuess: "main", path: "/p", status: "ready" }, key: "row:a" }],
        workspaceRoot: "/repo",
        ...overrides,
      }));
    }

    it("calls copyBranchName when onCopyBranchName is triggered", async () => {
      const copyBranchNameMock = vi.fn();
      renderDashboardWithTable({ copyBranchName: copyBranchNameMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Copy Branch"));
      expect(copyBranchNameMock).toHaveBeenCalledWith(expect.objectContaining({ worktree: "alpha" }));
    });

    it("calls runRestoreAction when onRestoreAction is triggered", async () => {
      const runRestoreActionMock = vi.fn();
      renderDashboardWithTable({ runRestoreAction: runRestoreActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Restore"));
      expect(runRestoreActionMock).toHaveBeenCalledWith(expect.objectContaining({ worktree: "alpha" }));
    });

    it("calls setCutConfirmRow when onCutConfirm is triggered", async () => {
      const setCutConfirmRowMock = vi.fn();
      renderDashboardWithTable({ setCutConfirmRow: setCutConfirmRowMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Cut Confirm"));
      expect(setCutConfirmRowMock).toHaveBeenCalledWith(expect.objectContaining({ worktree: "alpha" }));
    });

    it("calls runStopAction when onStopAction is triggered", async () => {
      const runStopActionMock = vi.fn();
      renderDashboardWithTable({ runStopAction: runStopActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Stop"));
      expect(runStopActionMock).toHaveBeenCalledWith(expect.objectContaining({ worktree: "alpha" }));
    });

    it("calls runPlayGrooveAction when onPlayAction is triggered", async () => {
      const runPlayGrooveActionMock = vi.fn();
      renderDashboardWithTable({ runPlayGrooveAction: runPlayGrooveActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Play"));
      expect(runPlayGrooveActionMock).toHaveBeenCalledWith(expect.objectContaining({ worktree: "alpha" }));
    });

    it("calls runOpenWorktreeTerminalAction when onOpenTerminalAction is triggered", async () => {
      const runOpenWorktreeTerminalActionMock = vi.fn();
      renderDashboardWithTable({ runOpenWorktreeTerminalAction: runOpenWorktreeTerminalActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Open Terminal"));
      expect(runOpenWorktreeTerminalActionMock).toHaveBeenCalledWith("alpha");
    });
  });

  describe("DashboardModals callback wrappers", () => {
    function renderDashboardWithModals(overrides: Record<string, unknown> = {}) {
      useDashboardStateMock.mockReturnValue(makeDashboardState({
        activeWorkspace: null,
        ...overrides,
      }));
    }

    it("calls runCutGrooveAction when onRunCutGrooveAction is triggered", async () => {
      const runCutGrooveActionMock = vi.fn();
      renderDashboardWithModals({ runCutGrooveAction: runCutGrooveActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Modal Cut"));
      expect(runCutGrooveActionMock).toHaveBeenCalledWith(expect.objectContaining({ worktree: "alpha" }), false);
    });

    it("calls closeCurrentWorkspace when onCloseCurrentWorkspace is triggered", async () => {
      const closeCurrentWorkspaceMock = vi.fn();
      renderDashboardWithModals({ closeCurrentWorkspace: closeCurrentWorkspaceMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Modal Close Workspace"));
      expect(closeCurrentWorkspaceMock).toHaveBeenCalled();
    });

    it("calls runCreateWorktreeAction when onRunCreateWorktreeAction is triggered", async () => {
      const runCreateWorktreeActionMock = vi.fn();
      renderDashboardWithModals({ runCreateWorktreeAction: runCreateWorktreeActionMock });
      const { default: Home } = await import("./page");
      render(<Home />);
      fireEvent.click(screen.getByText("Modal Create"));
      expect(runCreateWorktreeActionMock).toHaveBeenCalledWith({ branch: "feat/x", base: "main" });
    });
  });
});
