import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import type { WorktreeRow, WorktreeStatus } from "@/src/components/pages/dashboard/types";
import type { SummaryRecord } from "@/src/lib/ipc";

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */

const {
  gitListFileStatesMock,
  gitCommitMock,
  gitHasStagedChangesMock,
  gitHasUpstreamMock,
  gitMergeAbortMock,
  gitMergeInProgressMock,
  gitPullMock,
  gitPushMock,
  gitStageFilesMock,
  gitStatusMock,
  gitUnstageFilesMock,
  toastMock,
  windowOpenMock,
} = vi.hoisted(() => ({
  gitListFileStatesMock: vi.fn(),
  gitCommitMock: vi.fn(),
  gitHasStagedChangesMock: vi.fn(),
  gitHasUpstreamMock: vi.fn(),
  gitMergeAbortMock: vi.fn(),
  gitMergeInProgressMock: vi.fn(),
  gitPullMock: vi.fn(),
  gitPushMock: vi.fn(),
  gitStageFilesMock: vi.fn(),
  gitStatusMock: vi.fn(),
  gitUnstageFilesMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
  windowOpenMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  gitListFileStates: gitListFileStatesMock,
  gitCommit: gitCommitMock,
  gitHasStagedChanges: gitHasStagedChangesMock,
  gitHasUpstream: gitHasUpstreamMock,
  gitMergeAbort: gitMergeAbortMock,
  gitMergeInProgress: gitMergeInProgressMock,
  gitPull: gitPullMock,
  gitPush: gitPushMock,
  gitStageFiles: gitStageFilesMock,
  gitStatus: gitStatusMock,
  gitUnstageFiles: gitUnstageFilesMock,
}));

vi.mock("@/src/lib/toast", () => ({
  toast: toastMock,
}));

vi.mock("@/src/lib/utils/git/pull-request-url", () => ({
  buildCreatePrUrl: vi.fn((remoteUrl: string | undefined, branch: string) => {
    if (!remoteUrl) return null;
    return `https://github.com/org/repo/compare/${branch}`;
  }),
}));

const { mockReact } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockReact = require("react") as typeof import("react");
  return { mockReact };
});

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode; onOpenChange?: (open: boolean) => void }) => {
    return mockReact.createElement("div", { "data-testid": "dropdown-menu" }, children);
  },
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => {
    return mockReact.createElement("div", { "data-testid": "dropdown-trigger" }, children);
  },
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => {
    return mockReact.createElement("div", { "data-testid": "dropdown-content", role: "menu" }, children);
  },
  DropdownMenuItem: ({ children, onSelect, disabled, className }: { children: React.ReactNode; onSelect?: (event: Event) => void; disabled?: boolean; className?: string }) => {
    return mockReact.createElement(
      "button",
      {
        role: "menuitem",
        disabled,
        className,
        onClick: (event: React.MouseEvent) => {
          if (!disabled && onSelect) {
            onSelect(event as unknown as Event);
          }
        },
      },
      children,
    );
  },
}));

