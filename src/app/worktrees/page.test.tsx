import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/src/components/pages/dashboard/hooks/use-dashboard-state", () => ({
  useDashboardState: vi.fn(),
}));

vi.mock("@/src/components/pages/use-app-layout", () => ({
  useAppLayout: vi.fn(),
}));

vi.mock("@/src/lib/utils/worktree/status", () => ({
  deriveWorktreeStatus: vi.fn((status: string, runtime: unknown) => {
    if (runtime) return "running";
    return status === "active" ? "ready" : status;
  }),
  getActiveWorktreeRows: vi.fn((rows: Array<{ status: string }>, runtimeState: Record<string, unknown>) => {
    return rows.filter(
      (row) => row.status === "active" || runtimeState[row.status],
    );
  }),
}));

vi.mock("@/src/components/pages/dashboard/worktree-status", () => ({
  getWorktreeStatusBadgeClasses: vi.fn(() => ""),
  getWorktreeStatusIcon: vi.fn(() => null),
  getWorktreeStatusTitle: vi.fn(() => ""),
}));

import { useDashboardState } from "@/src/components/pages/dashboard/hooks/use-dashboard-state";
import { getActiveWorktreeRows } from "@/src/lib/utils/worktree/status";

const mockUseDashboardState = vi.mocked(useDashboardState);
const mockGetActiveWorktreeRows = vi.mocked(getActiveWorktreeRows);

function createDefaultDashboardState(overrides: Record<string, unknown> = {}) {
  return {
    activeWorkspace: null,
    worktreeRows: [],
    hasWorktreesDirectory: null,
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
    gitignoreSanity: null,
    gitignoreSanityStatusMessage: null,
    gitignoreSanityErrorMessage: null,
    isGitignoreSanityChecking: false,
    isGitignoreSanityApplyPending: false,
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
    applyGitignoreSanityPatch: vi.fn(),
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
    ...overrides,
  } as unknown as ReturnType<typeof useDashboardState>;
}

describe("WorktreesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function renderPage(overrides: Record<string, unknown> = {}) {
    mockUseDashboardState.mockReturnValue(createDefaultDashboardState(overrides));
    mockGetActiveWorktreeRows.mockReturnValue(
      (overrides.runnableRows ?? []) as ReturnType<typeof getActiveWorktreeRows>,
    );

    const mod = await import("@/src/app/worktrees/page");
    const WorktreesPage = mod.default;
    return render(
      <MemoryRouter>
        <WorktreesPage />
      </MemoryRouter>,
    );
  }

  it("renders nothing when no active workspace", async () => {
    const { container } = await renderPage();
    // The page renders an empty fragment
    expect(container.innerHTML).toBe("");
  });

  it("renders worktrees header when workspace is active", async () => {
    await renderPage({
      activeWorkspace: { workspaceRoot: "/test" },
    });
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(screen.getByText(/Ready or running worktrees/)).toBeInTheDocument();
  });

  it("shows empty state when no runnable rows", async () => {
    await renderPage({
      activeWorkspace: { workspaceRoot: "/test" },
    });
    expect(screen.getByText("There are no worktrees running at the moment.")).toBeInTheDocument();
  });

  it("renders worktree cards for runnable rows", async () => {
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
      {
        worktree: "feature-2",
        path: "/test/.worktrees/feature-2",
        branchGuess: "feature/branch-2",
        status: "active",
      },
    ];
    await renderPage({
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runnableRows: rows,
    });
    expect(screen.getByText("feature-1")).toBeInTheDocument();
    expect(screen.getByText("feature-2")).toBeInTheDocument();
    expect(screen.getByText("Branch: feature/branch-1")).toBeInTheDocument();
    expect(screen.getByText("Branch: feature/branch-2")).toBeInTheDocument();
  });

  it("renders Open details links for worktree cards", async () => {
    const rows = [
      {
        worktree: "feature-1",
        path: "/test/.worktrees/feature-1",
        branchGuess: "feature/branch-1",
        status: "active",
      },
    ];
    await renderPage({
      activeWorkspace: { workspaceRoot: "/test" },
      worktreeRows: rows,
      runnableRows: rows,
    });
    const link = screen.getByText("Open details");
    expect(link.closest("a")).toHaveAttribute("href", "/worktrees/feature-1");
  });
});
