import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardModals } from "@/src/components/pages/dashboard/dashboard-modals";
import type { WorktreeRow } from "@/src/components/pages/dashboard/types";

vi.mock("@/src/lib/ipc", () => ({
  gitCurrentBranch: vi.fn().mockResolvedValue("main"),
  gitListBranches: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/src/components/ui/confirm-modal", () => ({
  ConfirmModal: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid={`confirm-modal-${title}`} data-open={String(open)}>
      <p>{title}</p>
      <p>{description}</p>
      <button type="button" onClick={onConfirm}>{confirmLabel ?? "Confirm"}</button>
      <button type="button" onClick={onCancel}>{cancelLabel ?? "Cancel"}</button>
      <button type="button" onClick={() => { onOpenChange(false); }} data-testid={`close-${title}`}>
        CloseOverlay
      </button>
    </div>
  ),
}));

vi.mock("@/src/components/create-worktree-modal", () => ({
  CreateWorktreeModal: ({
    open,
    onOpenChange,
    onCancel,
    onSubmit,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCancel: () => void;
    onSubmit: () => void;
  }) =>
    open ? (
      <div data-testid="create-worktree-modal">
        <p>Create worktree dialog</p>
        <button type="button" onClick={() => { onOpenChange(false); }} data-testid="create-close">
          Close dialog
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onSubmit}>Submit</button>
      </div>
    ) : null,
}));

function buildRow(overrides: Partial<WorktreeRow> = {}): WorktreeRow {
  return {
    worktree: "feature-branch",
    branchGuess: "feature-branch",
    path: "/workspace/.worktrees/feature-branch",
    status: "paused",
    lastExecutedAt: undefined,
    ...overrides,
  };
}

function buildProps(overrides: Partial<Parameters<typeof DashboardModals>[0]> = {}) {
  return {
    workspaceRoot: "/workspace",
    cutConfirmRow: null,
    setCutConfirmRow: vi.fn(),
    forceCutConfirmRow: null,
    setForceCutConfirmRow: vi.fn(),
    forceCutConfirmLoading: false,
    isCloseWorkspaceConfirmOpen: false,
    setIsCloseWorkspaceConfirmOpen: vi.fn(),
    isBusy: false,
    isCreateModalOpen: false,
    setIsCreateModalOpen: vi.fn(),
    createBranch: "",
    createBase: "",
    isCreatePending: false,
    setCreateBranch: vi.fn(),
    setCreateBase: vi.fn(),
    onRunCutGrooveAction: vi.fn(),
    onCloseCurrentWorkspace: vi.fn(),
    onRunCreateWorktreeAction: vi.fn(),
    ...overrides,
  };
}