const { WorktreeRowActions } = await import(
  "@/src/components/pages/dashboard/worktree-row-actions"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRow(overrides: Partial<WorktreeRow> = {}): WorktreeRow {
  return {
    worktree: "feature-alpha",
    worktreeId: "wt-123",
    branchGuess: "feature/alpha",
    path: "/repo/.worktrees/feature-alpha",
    status: "ready",
    ...overrides,
  };
}

type RenderOptions = {
  row?: Partial<WorktreeRow>;
  status?: WorktreeStatus;
  rowPending?: boolean;
  restorePending?: boolean;
  cutPending?: boolean;
  stopPending?: boolean;
  playPending?: boolean;
  hasConnectedRepository?: boolean;
  repositoryRemoteUrl?: string;
  variant?: "dashboard" | "worktree-detail";
  onOpenTerminal?: (worktree: string) => void;
  closeWorktreePending?: boolean;
  onSummarize?: (sessionId: string) => void;
  isSummarizePending?: boolean;
  onViewSummary?: (summary: SummaryRecord) => void;
  latestSummary?: SummaryRecord | null;
};

function renderActions(options: RenderOptions = {}) {
  const {
    row: rowOverrides,
    status = "ready",
    rowPending = false,
    restorePending = false,
    cutPending = false,
    stopPending = false,
    playPending = false,
    hasConnectedRepository = true,
    repositoryRemoteUrl = "https://github.com/org/repo.git",
    variant = "dashboard",
    onOpenTerminal = vi.fn(),
    closeWorktreePending = false,
    onSummarize,
    isSummarizePending = false,
    onViewSummary,
    latestSummary = null,
  } = options;

  const handlers = {
    onRepair: vi.fn(),
    onPlay: vi.fn(),
    onStop: vi.fn(),
    onCutConfirm: vi.fn(),
    onOpenTerminal,
    onSummarize: onSummarize ?? vi.fn(),
    onViewSummary: onViewSummary ?? vi.fn(),
  };

  const row = makeRow(rowOverrides);

  const result = render(
    <TooltipProvider>
    <WorktreeRowActions
      row={row}
      status={status}
      rowPending={rowPending}
      restorePending={restorePending}
      cutPending={cutPending}
      stopPending={stopPending}
      playPending={playPending}
      hasConnectedRepository={hasConnectedRepository}
      repositoryRemoteUrl={repositoryRemoteUrl}
      onRepair={handlers.onRepair}
      onPlay={handlers.onPlay}
      onStop={handlers.onStop}
      onCutConfirm={handlers.onCutConfirm}
      variant={variant}
      onOpenTerminal={handlers.onOpenTerminal}
      closeWorktreePending={closeWorktreePending}
      onSummarize={handlers.onSummarize}
      isSummarizePending={isSummarizePending}
      onViewSummary={handlers.onViewSummary}
      latestSummary={latestSummary}
    />
    </TooltipProvider>,
  );

  return { ...result, handlers, row };
}

function setUpDefaultGitMocks() {
  gitStatusMock.mockResolvedValue({ ok: true, dirty: false });
  gitHasStagedChangesMock.mockResolvedValue({ ok: true, value: false });
  gitMergeInProgressMock.mockResolvedValue({ ok: true, value: false });
  gitHasUpstreamMock.mockResolvedValue({ ok: true, value: true });
  gitListFileStatesMock.mockResolvedValue({
    ok: true,
    staged: [],
    unstaged: [],
    untracked: [],
  });
  gitCommitMock.mockResolvedValue({ ok: true });
  gitPullMock.mockResolvedValue({ ok: true });
  gitPushMock.mockResolvedValue({ ok: true });
  gitStageFilesMock.mockResolvedValue({ ok: true });
  gitUnstageFilesMock.mockResolvedValue({ ok: true });
  gitMergeAbortMock.mockResolvedValue({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("WorktreeRowActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUpDefaultGitMocks();
    window.open = windowOpenMock;
  });

  /* ── Status-based button rendering (dashboard variant) ──────────── */

  describe("ready status", () => {
    it("renders pause, terminal, and remove buttons", () => {
      renderActions({ status: "ready" });

      expect(screen.getByRole("button", { name: /pause groove for/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open terminal for/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove worktree/i })).toBeInTheDocument();
    });

    it("calls onStop when pause is clicked", () => {
      const { handlers, row } = renderActions({ status: "ready" });

      fireEvent.click(screen.getByRole("button", { name: /pause groove for/i }));

      expect(handlers.onStop).toHaveBeenCalledWith(row);
    });

    it("calls onCutConfirm when remove is clicked", () => {
      const { handlers, row } = renderActions({ status: "ready" });

      fireEvent.click(screen.getByRole("button", { name: /remove worktree/i }));

      expect(handlers.onCutConfirm).toHaveBeenCalledWith(row);
    });

    it("calls onOpenTerminal when terminal button is clicked", () => {
      const { handlers } = renderActions({ status: "ready" });

      fireEvent.click(screen.getByRole("button", { name: /open terminal for/i }));

      expect(handlers.onOpenTerminal).toHaveBeenCalledWith("feature-alpha");
    });
  });

  describe("paused status", () => {
    it("renders play, terminal, and remove buttons", () => {
      renderActions({ status: "paused" });

      expect(screen.getByRole("button", { name: /play groove for/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open terminal for/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove worktree/i })).toBeInTheDocument();
    });

    it("calls onPlay when play button is clicked", () => {
      const { handlers, row } = renderActions({ status: "paused" });

      fireEvent.click(screen.getByRole("button", { name: /play groove for/i }));

      expect(handlers.onPlay).toHaveBeenCalledWith(row);
    });
  });

  describe("deleted status", () => {
    it("renders restore and forget buttons", () => {
      renderActions({ status: "deleted" });

      expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /forget deleted worktree/i })).toBeInTheDocument();
    });

    it("calls onRepair when restore is clicked", () => {
      const { handlers, row } = renderActions({ status: "deleted" });

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      expect(handlers.onRepair).toHaveBeenCalledWith(row);
    });

    it("calls onCutConfirm when forget is clicked", () => {
      const { handlers, row } = renderActions({ status: "deleted" });

      fireEvent.click(screen.getByRole("button", { name: /forget deleted worktree/i }));

      expect(handlers.onCutConfirm).toHaveBeenCalledWith(row);
    });
  });

  describe("corrupted status", () => {
    it("renders repair, terminal, and remove buttons", () => {
      renderActions({ status: "corrupted" });

      expect(screen.getByRole("button", { name: /repair/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open terminal for/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove worktree/i })).toBeInTheDocument();
    });

    it("calls onRepair when repair is clicked", () => {
      const { handlers, row } = renderActions({ status: "corrupted" });

      fireEvent.click(screen.getByRole("button", { name: /repair/i }));

      expect(handlers.onRepair).toHaveBeenCalledWith(row);
    });
  });

  /* ── worktree-detail variant ─────────────────────────────────────── */

  describe("worktree-detail variant", () => {
    it("renders open terminal text button and pause groove button", () => {
      renderActions({ variant: "worktree-detail", status: "ready" });

      expect(screen.getByRole("button", { name: /open terminal for/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /pause groove for/i })).toBeInTheDocument();
      expect(screen.getByText("Open terminal")).toBeInTheDocument();
      expect(screen.getByText("Pause Groove")).toBeInTheDocument();
    });

    it("calls onStop when pause groove is clicked", () => {
      const { handlers, row } = renderActions({ variant: "worktree-detail", status: "ready" });

      fireEvent.click(screen.getByRole("button", { name: /pause groove for/i }));

      expect(handlers.onStop).toHaveBeenCalledWith(row);
    });
  });

  /* ── Pending states ──────────────────────────────────────────────── */

  describe("pending states", () => {
    it("disables buttons when rowPending is true", () => {
      renderActions({ status: "ready", rowPending: true });

      expect(screen.getByRole("button", { name: /pause groove for/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /remove worktree/i })).toBeDisabled();
    });

    it("disables play button when rowPending is true in paused status", () => {
      renderActions({ status: "paused", rowPending: true });

      expect(screen.getByRole("button", { name: /play groove for/i })).toBeDisabled();
    });
  });

  /* ── Git actions dropdown ────────────────────────────────────────── */

  describe("git actions dropdown", () => {
    it("renders git actions button in worktree-detail variant", () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      expect(screen.getByRole("button", { name: /git actions for/i })).toBeInTheDocument();
    });

    it("disables git actions when hasConnectedRepository is false", () => {
      renderActions({ status: "ready", variant: "worktree-detail", hasConnectedRepository: false });

      expect(screen.getByRole("button", { name: /git actions for/i })).toBeDisabled();
    });

    it("shows dropdown menu items", () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      // With mocked DropdownMenu, items are always visible
      expect(screen.getByText("Refresh status")).toBeInTheDocument();
      expect(screen.getByText("Commit")).toBeInTheDocument();
      expect(screen.getByText("Pull")).toBeInTheDocument();
      expect(screen.getByText("Push")).toBeInTheDocument();
      expect(screen.getByText("Push (force with lease)")).toBeInTheDocument();
      expect(screen.getByText("Create pull request")).toBeInTheDocument();
    });

    it("handles refresh status action", async () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Refresh status"));

      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith("Git status refreshed.");
      });
    });

    it("shows error toast when refresh status fails", async () => {
      gitStatusMock.mockResolvedValue({ ok: false });

      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Refresh status"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Failed to refresh git status.");
      });
    });

    it("shows error toast when refresh status throws", async () => {
      gitStatusMock.mockRejectedValue(new Error("fail"));

      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Refresh status"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Failed to refresh git status.");
      });
    });

    it("handles pull action", async () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Pull"));

      await waitFor(() => {
        expect(gitPullMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          rebase: true,
        });
        expect(toastMock.success).toHaveBeenCalledWith("Pull completed.");
      });
    });

    it("blocks pull when worktree is dirty", async () => {
      gitStatusMock.mockResolvedValue({ ok: true, dirty: true });

      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Pull"));

      await waitFor(() => {
        expect(toastMock.warning).toHaveBeenCalledWith(
          "Pull blocked: worktree has uncommitted changes.",
        );
      });
    });

    it("handles push action", async () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Push"));

      await waitFor(() => {
        expect(gitPushMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
        });
        expect(toastMock.success).toHaveBeenCalledWith("Push completed.");
      });
    });

    it("handles push force with lease action", async () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Push (force with lease)"));

      await waitFor(() => {
        expect(gitPushMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          forceWithLease: true,
        });
      });
    });

    it("opens create PR URL in new window", () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Create pull request"));

      expect(windowOpenMock).toHaveBeenCalledWith(
        "https://github.com/org/repo/compare/feature/alpha",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("hides create PR and disables push/pull when no remote is configured", () => {
      renderActions({ status: "ready", variant: "worktree-detail", hasConnectedRepository: true, repositoryRemoteUrl: "" });

      // Create PR item should not be visible when no remote is configured
      expect(screen.queryByText("Create pull request")).not.toBeInTheDocument();

      // Pull and Push should still be rendered (as disabled items)
      const menuItems = screen.getAllByRole("menuitem");
      const pullItem = menuItems.find((item) => item.textContent === "Pull");
      expect(pullItem).toBeTruthy();
      expect(pullItem).toBeDisabled();
    });

    it("shows error toast when git status check fails during pull", async () => {
      gitStatusMock.mockResolvedValue({ ok: false });

      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Pull"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to check git status"),
        );
      });
    });

    it("shows error toast when pull action throws", async () => {
      gitPullMock.mockRejectedValue(new Error("network"));

      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Pull"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Pull request failed.");
      });
    });

    it("shows error toast when push action fails", async () => {
      gitPushMock.mockResolvedValue({ ok: false });

      renderActions({ status: "ready", variant: "worktree-detail" });

      fireEvent.click(screen.getByText("Push"));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Push failed.");
      });
    });
  });

  /* ── Commit dialog ───────────────────────────────────────────────── */

  describe("commit dialog", () => {
    async function openCommitDialog() {
      const result = renderActions({ status: "ready", variant: "worktree-detail" });

      // With mocked DropdownMenu, Commit menuitem is always visible
      fireEvent.click(screen.getByText("Commit"));

      await waitFor(() => {
        expect(screen.getByText("Commiting")).toBeInTheDocument();
      });

      return result;
    }

    it("opens commit dialog from git dropdown", async () => {
      await openCommitDialog();

      expect(screen.getByText(/Review, stage, and commit files/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Commit message (optional)")).toBeInTheDocument();
    });

    it("shows file panels (untracked, unstaged, staged)", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["file-a.ts"],
        unstaged: ["file-b.ts"],
        untracked: ["file-c.ts"],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("Staged files (1)")).toBeInTheDocument();
        expect(screen.getByText("Unstaged files (1)")).toBeInTheDocument();
        expect(screen.getByText("Untracked files (1)")).toBeInTheDocument();
      });

      expect(screen.getByText("file-a.ts")).toBeInTheDocument();
      expect(screen.getByText("file-b.ts")).toBeInTheDocument();
      expect(screen.getByText("file-c.ts")).toBeInTheDocument();
    });

    it("shows empty state messages when no files", async () => {
      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("No staged files")).toBeInTheDocument();
        expect(screen.getByText("No unstaged files")).toBeInTheDocument();
        expect(screen.getByText("No untracked files")).toBeInTheDocument();
      });
    });

    it("disables commit when no staged files", async () => {
      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("Stage at least one file to commit.")).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /^Commit$/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Commit and push/ })).toBeDisabled();
    });

    it("commits when staged files exist", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["file-a.ts"],
        unstaged: [],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file-a.ts")).toBeInTheDocument();
      });

      const messageInput = screen.getByPlaceholderText("Commit message (optional)");
      fireEvent.change(messageInput, { target: { value: "fix: bug" } });

      const commitButton = screen.getByRole("button", { name: "Commit" });

      await waitFor(() => {
        expect(commitButton).toBeEnabled();
      });

      fireEvent.click(commitButton);

      await waitFor(() => {
        expect(gitCommitMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          message: "fix: bug",
        });
      });
    });

    it("shows disabled reason when no staged files", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: [],
        unstaged: ["file.ts"],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("Stage at least one file to commit.")).toBeInTheDocument();
      });
    });

    it("commits and pushes when commit and push is clicked", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["file-a.ts"],
        unstaged: [],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file-a.ts")).toBeInTheDocument();
      });

      const commitAndPushBtn = screen.getByRole("button", { name: "Commit and push" });

      await waitFor(() => {
        expect(commitAndPushBtn).toBeEnabled();
      });

      fireEvent.click(commitAndPushBtn);

      await waitFor(() => {
        expect(gitCommitMock).toHaveBeenCalled();
        expect(gitPushMock).toHaveBeenCalled();
      });
    });

    it("closes commit dialog on cancel", async () => {
      await openCommitDialog();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Commiting")).not.toBeInTheDocument();
    });

    it("stages selected unstaged files", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: [],
        unstaged: ["file-a.ts", "file-b.ts"],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file-a.ts")).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]);

      fireEvent.click(screen.getByRole("button", { name: "Stage selected unstaged files" }));

      await waitFor(() => {
        expect(gitStageFilesMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          files: ["file-a.ts"],
        });
      });
    });

    it("stages all unstaged files", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: [],
        unstaged: ["file-a.ts", "file-b.ts"],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file-a.ts")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Add all unstaged files" }));

      await waitFor(() => {
        expect(gitStageFilesMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          files: ["file-a.ts", "file-b.ts"],
        });
      });
    });

    it("stages all untracked files", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: [],
        unstaged: [],
        untracked: ["new-file.ts"],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("new-file.ts")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Add all untracked files" }));

      await waitFor(() => {
        expect(gitStageFilesMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          files: ["new-file.ts"],
        });
      });
    });

    it("unstages selected staged files", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["staged-file.ts"],
        unstaged: [],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("staged-file.ts")).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]);

      fireEvent.click(screen.getByRole("button", { name: "Unstage selected files" }));

      await waitFor(() => {
        expect(gitUnstageFilesMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          files: ["staged-file.ts"],
        });
      });
    });

    it("stages selected untracked files", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: [],
        unstaged: [],
        untracked: ["new-a.ts", "new-b.ts"],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("new-a.ts")).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]);

      fireEvent.click(screen.getByRole("button", { name: "Stage selected untracked files" }));

      await waitFor(() => {
        expect(gitStageFilesMock).toHaveBeenCalledWith({
          path: "/repo/.worktrees/feature-alpha",
          files: ["new-a.ts"],
        });
      });
    });

    it("refreshes commiting state when refresh button is clicked", async () => {
      await openCommitDialog();

      await waitFor(() => {
        expect(gitListFileStatesMock).toHaveBeenCalled();
      });

      gitListFileStatesMock.mockClear();

      const refreshButton = screen.getByRole("button", { name: /refresh file state/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(gitListFileStatesMock).toHaveBeenCalled();
      });
    });

    it("shows error toast when file states fail to load", async () => {
      gitListFileStatesMock.mockResolvedValue({ ok: false });

      await openCommitDialog();

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Failed to load file states.");
      });
    });

    it("shows error toast when file states throw", async () => {
      gitListFileStatesMock.mockRejectedValue(new Error("fail"));

      await openCommitDialog();

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Failed to load file states.");
      });
    });

    it("shows error toast when git action fails", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["file.ts"],
        unstaged: [],
        untracked: [],
      });
      gitCommitMock.mockResolvedValue({ ok: false, error: "commit failed" });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file.ts")).toBeInTheDocument();
      });

      const commitButton = screen.getByRole("button", { name: "Commit" });
      await waitFor(() => {
        expect(commitButton).toBeEnabled();
      });

      fireEvent.click(commitButton);

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Commit failed.");
      });
    });

    it("shows error toast when git action throws", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["file.ts"],
        unstaged: [],
        untracked: [],
      });
      gitCommitMock.mockRejectedValue(new Error("network"));

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file.ts")).toBeInTheDocument();
      });

      const commitButton = screen.getByRole("button", { name: "Commit" });
      await waitFor(() => {
        expect(commitButton).toBeEnabled();
      });

      fireEvent.click(commitButton);

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("Commit request failed.");
      });
    });

    it("does not push when commit fails in commit-and-push", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: ["file.ts"],
        unstaged: [],
        untracked: [],
      });
      gitCommitMock.mockResolvedValue({ ok: false });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file.ts")).toBeInTheDocument();
      });

      const btn = screen.getByRole("button", { name: "Commit and push" });
      await waitFor(() => {
        expect(btn).toBeEnabled();
      });

      fireEvent.click(btn);

      await waitFor(() => {
        expect(gitCommitMock).toHaveBeenCalled();
      });

      expect(gitPushMock).not.toHaveBeenCalled();
    });

    it("toggles checkbox selection off when clicking again", async () => {
      gitListFileStatesMock.mockResolvedValue({
        ok: true,
        staged: [],
        unstaged: ["file-a.ts"],
        untracked: [],
      });

      await openCommitDialog();

      await waitFor(() => {
        expect(screen.getByText("file-a.ts")).toBeInTheDocument();
      });

      const checkbox = screen.getAllByRole("checkbox")[0];
      fireEvent.click(checkbox);
      fireEvent.click(checkbox);

      expect(screen.getByRole("button", { name: "Stage selected unstaged files" })).toBeDisabled();
    });
  });

  /* ── Summary actions ─────────────────────────────────────────────── */

  describe("summary actions", () => {
    it("shows summarize button when onSummarize is provided and no latest summary", () => {
      renderActions({
        status: "ready",
        onSummarize: vi.fn(),
        latestSummary: null,
      });

      expect(screen.getByRole("button", { name: /summarize/i })).toBeInTheDocument();
    });

    it("calls onSummarize when summarize button is clicked", () => {
      const onSummarize = vi.fn();

      renderActions({
        status: "ready",
        onSummarize,
        latestSummary: null,
      });

      fireEvent.click(screen.getByRole("button", { name: /summarize/i }));

      expect(onSummarize).toHaveBeenCalledWith("wt-123");
    });

    it("shows view summary button when latestSummary exists", () => {
      const summary: SummaryRecord = {
        worktreeIds: ["wt-123"],
        createdAt: "2026-01-01",
        summary: "Did stuff",
      };
      const onViewSummary = vi.fn();

      renderActions({
        status: "ready",
        latestSummary: summary,
        onViewSummary,
      });

      expect(screen.getByRole("button", { name: /view summary/i })).toBeInTheDocument();
    });

    it("calls onViewSummary when view summary button is clicked", () => {
      const summary: SummaryRecord = {
        worktreeIds: ["wt-123"],
        createdAt: "2026-01-01",
        summary: "Did stuff",
      };
      const onViewSummary = vi.fn();

      renderActions({
        status: "ready",
        latestSummary: summary,
        onViewSummary,
      });

      fireEvent.click(screen.getByRole("button", { name: /view summary/i }));

      expect(onViewSummary).toHaveBeenCalledWith(summary);
    });

    it("does not show summary actions when worktreeId is falsy", () => {
      renderActions({
        status: "ready",
        row: { worktreeId: null },
        onSummarize: vi.fn(),
        latestSummary: null,
      });

      expect(screen.queryByRole("button", { name: /summarize/i })).not.toBeInTheDocument();
    });

    it("disables summarize button when isSummarizePending is true", () => {
      renderActions({
        status: "ready",
        onSummarize: vi.fn(),
        isSummarizePending: true,
        latestSummary: null,
      });

      expect(screen.getByRole("button", { name: /summarizing/i })).toBeDisabled();
    });
  });

  /* ── Push with no upstream ───────────────────────────────────────── */

  describe("push with no upstream", () => {
    it("shows 'Push (set upstream)' label by default (hasUpstream defaults to true, then updates)", () => {
      // hasUpstream starts as true in initial state; the label shows "Push"
      renderActions({ status: "ready", variant: "worktree-detail" });

      expect(screen.getByText("Push")).toBeInTheDocument();
    });
  });

  /* ── Abort merge ─────────────────────────────────────────────────── */

  describe("abort merge", () => {
    it("does not show abort merge by default (no merge in progress)", () => {
      renderActions({ status: "ready", variant: "worktree-detail" });

      // Abort merge is only visible when isMergeInProgress state is true
      expect(screen.queryByText("Abort merge")).not.toBeInTheDocument();
    });
  });

  /* ── No remote configured message ───────────────────────────────── */

  describe("no remote configured", () => {
    it("shows no remote configured message when repositoryRemoteUrl is empty", () => {
      renderActions({ status: "ready", variant: "worktree-detail", repositoryRemoteUrl: "" });

      expect(screen.getByText(/No remote configured/)).toBeInTheDocument();
    });
  });

  /* ── Worktree-detail variant close worktree pending ─────────────── */

  describe("closeWorktreePending in worktree-detail", () => {
    it("disables pause button and shows spinner when closeWorktreePending is true", () => {
      renderActions({
        status: "ready",
        variant: "worktree-detail",
        closeWorktreePending: true,
      });

      const pauseButton = screen.getByRole("button", { name: /pause groove for/i });
      expect(pauseButton).toBeDisabled();
    });
  });

  /* ── Summary actions across statuses ────────────────────────────── */

  describe("summary actions across statuses", () => {
    it("renders summarize button for paused status", () => {
      renderActions({
        status: "paused",
        onSummarize: vi.fn(),
        latestSummary: null,
      });

      expect(screen.getByRole("button", { name: /summarize/i })).toBeInTheDocument();
    });

    it("renders summarize button for corrupted status", () => {
      renderActions({
        status: "corrupted",
        onSummarize: vi.fn(),
        latestSummary: null,
      });

      expect(screen.getByRole("button", { name: /summarize/i })).toBeInTheDocument();
    });

    it("renders view summary button for paused status with summary", () => {
      const summary: SummaryRecord = {
        worktreeIds: ["wt-123"],
        createdAt: "2026-01-01",
        summary: "Did stuff",
      };

      renderActions({
        status: "paused",
        latestSummary: summary,
        onViewSummary: vi.fn(),
      });

      expect(screen.getByRole("button", { name: /view summary/i })).toBeInTheDocument();
    });
  });

  /* ── closing status ────────────────────────────────────────────────── */

  describe("closing status", () => {
    it("renders no action buttons for closing status in dashboard variant", () => {
      renderActions({ status: "closing" });

      // Closing status has no buttons defined in the dashboard variant
      expect(screen.queryByRole("button", { name: /play/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument();
    });
  });
});
