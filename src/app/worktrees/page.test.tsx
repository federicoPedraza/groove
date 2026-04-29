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
  getActiveWorktreeRows: vi.fn(
    (
      rows: Array<{ status: string }>,
      runtimeState: Record<string, unknown>,
    ) => {
      return rows.filter(
        (row) => row.status === "active" || runtimeState[row.status],
      );
    },
  ),
}));

vi.mock("@/src/lib/utils/mascots", () => ({
  getWorktreeMascotAssignment: vi.fn(() => ({
    mascot: {},
    color: {
      id: "emerald",
      hex: "#10b981",
      borderClassName: {
        light: "border-emerald-700/45",
        dark: "dark:border-emerald-300/55",
      },
      textClassName: {
        light: "text-emerald-700",
        dark: "dark:text-emerald-300",
      },
    },
  })),
  getMascotBorderClassNames: vi.fn(
    () => "border-emerald-700/45 dark:border-emerald-300/55",
  ),
}));

vi.mock("@/src/components/pages/worktrees/groove-worktree-terminal", () => ({
  GrooveWorktreeTerminal: vi.fn(() => (
    <div data-testid="groove-worktree-terminal" />
  )),
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
    activeTerminalWorktrees: new Set(),
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
    mockUseDashboardState.mockReturnValue(
      createDefaultDashboardState(overrides),
    );
    mockGetActiveWorktreeRows.mockReturnValue(
      (overrides.runnableRows ?? []) as ReturnType<
        typeof getActiveWorktreeRows
      >,
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
    expect(container.innerHTML).toBe("");
  });

  it("shows empty state when no runnable rows", async () => {
    await renderPage({
      activeWorkspace: { workspaceRoot: "/test" },
    });
    expect(
      screen.getByText("There are no worktrees running at the moment."),
    ).toBeInTheDocument();
  });

  it("renders worktree names and branch info for runnable rows", async () => {
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
    expect(screen.getByText("feature/branch-1")).toBeInTheDocument();
    expect(screen.getByText("feature/branch-2")).toBeInTheDocument();
  });

  it("renders detail links for each worktree", async () => {
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
    const link = screen.getByLabelText("Open details for feature-1");
    expect(link.closest("a")).toHaveAttribute("href", "/worktrees/feature-1");
  });

  it("renders terminal component when workspace context is available", async () => {
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
      workspaceRoot: "/test",
      workspaceMeta: {
        rootName: "test",
        version: 1,
        createdAt: "",
        updatedAt: "",
      },
    });
    expect(screen.getByTestId("groove-worktree-terminal")).toBeInTheDocument();
  });
});