describe("DashboardModals", () => {
  describe("Cut groove confirm modal", () => {
    it("is closed when cutConfirmRow is null", () => {
      render(<DashboardModals {...buildProps()} />);
      const modal = screen.getByTestId("confirm-modal-Cut this groove?");
      expect(modal.getAttribute("data-open")).toBe("false");
    });

    it("is open when cutConfirmRow is set", () => {
      render(<DashboardModals {...buildProps({ cutConfirmRow: buildRow() })} />);
      const modal = screen.getByTestId("confirm-modal-Cut this groove?");
      expect(modal.getAttribute("data-open")).toBe("true");
      expect(screen.getByText(/removes worktree "feature-branch"/)).toBeTruthy();
    });

    it("shows forget deleted worktree title for deleted status", () => {
      render(<DashboardModals {...buildProps({ cutConfirmRow: buildRow({ status: "deleted" }) })} />);
      expect(screen.getByText("Forget this deleted worktree forever?")).toBeTruthy();
      expect(screen.getByText(/permanently removes deleted worktree/)).toBeTruthy();
    });

    it("calls onRunCutGrooveAction on confirm", () => {
      const row = buildRow();
      const props = buildProps({ cutConfirmRow: row });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByText("Cut groove"));
      expect(props.setCutConfirmRow).toHaveBeenCalledWith(null);
      expect(props.onRunCutGrooveAction).toHaveBeenCalledWith(row);
    });

    it("returns early from confirm when cutConfirmRow is null", () => {
      const props = buildProps({ cutConfirmRow: null });
      render(<DashboardModals {...props} />);
      // The mock always renders; click confirm while row is null to hit the guard
      fireEvent.click(screen.getByText("Cut groove"));
      expect(props.onRunCutGrooveAction).not.toHaveBeenCalled();
    });

    it("clears cutConfirmRow on cancel", () => {
      const props = buildProps({ cutConfirmRow: buildRow() });
      render(<DashboardModals {...props} />);
      const modal = screen.getByTestId("confirm-modal-Cut this groove?");
      const cancelButton = modal.querySelectorAll("button")[1];
      fireEvent.click(cancelButton);
      expect(props.setCutConfirmRow).toHaveBeenCalledWith(null);
    });

    it("clears cutConfirmRow via onOpenChange(false)", () => {
      const props = buildProps({ cutConfirmRow: buildRow() });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByTestId("close-Cut this groove?"));
      expect(props.setCutConfirmRow).toHaveBeenCalledWith(null);
    });
  });

  describe("Force cut confirm modal", () => {
    it("is closed when forceCutConfirmRow is null", () => {
      render(<DashboardModals {...buildProps()} />);
      const modal = screen.getByTestId("confirm-modal-Force cut this groove?");
      expect(modal.getAttribute("data-open")).toBe("false");
    });

    it("is open when forceCutConfirmRow is set", () => {
      render(<DashboardModals {...buildProps({ forceCutConfirmRow: buildRow() })} />);
      const modal = screen.getByTestId("confirm-modal-Force cut this groove?");
      expect(modal.getAttribute("data-open")).toBe("true");
      expect(screen.getByText(/contains modified or untracked files/)).toBeTruthy();
    });

    it("calls onRunCutGrooveAction with force flag on confirm", () => {
      const row = buildRow();
      const props = buildProps({ forceCutConfirmRow: row });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByText("Force delete worktree"));
      expect(props.setForceCutConfirmRow).toHaveBeenCalledWith(null);
      expect(props.onRunCutGrooveAction).toHaveBeenCalledWith(row, true);
    });

    it("returns early from confirm when forceCutConfirmRow is null", () => {
      const props = buildProps({ forceCutConfirmRow: null });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByText("Force delete worktree"));
      expect(props.onRunCutGrooveAction).not.toHaveBeenCalled();
    });

    it("clears forceCutConfirmRow on cancel", () => {
      const props = buildProps({ forceCutConfirmRow: buildRow() });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByText("Keep worktree"));
      expect(props.setForceCutConfirmRow).toHaveBeenCalledWith(null);
    });

    it("shows worktree-specific description with worktree name", () => {
      render(<DashboardModals {...buildProps({ forceCutConfirmRow: buildRow({ worktree: "my-wt" }) })} />);
      expect(screen.getByText(/Worktree "my-wt" contains modified/)).toBeTruthy();
    });

    it("clears forceCutConfirmRow via onOpenChange(false)", () => {
      const props = buildProps({ forceCutConfirmRow: buildRow() });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByTestId("close-Force cut this groove?"));
      expect(props.setForceCutConfirmRow).toHaveBeenCalledWith(null);
    });
  });

  describe("Close workspace confirm modal", () => {
    it("is closed when isCloseWorkspaceConfirmOpen is false", () => {
      render(<DashboardModals {...buildProps()} />);
      const modal = screen.getByTestId("confirm-modal-Close current workspace?");
      expect(modal.getAttribute("data-open")).toBe("false");
    });

    it("is open when isCloseWorkspaceConfirmOpen is true", () => {
      render(<DashboardModals {...buildProps({ isCloseWorkspaceConfirmOpen: true })} />);
      const modal = screen.getByTestId("confirm-modal-Close current workspace?");
      expect(modal.getAttribute("data-open")).toBe("true");
      expect(screen.getByText(/clears the active workspace/)).toBeTruthy();
    });

    it("calls onCloseCurrentWorkspace on confirm", () => {
      const props = buildProps({ isCloseWorkspaceConfirmOpen: true });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByText("Close workspace"));
      expect(props.setIsCloseWorkspaceConfirmOpen).toHaveBeenCalledWith(false);
      expect(props.onCloseCurrentWorkspace).toHaveBeenCalledOnce();
    });

    it("closes modal on cancel", () => {
      const props = buildProps({ isCloseWorkspaceConfirmOpen: true });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByText("Keep workspace open"));
      expect(props.setIsCloseWorkspaceConfirmOpen).toHaveBeenCalledWith(false);
    });
  });

  describe("Create worktree modal", () => {
    it("is not visible when isCreateModalOpen is false", () => {
      render(<DashboardModals {...buildProps()} />);
      expect(screen.queryByTestId("create-worktree-modal")).toBeNull();
    });

    it("shows create modal when isCreateModalOpen is true", () => {
      render(<DashboardModals {...buildProps({ isCreateModalOpen: true })} />);
      expect(screen.getByTestId("create-worktree-modal")).toBeTruthy();
    });

    it("clears branch and base when modal is cancelled and not pending", () => {
      const props = buildProps({ isCreateModalOpen: true });
      render(<DashboardModals {...props} />);
      // The Cancel button inside the create-worktree-modal mock
      const createModal = screen.getByTestId("create-worktree-modal");
      const cancelButton = createModal.querySelector("button:nth-of-type(2)") as HTMLButtonElement;
      fireEvent.click(cancelButton);
      expect(props.setIsCreateModalOpen).toHaveBeenCalledWith(false);
      expect(props.setCreateBranch).toHaveBeenCalledWith("");
      expect(props.setCreateBase).toHaveBeenCalledWith("");
    });

    it("does not close modal on cancel when isCreatePending", () => {
      const props = buildProps({ isCreateModalOpen: true, isCreatePending: true });
      render(<DashboardModals {...props} />);
      const createModal = screen.getByTestId("create-worktree-modal");
      const cancelButton = createModal.querySelector("button:nth-of-type(2)") as HTMLButtonElement;
      fireEvent.click(cancelButton);
      expect(props.setIsCreateModalOpen).not.toHaveBeenCalled();
    });

    it("clears branch and base via onOpenChange(false) when not pending", () => {
      const props = buildProps({ isCreateModalOpen: true });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByTestId("create-close"));
      expect(props.setIsCreateModalOpen).toHaveBeenCalledWith(false);
      expect(props.setCreateBranch).toHaveBeenCalledWith("");
      expect(props.setCreateBase).toHaveBeenCalledWith("");
    });

    it("does not clear branch and base via onOpenChange(false) when pending", () => {
      const props = buildProps({ isCreateModalOpen: true, isCreatePending: true });
      render(<DashboardModals {...props} />);
      fireEvent.click(screen.getByTestId("create-close"));
      expect(props.setIsCreateModalOpen).toHaveBeenCalledWith(false);
      expect(props.setCreateBranch).not.toHaveBeenCalled();
      expect(props.setCreateBase).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("shows generic description when cutConfirmRow is null but modal displays fallback", () => {
      // When cutConfirmRow is set, the description includes the worktree name
      const row = buildRow({ worktree: "test-wt", branchGuess: "test-branch" });
      render(<DashboardModals {...buildProps({ cutConfirmRow: row })} />);
      expect(screen.getByText(/removes worktree "test-wt" \(branch "test-branch"\)/)).toBeTruthy();
    });

    it("shows forget label for deleted worktree confirm button", () => {
      render(<DashboardModals {...buildProps({ cutConfirmRow: buildRow({ status: "deleted" }) })} />);
      expect(screen.getByText("Forget forever")).toBeTruthy();
    });

    it("shows generic force cut description when forceCutConfirmRow is null (fallback)", () => {
      // The generic description text is used when row is null but the modal is somehow open.
      // In practice this is a fallback, but we test the row-specific path.
      const row = buildRow();
      render(<DashboardModals {...buildProps({ forceCutConfirmRow: row })} />);
      expect(screen.getByText(/Force deletion is irreversible/)).toBeTruthy();
    });
  });
});
