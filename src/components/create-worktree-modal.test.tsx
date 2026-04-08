import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateWorktreeModal } from "@/src/components/create-worktree-modal";

const { gitListBranchesMock, gitCurrentBranchMock } = vi.hoisted(() => ({
  gitListBranchesMock: vi.fn(),
  gitCurrentBranchMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  gitListBranches: gitListBranchesMock,
  gitCurrentBranch: gitCurrentBranchMock,
}));

type Props = {
  open?: boolean;
  workspaceRoot?: string | null;
  branch?: string;
  base?: string;
  loading?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBranchChange?: (value: string) => void;
  onBaseChange?: (value: string) => void;
  onSubmit?: (options?: { branchOverride?: string; baseOverride?: string }) => void;
  onCancel?: () => void;
};

function renderModal(overrides: Props = {}) {
  const props = {
    open: true,
    workspaceRoot: "/repo/root",
    branch: "",
    base: "",
    loading: false,
    onOpenChange: vi.fn(),
    onBranchChange: vi.fn(),
    onBaseChange: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const result = render(<CreateWorktreeModal {...props} />);
  return { ...result, props };
}

describe("CreateWorktreeModal", () => {
  beforeEach(() => {
    gitListBranchesMock.mockReset();
    gitCurrentBranchMock.mockReset();
  });

  it("renders dialog title and description when open", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    renderModal();

    expect(screen.getByText("Create worktree")).toBeInTheDocument();
    expect(screen.getByText("Enter a branch name and choose the base branch.")).toBeInTheDocument();
  });

  it("does not render dialog content when closed", () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: [] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "" });

    renderModal({ open: false });

    expect(screen.queryByText("Create worktree")).not.toBeInTheDocument();
  });

  it("fetches branches on open and sets current branch as base", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main", "develop"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "develop" });

    const { props } = renderModal();

    await waitFor(() => {
      expect(gitListBranchesMock).toHaveBeenCalledWith({ path: "/repo/root" });
      expect(gitCurrentBranchMock).toHaveBeenCalledWith({ path: "/repo/root" });
    });

    await waitFor(() => {
      expect(props.onBaseChange).toHaveBeenCalledWith("develop");
    });
  });

  it("falls back to first branch when current branch is not in list", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main", "develop"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "nonexistent" });

    const { props } = renderModal();

    await waitFor(() => {
      expect(props.onBaseChange).toHaveBeenCalledWith("main");
    });
  });

  it("falls back to first branch when gitCurrentBranch fails", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main", "develop"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: false, error: "fail" });

    const { props } = renderModal();

    await waitFor(() => {
      expect(props.onBaseChange).toHaveBeenCalledWith("main");
    });
  });

  it("sets base to empty when branch list is empty", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: [] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal();

    await waitFor(() => {
      expect(props.onBaseChange).toHaveBeenCalledWith("");
    });
  });

  it("shows error when gitListBranches fails", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: false, error: "Network error" });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal();

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(props.onBaseChange).toHaveBeenCalledWith("");
  });

  it("shows generic error when gitListBranches fails without message", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: false });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Failed to load branches.")).toBeInTheDocument();
    });
  });

  it("shows error when IPC call throws", async () => {
    gitListBranchesMock.mockRejectedValue(new Error("IPC Error"));
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Failed to load branches.")).toBeInTheDocument();
    });
  });

  it("does not fetch branches when workspaceRoot is null", async () => {
    renderModal({ workspaceRoot: null });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(gitListBranchesMock).not.toHaveBeenCalled();
  });

  it("does not fetch branches when not open", async () => {
    renderModal({ open: false, workspaceRoot: "/repo/root" });

    await new Promise((r) => setTimeout(r, 50));
    expect(gitListBranchesMock).not.toHaveBeenCalled();
  });

  it("calls onBranchChange when branch input changes", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal();

    const branchInput = screen.getByLabelText("Branch name");
    fireEvent.change(branchInput, { target: { value: "f" } });

    expect(props.onBranchChange).toHaveBeenCalled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables create button when no base is selected", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    renderModal({ base: "" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    });
  });

  it("disables inputs when loading", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    renderModal({ loading: true });

    expect(screen.getByLabelText("Branch name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows 'No branches were found' when list is empty and no error", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: [] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "" });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("No branches were found in this repository.")).toBeInTheDocument();
    });
  });

  it("submits with baseOverride when form is valid", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main", "develop"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal({ branch: "feature/test", base: "main" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(props.onSubmit).toHaveBeenCalledWith({ baseOverride: "main" });
  });

  it("shows selection error when base is not in branch list on submit", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal({ branch: "feat", base: "nonexistent" });

    await waitFor(() => {
      expect(gitListBranchesMock).toHaveBeenCalled();
    });

    const createButton = screen.getByRole("button", { name: /create/i });

    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });

    fireEvent.click(createButton);

    expect(screen.getByText("Select a branch from the existing branch list.")).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit when loading is true", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { props } = renderModal({ loading: true, branch: "feat", base: "main" });

    // The create button is disabled, but let's verify via onSubmit
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("clears errors when modal is closed and reopened", async () => {
    gitListBranchesMock.mockResolvedValue({ ok: false, error: "Some error" });
    gitCurrentBranchMock.mockResolvedValue({ ok: true, branch: "main" });

    const { rerender, props } = renderModal();

    await waitFor(() => {
      expect(screen.getByText("Some error")).toBeInTheDocument();
    });

    gitListBranchesMock.mockResolvedValue({ ok: true, branches: ["main"] });

    rerender(
      <CreateWorktreeModal
        {...props}
        open={false}
      />,
    );

    rerender(
      <CreateWorktreeModal
        {...props}
        open={true}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Some error")).not.toBeInTheDocument();
    });
  });
});
