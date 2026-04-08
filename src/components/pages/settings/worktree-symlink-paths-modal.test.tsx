import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorktreeSymlinkPathsModal } from "@/src/components/pages/settings/worktree-symlink-paths-modal";

const { workspaceListSymlinkEntriesMock } = vi.hoisted(() => ({
  workspaceListSymlinkEntriesMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  workspaceListSymlinkEntries: workspaceListSymlinkEntriesMock,
}));

describe("WorktreeSymlinkPathsModal", () => {
  let onApply: ReturnType<typeof vi.fn>;
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onApply = vi.fn().mockResolvedValue(undefined);
    onOpenChange = vi.fn();
    workspaceListSymlinkEntriesMock.mockResolvedValue({
      ok: true,
      entries: [
        { name: "src", path: "src", isDir: true },
        { name: "package.json", path: "package.json", isDir: false },
        { name: ".worktrees", path: ".worktrees", isDir: true },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderModal(overrides: Partial<Parameters<typeof WorktreeSymlinkPathsModal>[0]> = {}) {
    return render(
      <WorktreeSymlinkPathsModal
        open={true}
        workspaceRoot="/home/user/repo"
        selectedPaths={[]}
        savePending={false}
        onApply={onApply}
        onOpenChange={onOpenChange}
        {...overrides}
      />,
    );
  }

  it("renders the dialog title and description", () => {
    renderModal();

    expect(screen.getByText("Edit worktree symlink paths")).toBeInTheDocument();
    expect(screen.getByText(/Browse repository entries/)).toBeInTheDocument();
  });

  it("renders workspace root in footer", () => {
    renderModal();

    expect(screen.getByText("Workspace: /home/user/repo")).toBeInTheDocument();
  });

  it("shows No active workspace when workspaceRoot is null", () => {
    renderModal({ workspaceRoot: null });

    expect(screen.getByText("No active workspace")).toBeInTheDocument();
  });

  it("loads and displays entries from the API", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });
    expect(screen.getByText("package.json")).toBeInTheDocument();
  });

  it("shows loading state while fetching entries", () => {
    workspaceListSymlinkEntriesMock.mockReturnValue(new Promise(() => {}));
    renderModal();

    expect(screen.getByText("Loading entries...")).toBeInTheDocument();
  });

  it("shows error when API returns not ok", async () => {
    workspaceListSymlinkEntriesMock.mockResolvedValue({
      ok: false,
      error: "Permission denied",
      entries: [],
    });
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("shows default error when API returns not ok without error message", async () => {
    workspaceListSymlinkEntriesMock.mockResolvedValue({
      ok: false,
      entries: [],
    });
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Failed to browse workspace entries.")).toBeInTheDocument();
    });
  });

  it("shows error when API call throws", async () => {
    workspaceListSymlinkEntriesMock.mockRejectedValue(new Error("Network error"));
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Failed to browse workspace entries.")).toBeInTheDocument();
    });
  });

  it("adds an entry to draft paths on add button click", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /add package\.json/i });
    fireEvent.click(addButton);

    expect(screen.queryByText("No paths selected.")).not.toBeInTheDocument();
  });

  it("removes a path from draft paths on remove button click", async () => {
    renderModal({ selectedPaths: ["package.json"] });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remove package\.json/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /remove package\.json/i }));

    expect(screen.getByText("No paths selected.")).toBeInTheDocument();
  });

  it("shows No paths selected when draft paths is empty", () => {
    renderModal({ selectedPaths: [] });

    expect(screen.getByText("No paths selected.")).toBeInTheDocument();
  });

  it("navigates into a directory on click", async () => {
    workspaceListSymlinkEntriesMock
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "src", path: "src", isDir: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "index.ts", path: "src/index.ts", isDir: false }],
      });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });
  });

  it("navigates up when Up button is clicked", async () => {
    workspaceListSymlinkEntriesMock
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "src", path: "src", isDir: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "index.ts", path: "src/index.ts", isDir: false }],
      })
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "src", path: "src", isDir: true }],
      });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /up/i }));

    await waitFor(() => {
      expect(workspaceListSymlinkEntriesMock).toHaveBeenCalledTimes(3);
    });
  });

  it("disables add button for restricted .worktrees paths", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText(".worktrees")).toBeInTheDocument();
    });

    const addWorktreesButton = screen.getByRole("button", { name: /add \.worktrees/i });
    expect(addWorktreesButton).toBeDisabled();
  });

  it("calls onApply with draft paths when Apply button is clicked", async () => {
    renderModal({ selectedPaths: ["package.json"] });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply change/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /apply change/i }));

    expect(onApply).toHaveBeenCalledWith(["package.json"]);
  });

  it("shows validation error when trying to apply with restricted paths", async () => {
    renderModal({ selectedPaths: [".worktrees/test"] });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply change/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /apply change/i }));

    expect(screen.getByText("Restricted paths like .worktrees cannot be saved.")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("calls onOpenChange with false when Discard button is clicked", () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Apply and Discard buttons when savePending is true", () => {
    renderModal({ savePending: true });

    expect(screen.getByRole("button", { name: /apply change/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled();
  });

  it("shows empty directory message when no entries exist", async () => {
    workspaceListSymlinkEntriesMock.mockResolvedValue({
      ok: true,
      entries: [],
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("This directory is empty.")).toBeInTheDocument();
    });
  });

  it("filters entries based on search input", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search entries");
    fireEvent.change(searchInput, { target: { value: "package" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.queryByText("src")).not.toBeInTheDocument();
    });
    expect(screen.getByText("package.json")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows no matching entries message when search has no results", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search entries");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText("No matching entries.")).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("handles unmount during pending API call without errors", async () => {
    let rejectFn: (err: Error) => void = () => {};
    workspaceListSymlinkEntriesMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFn = reject;
      }),
    );

    const { unmount } = renderModal();

    expect(screen.getByText("Loading entries...")).toBeInTheDocument();

    // Unmount while fetch is pending (triggers cancelled guard)
    unmount();

    // Reject after unmount to exercise the catch cancelled branch
    rejectFn(new Error("aborted"));

    // If no errors thrown, the test passes
  });

  it("does not render content when closed", () => {
    renderModal({ open: false });

    expect(screen.queryByText("Edit worktree symlink paths")).not.toBeInTheDocument();
  });

  it("highlights already-selected entries in the browse table", async () => {
    renderModal({ selectedPaths: ["package.json"] });

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /add package\.json/i });
    expect(addButton).toBeDisabled();
  });

  it("sorts selected paths alphabetically", async () => {
    renderModal({ selectedPaths: ["z-file", "a-file", "m-file"] });

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    const paths = removeButtons.map((btn) => {
      const label = btn.getAttribute("aria-label") || btn.querySelector(".sr-only")?.textContent || "";
      return label;
    });

    expect(paths).toEqual(["Remove a-file", "Remove m-file", "Remove z-file"]);
  });

  it("handles parentPathOf for root path correctly", async () => {
    workspaceListSymlinkEntriesMock
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "src", path: "src", isDir: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "lib", path: "src/lib", isDir: true }],
      })
      .mockResolvedValueOnce({
        ok: true,
        entries: [{ name: "src", path: "src", isDir: true }],
      });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("lib")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /up/i }));

    await waitFor(() => {
      expect(workspaceListSymlinkEntriesMock).toHaveBeenCalledTimes(3);
    });

    // When browsePath is "" it is sent as null
    const thirdCall = workspaceListSymlinkEntriesMock.mock.calls[2];
    expect(thirdCall[0]).toEqual({ relativePath: null });
  });
});
