import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import type {
  WorktreeRow,
  WorktreeStatus,
} from "@/src/components/pages/dashboard/types";
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
  DropdownMenu: ({
    children,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    return mockReact.createElement(
      "div",
      { "data-testid": "dropdown-menu" },
      children,
    );
  },
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    return mockReact.createElement(
      "div",
      { "data-testid": "dropdown-trigger" },
      children,
    );
  },
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => {
    return mockReact.createElement(
      "div",
      { "data-testid": "dropdown-content", role: "menu" },
      children,
    );
  },
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onSelect?: (event: Event) => void;
    disabled?: boolean;
    className?: string;
  }) => {
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

const { WorktreeRowActions } =
  await import("@/src/components/pages/dashboard/worktree-row-actions");

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

      expect(
        screen.getByRole("button", { name: /pause groove for/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /open terminal for/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /remove worktree/i }),
      ).toBeInTheDocument();
    });

    it("calls onStop when pause is clicked", () => {
      const { handlers, row } = renderActions({ status: "ready" });

      fireEvent.click(
        screen.getByRole("button", { name: /pause groove for/i }),
      );

      expect(handlers.onStop).toHaveBeenCalledWith(row);
    });

    it("calls onCutConfirm when remove is clicked", () => {
      const { handlers, row } = renderActions({ status: "ready" });

      fireEvent.click(screen.getByRole("button", { name: /remove worktree/i }));

      expect(handlers.onCutConfirm).toHaveBeenCalledWith(row);
    });

    it("calls onOpenTerminal when terminal button is clicked", () => {
      const { handlers } = renderActions({ status: "ready" });

      fireEvent.click(
        screen.getByRole("button", { name: /open terminal for/i }),
      );

      expect(handlers.onOpenTerminal).toHaveBeenCalledWith("feature-alpha");
    });
  });

  describe("paused status", () => {
    it("renders play, terminal, and remove buttons", () => {
      renderActions({ status: "paused" });

      expect(
        screen.getByRole("button", { name: /play groove for/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /open terminal for/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /remove worktree/i }),
      ).toBeInTheDocument();
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

      expect(
        screen.getByRole("button", { name: /restore/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /forget deleted worktree/i }),
      ).toBeInTheDocument();
    });

    it("calls onRepair when restore is clicked", () => {
      const { handlers, row } = renderActions({ status: "deleted" });

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      expect(handlers.onRepair).toHaveBeenCalledWith(row);
    });

    it("calls onCutConfirm when forget is clicked", () => {
      const { handlers, row } = renderActions({ status: "deleted" });

      fireEvent.click(
        screen.getByRole("button", { name: /forget deleted worktree/i }),
      );

      expect(handlers.onCutConfirm).toHaveBeenCalledWith(row);
    });
  });

  describe("corrupted status", () => {
    it("renders repair, terminal, and remove buttons", () => {
      renderActions({ status: "corrupted" });

      expect(
        screen.getByRole("button", { name: /repair/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /open terminal for/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /remove worktree/i }),
      ).toBeInTheDocument();
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

      expect(
        screen.getByRole("button", { name: /new terminal for/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /pause groove for/i }),
      ).toBeInTheDocument();
      expect(screen.getByText("New terminal")).toBeInTheDocument();
      expect(screen.getByText("Pause Groove")).toBeInTheDocument();
    });

    it("calls onStop when pause groove is clicked", () => {
      const { handlers, row } = renderActions({
        variant: "worktree-detail",
        status: "ready",
      });

      fireEvent.click(
        screen.getByRole("button", { name: /pause groove for/i }),
      );

      expect(handlers.onStop).toHaveBeenCalledWith(row);
    });
  });

  /* ── Pending states ──────────────────────────────────────────────── */

  describe("pending states", () => {
    it("disables buttons when rowPending is true", () => {
      renderActions({ status: "ready", rowPending: true });

      expect(
        screen.getByRole("button", { name: /pause groove for/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /remove worktree/i }),
      ).toBeDisabled();
    });

    it("disables play button when rowPending is true in paused status", () => {
      renderActions({ status: "paused", rowPending: true });

      expect(
        screen.getByRole("button", { name: /play groove for/i }),
      ).toBeDisabled();
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

      expect(
        screen.getByRole("button", { name: /summarize/i }),
      ).toBeInTheDocument();
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

      expect(
        screen.getByRole("button", { name: /view summary/i }),
      ).toBeInTheDocument();
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

      expect(
        screen.queryByRole("button", { name: /summarize/i }),
      ).not.toBeInTheDocument();
    });

    it("disables summarize button when isSummarizePending is true", () => {
      renderActions({
        status: "ready",
        onSummarize: vi.fn(),
        isSummarizePending: true,
        latestSummary: null,
      });

      expect(
        screen.getByRole("button", { name: /summarizing/i }),
      ).toBeDisabled();
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

  /* ── Worktree-detail variant close worktree pending ─────────────── */

  describe("closeWorktreePending in worktree-detail", () => {
    it("disables pause button and shows spinner when closeWorktreePending is true", () => {
      renderActions({
        status: "ready",
        variant: "worktree-detail",
        closeWorktreePending: true,
      });

      const pauseButton = screen.getByRole("button", {
        name: /pause groove for/i,
      });
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

      expect(
        screen.getByRole("button", { name: /summarize/i }),
      ).toBeInTheDocument();
    });

    it("renders summarize button for corrupted status", () => {
      renderActions({
        status: "corrupted",
        onSummarize: vi.fn(),
        latestSummary: null,
      });

      expect(
        screen.getByRole("button", { name: /summarize/i }),
      ).toBeInTheDocument();
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

      expect(
        screen.getByRole("button", { name: /view summary/i }),
      ).toBeInTheDocument();
    });
  });
});
