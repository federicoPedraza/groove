import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import type { WorkspaceContextResponse } from "@/src/lib/ipc";

const {
  workspaceGetActiveMock,
  workspaceUpdateCommandsSettingsMock,
  workspaceUpdateRootDirectoryMock,
  workspaceUpdateWorktreeSymlinkPathsMock,
} = vi.hoisted(() => ({
  workspaceGetActiveMock: vi.fn<() => Promise<WorkspaceContextResponse>>(),
  workspaceUpdateCommandsSettingsMock: vi.fn(),
  workspaceUpdateRootDirectoryMock: vi.fn(),
  workspaceUpdateWorktreeSymlinkPathsMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  GROOVE_PLAY_COMMAND_SENTINEL: "__groove_terminal__",
  workspaceGetActive: workspaceGetActiveMock,
  workspaceUpdateCommandsSettings: workspaceUpdateCommandsSettingsMock,
  workspaceUpdateRootDirectory: workspaceUpdateRootDirectoryMock,
  workspaceUpdateWorktreeSymlinkPaths: workspaceUpdateWorktreeSymlinkPathsMock,
}));

vi.mock("@/src/lib/utils/workspace/context", () => ({
  describeWorkspaceContextError: vi.fn(
    (_result: unknown, fallback: string) => fallback,
  ),
}));

vi.mock("@/src/components/pages/settings/commands-settings-form", () => ({
  CommandsSettingsForm: ({
    disabled,
    disabledMessage,
    onSave,
  }: {
    disabled?: boolean;
    disabledMessage?: string;
    onSave: (payload: Record<string, string>) => Promise<{ ok: boolean }>;
  }) => (
    <div data-testid="commands-settings-form">
      {disabled && (
        <span data-testid="commands-disabled">{disabledMessage}</span>
      )}
      <button
        type="button"
        data-testid="save-commands-btn"
        disabled={disabled}
        onClick={() => {
          void onSave({
            playGrooveCommand: "npm start",
            openTerminalAtWorktreeCommand: "bash",
          });
        }}
      >
        Save
      </button>
    </div>
  ),
}));

vi.mock("@/src/components/pages/settings/worktree-symlink-paths-modal", () => ({
  WorktreeSymlinkPathsModal: () => <div data-testid="symlink-modal" />,
}));

vi.mock("@/src/components/pages/intelligence/doctrine-section", () => ({
  DoctrineSection: () => <div data-testid="doctrine-section" />,
}));

vi.mock("@/src/components/pages/intelligence/doctrine-table", () => ({
  DoctrineTable: () => <div data-testid="doctrine-table" />,
}));

describe("WorkspaceSettingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetModules();
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: "/test/workspace",
      rows: [],
      workspaceMeta: {
        version: 1,
        rootName: "test",
        createdAt: "",
        updatedAt: "",
        playGrooveCommand: "__groove_terminal__",
        openTerminalAtWorktreeCommand: "",
        worktreeSymlinkPaths: ["node_modules"],
      },
    });
    workspaceUpdateCommandsSettingsMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "test",
        createdAt: "",
        updatedAt: "",
        playGrooveCommand: "npm start",
        openTerminalAtWorktreeCommand: "bash",
        worktreeSymlinkPaths: [],
      },
    });
    workspaceUpdateRootDirectoryMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "test",
        createdAt: "",
        updatedAt: "",
        rootDirectory: "apps/next",
      },
    });
    workspaceUpdateWorktreeSymlinkPathsMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "test",
        createdAt: "",
        updatedAt: "",
        worktreeSymlinkPaths: ["node_modules", ".env"],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderPage() {
    const mod = await import("@/src/app/workspace/settings/page");
    const WorkspaceSettingsPage = mod.default;
    const result = render(<WorkspaceSettingsPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return result;
  }

  it("renders the workspace settings section", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Worktrees Directory")).toBeInTheDocument();
    });
    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("Worktree symlinked paths")).toBeInTheDocument();
  });

  it("renders the doctrines within the workspace settings page", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("doctrine-section")).toBeInTheDocument();
    });
    expect(screen.getByTestId("doctrine-table")).toBeInTheDocument();
  });

  it("renders the commands settings form", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("commands-settings-form")).toBeInTheDocument();
    });
  });

  it("renders worktree symlink paths from meta", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("node_modules")).toBeInTheDocument();
    });
  });

  it("shows no configured paths when empty", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: "/test",
      rows: [],
      workspaceMeta: {
        version: 1,
        rootName: "test",
        createdAt: "",
        updatedAt: "",
        worktreeSymlinkPaths: [],
      },
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("No configured paths.")).toBeInTheDocument();
    });
  });

  it("renders the symlink modal", async () => {
    await renderPage();
    expect(screen.getByTestId("symlink-modal")).toBeInTheDocument();
  });

  it("saves command settings via the onSave callback", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("save-commands-btn")).not.toBeDisabled();
    });

    await act(async () => {
      screen.getByTestId("save-commands-btn").click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(workspaceUpdateCommandsSettingsMock).toHaveBeenCalled();
  });

  it("disables the commands form when there is no workspace meta", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("commands-disabled")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Connect a repository to edit workspace command settings.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the connect-repository hint for symlinks when no workspace meta", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Connect a repository to edit this list."),
      ).toBeInTheDocument();
    });
  });

  it("saves the scope directory", async () => {
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("path/to/subdirectory"),
      ).toBeInTheDocument();
    });

    const saveButton = screen
      .getAllByRole("button", { name: "Save" })
      .find((button) => button.getAttribute("data-testid") !== "save-commands-btn");
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(workspaceUpdateRootDirectoryMock).toHaveBeenCalled();
  });

  it("shows an error when the workspace context fails to load", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: false,
      rows: [],
      error: "Connection refused",
    });
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("Failed to load the active workspace context."),
      ).toBeInTheDocument();
    });
  });
});
