import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { opencodeIntegrationStatusMock } = vi.hoisted(() => ({
  opencodeIntegrationStatusMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  DEFAULT_OPENCODE_SETTINGS_DIRECTORY: "~/.config/opencode",
  opencodeIntegrationStatus: opencodeIntegrationStatusMock,
  opencodeUpdateWorkspaceSettings: vi.fn(),
  opencodeUpdateGlobalSettings: vi.fn(),
  opencodeListSkills: vi.fn(),
  opencodeCopySkills: vi.fn(),
  validateOpencodeSettingsDirectory: vi.fn(),
}));

vi.mock("@/src/components/opencode/opencode-settings-modal", () => ({
  OpencodeSettingsModal: ({ open, onOpenChange, onSettingsSaved }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSettingsSaved: (message: string) => void;
  }) =>
    open ? (
      <div data-testid="settings-modal">
        <button onClick={() => onOpenChange(false)}>Close Modal</button>
        <button onClick={() => onSettingsSaved("Settings saved!")}>Save Settings</button>
      </div>
    ) : null,
}));

const { OpencodeIntegrationPanel } = await import("@/src/components/opencode/opencode-integration-panel");

function makeSuccessResponse() {
  return {
    ok: true,
    effectiveScope: "workspace" as const,
    workspaceScopeAvailable: true,
    globalScopeAvailable: true,
    workspaceSettings: {
      enabled: true,
      defaultModel: "claude-4",
      settingsDirectory: "~/.config/opencode",
    },
    globalSettings: {
      enabled: false,
      defaultModel: null,
      settingsDirectory: "~/.config/opencode",
    },
  };
}

describe("OpencodeIntegrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    opencodeIntegrationStatusMock.mockResolvedValue(makeSuccessResponse());
  });

  it("renders title and description", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    expect(screen.getByText("Opencode")).toBeInTheDocument();
    expect(
      screen.getByText("Workspace/global Opencode configuration stored in Groove settings."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(1);
    });
  });

  it("fetches status on mount", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows refresh and settings buttons", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });

  it("refreshes status when refresh button is clicked", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("shows error message when status fetch fails with error", async () => {
    opencodeIntegrationStatusMock.mockResolvedValue({
      ok: false,
      error: "Backend unreachable",
    });

    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(screen.getByText("Backend unreachable")).toBeInTheDocument();
    });
  });

  it("shows generic error message when status fetch fails without error field", async () => {
    opencodeIntegrationStatusMock.mockResolvedValue({
      ok: false,
    });

    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load Opencode status.")).toBeInTheDocument();
    });
  });

  it("shows generic error message when status fetch throws", async () => {
    opencodeIntegrationStatusMock.mockRejectedValue(new Error("Network error"));

    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load Opencode status.")).toBeInTheDocument();
    });
  });

  it("opens settings modal when settings button is clicked", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
  });

  it("closes settings modal when onOpenChange is called with false", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close Modal"));
    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
  });

  it("refreshes status and shows success message when settings are saved", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByText("Save Settings"));

    expect(screen.getByText("Settings saved!")).toBeInTheDocument();

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("clears messages when refresh button is clicked", async () => {
    opencodeIntegrationStatusMock.mockResolvedValueOnce({
      ok: false,
      error: "Some error",
    });

    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(screen.getByText("Some error")).toBeInTheDocument();
    });

    opencodeIntegrationStatusMock.mockResolvedValueOnce(makeSuccessResponse());

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.queryByText("Some error")).not.toBeInTheDocument();
    });
  });

  it("clears messages when settings button is clicked", async () => {
    opencodeIntegrationStatusMock.mockResolvedValueOnce({
      ok: false,
      error: "Some error",
    });

    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo" />);

    await waitFor(() => {
      expect(screen.getByText("Some error")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(screen.queryByText("Some error")).not.toBeInTheDocument();
  });

  it("re-fetches status when workspaceRoot changes", async () => {
    const { rerender } = render(
      <OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo-a" />,
    );

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(1);
    });

    rerender(<OpencodeIntegrationPanel title="Opencode" workspaceRoot="/repo-b" />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("handles null workspaceRoot", async () => {
    render(<OpencodeIntegrationPanel title="Opencode" workspaceRoot={null} />);

    await waitFor(() => {
      expect(opencodeIntegrationStatusMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Opencode")).toBeInTheDocument();
  });
});
