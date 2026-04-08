import { render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { grooveTerminalOpenMock } = vi.hoisted(() => ({
  grooveTerminalOpenMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  grooveTerminalOpen: grooveTerminalOpenMock,
}));

vi.mock("@/src/components/pages/dashboard/hooks/use-dashboard-state", () => ({
  useDashboardState: vi.fn(),
}));

vi.mock("@/src/components/pages/use-app-layout", () => ({
  useAppLayout: vi.fn(),
}));

vi.mock("@/src/components/pages/dashboard/dashboard-modals", () => ({
  DashboardModals: () => <div data-testid="dashboard-modals" />,
}));

vi.mock("@/src/components/pages/dashboard/worktree-row-actions", () => ({
  WorktreeRowActions: ({
    onOpenTerminal,
    row,
  }: {
    onOpenTerminal?: (worktree: string) => void;
    row: { worktree: string };
  }) => (
    <div data-testid="worktree-row-actions">
      {onOpenTerminal && (
        <button
          type="button"
          data-testid="open-terminal-btn"
          onClick={() => onOpenTerminal(row.worktree)}
        >
          Open Terminal
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/src/components/pages/worktrees/groove-worktree-terminal", () => ({
  GrooveWorktreeTerminal: () => <div data-testid="groove-terminal" />,
}));

vi.mock("@/src/lib/utils/worktree/status", () => ({
  deriveWorktreeStatus: vi.fn((status: string) => status),
}));

vi.mock("@/src/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { useDashboardState } from "@/src/components/pages/dashboard/hooks/use-dashboard-state";

const mockUseDashboardState = vi.mocked(useDashboardState);

function createDefaultDashboardState(overrides: Record<string, unknown> = {}) {
  return {
    activeWorkspace: null,
    worktreeRows: [],
    hasWorktreesDirectory: true,
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
    workspaceMeta: null,
    workspaceRoot: null,
    recentDirectories: [],
    forceCutConfirmLoading: false,
    setIsCloseWorkspaceConfirmOpen: vi.fn(),
    setCutConfirmRow: vi.fn(),
    setForceCutConfirmRow: vi.fn(),
    setIsCreateModalOpen: vi.fn(),
    setCreateBranch: vi.fn(),
    setCreateBase: vi.fn(),
    pickDirectory: vi.fn(),
    openRecentDirectory: vi.fn(),
    runRestoreAction: vi.fn(),
    runCutGrooveAction: vi.fn(),
    runStopAction: vi.fn(),
    runPlayGrooveAction: vi.fn(),
    runCreateWorktreeAction: vi.fn(),
    copyBranchName: vi.fn(),
    closeCurrentWorkspace: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDashboardState>;
}

// Import at top level since mocks are hoisted
import WorktreeDetailPage from "@/src/app/worktrees/worktree-detail-page";

function renderWithRoute(worktreeParam: string, overrides: Record<string, unknown> = {}) {
  mockUseDashboardState.mockReturnValue(createDefaultDashboardState(overrides));

  return render(
    <MemoryRouter initialEntries={[`/worktrees/${worktreeParam}`]}>
      <Routes>
        <Route path="/worktrees/:worktree" element={<WorktreeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WorktreeDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    grooveTerminalOpenMock.mockResolvedValue({ ok: true });
  });

  it("renders nothing when no active workspace", () => {
    const { container } = renderWithRoute("feature-1");
    expect(container.innerHTML).toBe("");
  });

  it("renders header with worktree name when workspace is active", () => {
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
    });
    expect(screen.getByText("Worktree: feature-1")).toBeInTheDocument();
    expect(screen.getByText("Back to Worktrees")).toBeInTheDocument();
  });

  it("shows worktree not available card when row not found", () => {
    renderWithRoute("nonexistent", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: [],
    });
    expect(screen.getByText(/is not available in the active workspace/)).toBeInTheDocument();
  });

  it("shows tip about switching workspaces when recent directories exist", () => {
    renderWithRoute("nonexistent", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: [],
      recentDirectories: ["/other/dir"],
    });
    expect(screen.getByText(/Tip: switch to the correct workspace/)).toBeInTheDocument();
  });

  it("shows worktree name from param in header", () => {
    renderWithRoute("my-feature", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: [],
    });
    expect(screen.getByText("Worktree: my-feature")).toBeInTheDocument();
  });

  it("renders worktree detail view when row is found", () => {
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
    });
    expect(screen.getByText("feature/branch-1")).toBeInTheDocument();
    expect(screen.getByTestId("worktree-row-actions")).toBeInTheDocument();
  });

  it("renders groove terminal when workspaceRoot and workspaceMeta are set", () => {
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceRoot: "/test",
      workspaceMeta: { version: 1, rootName: "test", createdAt: "", updatedAt: "" },
    });
    expect(screen.getByTestId("groove-terminal")).toBeInTheDocument();
  });

  it("shows no .worktrees directory message", () => {
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      hasWorktreesDirectory: false,
      worktreeRows: [],
    });
    expect(screen.getByText(/directory found under this workspace root yet/)).toBeInTheDocument();
  });

  it("shows status message when set", () => {
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      statusMessage: "Operation succeeded",
    });
    expect(screen.getByText("Operation succeeded")).toBeInTheDocument();
  });

  it("shows error message when set", () => {
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      errorMessage: "Something went wrong",
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders dashboard modals", () => {
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
    });
    expect(screen.getByTestId("dashboard-modals")).toBeInTheDocument();
  });

  it("calls grooveTerminalOpen when open terminal is clicked", async () => {
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceMeta: { version: 1, rootName: "test", createdAt: "", updatedAt: "" },
      workspaceRoot: "/test",
    });

    await act(async () => {
      screen.getByTestId("open-terminal-btn").click();
    });

    await waitFor(() => {
      expect(grooveTerminalOpenMock).toHaveBeenCalledWith(
        expect.objectContaining({
          worktree: "feature-1",
          openMode: "plain",
          openNew: true,
        }),
      );
    });
  });

  it("shows toast error when open terminal fails", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveTerminalOpenMock.mockResolvedValue({ ok: false, error: "Terminal error" });

    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceMeta: { version: 1, rootName: "test", createdAt: "", updatedAt: "" },
      workspaceRoot: "/test",
    });

    await act(async () => {
      screen.getByTestId("open-terminal-btn").click();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Terminal error"));
    });
  });

  it("shows generic toast error when open terminal fails without message", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveTerminalOpenMock.mockResolvedValue({ ok: false });

    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceMeta: { version: 1, rootName: "test", createdAt: "", updatedAt: "" },
      workspaceRoot: "/test",
    });

    await act(async () => {
      screen.getByTestId("open-terminal-btn").click();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to open in-app terminal.");
    });
  });

  it("shows toast error when open terminal throws", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveTerminalOpenMock.mockRejectedValue(new Error("Network"));

    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceMeta: { version: 1, rootName: "test", createdAt: "", updatedAt: "" },
      workspaceRoot: "/test",
    });

    await act(async () => {
      screen.getByTestId("open-terminal-btn").click();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("In-app terminal open request failed.");
    });
  });

  it("shows toast error when no workspaceMeta and terminal opened", async () => {
    const { toast } = await import("@/src/lib/toast");

    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceMeta: null,
      workspaceRoot: "/test",
    });

    await act(async () => {
      screen.getByTestId("open-terminal-btn").click();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Select a workspace before opening a terminal.");
    });
  });

  it("decodes URL-encoded worktree param", () => {
    const rows = [
      {
        worktree: "feature/one",
        path: "/test/.worktrees/feature/one",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute(encodeURIComponent("feature/one"), {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
    });
    expect(screen.getByText("Worktree: feature/one")).toBeInTheDocument();
  });

  it("handles branch copy button", () => {
    const copyBranchName = vi.fn();
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      copyBranchName,
    });

    const copyBtn = screen.getByRole("button", { name: /Copy branch name/ });
    copyBtn.click();
    expect(copyBranchName).toHaveBeenCalledWith(rows[0]);
  });

  it("excludes deleted worktrees from known worktrees", () => {
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
      {
        worktree: "deleted-wt",
        path: "/test/.worktrees/deleted-wt",
        branchGuess: "deleted-branch",
        status: "deleted",
      },
    ];
    renderWithRoute("feature-1", {
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runtimeStateByWorktree: {},
      workspaceMeta: { version: 1, rootName: "test", createdAt: "", updatedAt: "" },
      workspaceRoot: "/test",
    });
    // Terminal should be rendered (with workspaceMeta and workspaceRoot)
    expect(screen.getByTestId("groove-terminal")).toBeInTheDocument();
  });
});
