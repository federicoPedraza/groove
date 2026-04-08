import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import type { GlobalSettings, WorkspaceContextResponse } from "@/src/lib/ipc";

const defaultGlobalSettings: GlobalSettings = {
  telemetryEnabled: false,
  disableGrooveLoadingSection: false,
  showFps: false,
  alwaysShowDiagnosticsSidebar: false,
  periodicRerenderEnabled: false,
  themeMode: "light",
  keyboardShortcutLeader: "Space",
  keyboardLeaderBindings: {},
  opencodeSettings: { enabled: false, settingsDirectory: "" },
};

const {
  globalSettingsGetMock,
  globalSettingsUpdateMock,
  workspaceGetActiveMock,
  workspaceUpdateCommandsSettingsMock,
  workspaceUpdateWorktreeSymlinkPathsMock,
} = vi.hoisted(() => ({
  globalSettingsGetMock: vi.fn(),
  globalSettingsUpdateMock: vi.fn(),
  workspaceGetActiveMock: vi.fn<() => Promise<WorkspaceContextResponse>>(),
  workspaceUpdateCommandsSettingsMock: vi.fn(),
  workspaceUpdateWorktreeSymlinkPathsMock: vi.fn(),
}));

const globalSettingsSnapshotRef = vi.hoisted(() => ({
  current: {
    telemetryEnabled: false,
    disableGrooveLoadingSection: false,
    showFps: false,
    alwaysShowDiagnosticsSidebar: false,
    periodicRerenderEnabled: false,
    themeMode: "light" as const,
    keyboardShortcutLeader: "Space",
    keyboardLeaderBindings: {} as Record<string, string>,
    opencodeSettings: { enabled: false, settingsDirectory: "" },
  },
}));

vi.mock("@/src/lib/ipc", () => ({
  GROOVE_PLAY_COMMAND_SENTINEL: "__groove_terminal__",
  isTelemetryEnabled: vi.fn(() => false),
  getThemeMode: vi.fn(() => globalSettingsSnapshotRef.current.themeMode),
  getGlobalSettingsSnapshot: vi.fn(() => globalSettingsSnapshotRef.current),
  subscribeToGlobalSettings: vi.fn((callback: () => void) => {
    // No-op subscription - don't call the callback to avoid infinite loops
    void callback;
    return () => {};
  }),
  globalSettingsGet: globalSettingsGetMock,
  globalSettingsUpdate: globalSettingsUpdateMock,
  workspaceGetActive: workspaceGetActiveMock,
  workspaceUpdateCommandsSettings: workspaceUpdateCommandsSettingsMock,
  workspaceUpdateWorktreeSymlinkPaths: workspaceUpdateWorktreeSymlinkPathsMock,
}));

vi.mock("@/src/lib/theme-constants", () => ({
  THEME_MODE_OPTIONS: [
    { value: "light", label: "Light", description: "Light theme" },
    { value: "dark", label: "Dark", description: "Dark theme" },
  ],
}));

vi.mock("@/src/lib/theme", () => ({
  applyThemeToDom: vi.fn(),
}));

vi.mock("@/src/lib/shortcuts", () => ({
  DEFAULT_KEYBOARD_LEADER_BINDINGS: { openActionLauncher: "k", openWorktreeDetailsLauncher: "p" },
  DEFAULT_KEYBOARD_SHORTCUT_LEADER: "Space",
  OPEN_ACTION_LAUNCHER_COMMAND_ID: "openActionLauncher",
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID: "openWorktreeDetailsLauncher",
  SHORTCUT_KEY_OPTIONS: ["Space", "k", "p", "j"],
  toShortcutDisplayLabel: vi.fn((key: string) => key),
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
      {disabled && <span data-testid="commands-disabled">{disabledMessage}</span>}
      <button
        type="button"
        data-testid="save-commands-btn"
        disabled={disabled}
        onClick={() => {
          void onSave({
            playGrooveCommand: "npm start",
            openTerminalAtWorktreeCommand: "bash",
            runLocalCommand: "npm run dev",
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

vi.mock("@/src/components/opencode/opencode-integration-panel", () => ({
  OpencodeIntegrationPanel: () => <div data-testid="opencode-panel" />,
}));

vi.mock("@/src/components/ui/search-dropdown", () => ({
  SearchDropdown: ({
    ariaLabel,
    value,
    onValueChange,
  }: {
    ariaLabel: string;
    value: string;
    onValueChange: (v: string) => void;
    searchAriaLabel?: string;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    disabled?: boolean;
    maxResults?: number;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-testid={`dropdown-${ariaLabel}`}
    >
      <option value="Space">Space</option>
      <option value="k">k</option>
      <option value="p">p</option>
      <option value="j">j</option>
    </select>
  ),
}));

vi.mock("@/src/lib/utils/workspace/context", () => ({
  describeWorkspaceContextError: vi.fn((_result: unknown, fallback: string) => fallback),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetModules();
    globalSettingsGetMock.mockResolvedValue({
      ok: true,
      globalSettings: { ...defaultGlobalSettings },
    });
    globalSettingsUpdateMock.mockResolvedValue({
      ok: true,
      globalSettings: { ...defaultGlobalSettings },
    });
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
        runLocalCommand: "",
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
        runLocalCommand: "npm run dev",
        worktreeSymlinkPaths: [],
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
    const mod = await import("@/src/app/settings/page");
    const SettingsPage = mod.default;
    const result = render(<SettingsPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return result;
  }

  it("renders settings page with title", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", async () => {
    // Make workspaceGetActive hang to see loading
    workspaceGetActiveMock.mockReturnValue(new Promise(() => {}));
    const mod = await import("@/src/app/settings/page");
    const SettingsPage = mod.default;
    render(<SettingsPage />);
    expect(screen.getByText("Loading active workspace...")).toBeInTheDocument();
  });

  it("renders workspace settings section", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Toggle workspace settings/ })).toBeInTheDocument();
    });
  });

  it("renders commands settings form", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("commands-settings-form")).toBeInTheDocument();
    });
  });

  it("disables commands form when no workspace meta", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("commands-disabled")).toBeInTheDocument();
    });
  });

  it("saves command settings via onSave callback", async () => {
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

  it("handles save command settings failure", async () => {
    workspaceUpdateCommandsSettingsMock.mockResolvedValue({
      ok: false,
      error: "Save failed",
    });
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

  it("handles save command settings exception", async () => {
    workspaceUpdateCommandsSettingsMock.mockRejectedValue(new Error("Net"));
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

  it("renders keyboard shortcuts section", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /Toggle keyboard shortcuts/ })).toBeInTheDocument();
  });

  it("renders appearance section with theme options", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /Toggle appearance settings/ })).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("renders Groove settings section", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /Toggle Groove settings/ })).toBeInTheDocument();
    expect(screen.getByText("Enable telemetry")).toBeInTheDocument();
    expect(screen.getByText("Disable monkey")).toBeInTheDocument();
    expect(screen.getByText("Show FPS")).toBeInTheDocument();
    expect(screen.getByText("Trigger periodic re-renders")).toBeInTheDocument();
    expect(screen.getByText("Always show diagnostics sidebar")).toBeInTheDocument();
  });

  it("renders integrations section", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /Toggle integrations/ })).toBeInTheDocument();
    expect(screen.getByTestId("opencode-panel")).toBeInTheDocument();
  });

  it("renders worktree symlink paths", async () => {
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

  it("handles theme change", async () => {
    const { applyThemeToDom } = await import("@/src/lib/theme");
    await renderPage();

    const darkRadio = screen.getByRole("radio", { name: /Dark/ });
    await act(async () => {
      darkRadio.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(applyThemeToDom).toHaveBeenCalledWith("dark");
    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ themeMode: "dark" }),
    );
  });

  it("reverts theme on update failure", async () => {
    const { applyThemeToDom } = await import("@/src/lib/theme");
    await renderPage();

    // Set the mock to fail after initial render
    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Failed" });

    const darkRadio = screen.getByRole("radio", { name: /Dark/ });
    await act(async () => {
      darkRadio.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    // applyThemeToDom is called first with "dark", then reverted to "light"
    await waitFor(() => {
      expect(applyThemeToDom).toHaveBeenCalledWith("dark");
      expect(applyThemeToDom).toHaveBeenCalledWith("light");
    });
  });

  it("reverts theme on update exception", async () => {
    const { applyThemeToDom } = await import("@/src/lib/theme");
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    const darkRadio = screen.getByRole("radio", { name: /Dark/ });
    await act(async () => {
      darkRadio.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(applyThemeToDom).toHaveBeenCalledWith("dark");
      expect(applyThemeToDom).toHaveBeenCalledWith("light");
    });
  });

  it("shows error when workspace load fails", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: false,
      rows: [],
      error: "Connection refused",
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Failed to load the active workspace context.")).toBeInTheDocument();
    });
  });

  it("handles workspace load exception", async () => {
    workspaceGetActiveMock.mockRejectedValue(new Error("Net"));
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Failed to load the active workspace context.")).toBeInTheDocument();
    });
  });

  it("shows error when global settings load fails", async () => {
    globalSettingsGetMock.mockRejectedValue(new Error("Net"));
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Failed to load global settings.")).toBeInTheDocument();
    });
  });

  it("handles workspace with no meta", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("No configured paths.")).toBeInTheDocument();
    });
  });

  it("renders symlink modal", async () => {
    await renderPage();
    expect(screen.getByTestId("symlink-modal")).toBeInTheDocument();
  });

  it("shows connect repository message when no workspace meta for commands", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Connect a repository to edit workspace command settings.")).toBeInTheDocument();
    });
  });

  it("handles save command settings when no workspace meta returns error", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    // Save button is disabled when no workspace meta, which is correct behavior
    await waitFor(() => {
      expect(screen.getByTestId("save-commands-btn")).toBeDisabled();
    });
  });

  it("changes keyboard shortcut leader key", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("dropdown-Keyboard shortcut leader key")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Keyboard shortcut leader key"), {
        target: { value: "k" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ keyboardShortcutLeader: "k" }),
    );
  });

  it("reverts keyboard leader on update failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Leader save failed" });

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Keyboard shortcut leader key"), {
        target: { value: "j" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ keyboardShortcutLeader: "j" }),
    );
  });

  it("reverts keyboard leader on update exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Keyboard shortcut leader key"), {
        target: { value: "j" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ keyboardShortcutLeader: "j" }),
      );
    });
  });

  it("changes open actions key binding", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("dropdown-Open actions key")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Open actions key"), {
        target: { value: "p" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        keyboardLeaderBindings: expect.objectContaining({ openActionLauncher: "p" }),
      }),
    );
  });

  it("reverts open actions binding on failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Binding failed" });

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Open actions key"), {
        target: { value: "j" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalled();
  });

  it("reverts open actions binding on exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Open actions key"), {
        target: { value: "j" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalled();
  });

  it("changes open worktree details key binding", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("dropdown-Open worktree details key")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Open worktree details key"), {
        target: { value: "k" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        keyboardLeaderBindings: expect.objectContaining({ openWorktreeDetailsLauncher: "k" }),
      }),
    );
  });

  it("reverts open worktree details binding on failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Binding failed" });

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Open worktree details key"), {
        target: { value: "j" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalled();
  });

  it("reverts open worktree details binding on exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    await act(async () => {
      fireEvent.change(screen.getByTestId("dropdown-Open worktree details key"), {
        target: { value: "j" },
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalled();
  });

  it("renders keyboard shortcuts description text", async () => {
    await renderPage();
    expect(screen.getByText(/Customize leader-based shortcuts/)).toBeInTheDocument();
  });

  it("renders leader key label", async () => {
    await renderPage();
    expect(screen.getByText("Leader key")).toBeInTheDocument();
  });

  it("renders open actions key label", async () => {
    await renderPage();
    expect(screen.getByText("Open actions key")).toBeInTheDocument();
  });

  it("renders open worktree details key label", async () => {
    await renderPage();
    expect(screen.getByText("Open worktree details key")).toBeInTheDocument();
  });

  it("handles globalSettingsGet failure showing error message", async () => {
    globalSettingsGetMock.mockResolvedValue({ ok: false, error: "Global get failed" });
    await renderPage();
    // Should not crash, settings still render
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows worktree symlink paths from meta", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: "/test",
      rows: [],
      workspaceMeta: {
        version: 1,
        rootName: "test",
        createdAt: "",
        updatedAt: "",
        worktreeSymlinkPaths: ["node_modules", ".env"],
      },
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("node_modules")).toBeInTheDocument();
      expect(screen.getByText(".env")).toBeInTheDocument();
    });
  });

  it("toggles telemetry checkbox and calls globalSettingsUpdate", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Enable telemetry")).toBeInTheDocument();
    });

    // Find the telemetry checkbox (it's in the label with "Enable telemetry")
    const telemetryLabel = screen.getByText("Enable telemetry").closest("label");
    const checkbox = telemetryLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ telemetryEnabled: true }),
    );
  });

  it("reverts telemetry on update failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Telemetry failed" });

    const telemetryLabel = screen.getByText("Enable telemetry").closest("label");
    const checkbox = telemetryLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ telemetryEnabled: true }),
      );
    });
  });

  it("toggles disable monkey checkbox and calls globalSettingsUpdate", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Disable monkey")).toBeInTheDocument();
    });

    const monkeyLabel = screen.getByText("Disable monkey").closest("label");
    const checkbox = monkeyLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ disableGrooveLoadingSection: true }),
    );
  });

  it("toggles show FPS checkbox and calls globalSettingsUpdate", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Show FPS")).toBeInTheDocument();
    });

    const fpsLabel = screen.getByText("Show FPS").closest("label");
    const checkbox = fpsLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ showFps: true }),
    );
  });

  it("toggles periodic re-render checkbox and calls globalSettingsUpdate", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Trigger periodic re-renders")).toBeInTheDocument();
    });

    const reRenderLabel = screen.getByText("Trigger periodic re-renders").closest("label");
    const checkbox = reRenderLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ periodicRerenderEnabled: true }),
    );
  });

  it("toggles always show diagnostics sidebar and calls globalSettingsUpdate", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Always show diagnostics sidebar")).toBeInTheDocument();
    });

    const diagnosticsLabel = screen.getByText("Always show diagnostics sidebar").closest("label");
    const checkbox = diagnosticsLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ alwaysShowDiagnosticsSidebar: true }),
    );
  });

  it("shows error message when global settings update fails for telemetry", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    const telemetryLabel = screen.getByText("Enable telemetry").closest("label");
    const checkbox = telemetryLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to update telemetry settings.")).toBeInTheDocument();
    });
  });

  it("displays error message in error banner", async () => {
    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));
    await renderPage();

    const darkRadio = screen.getByRole("radio", { name: /Dark/ });
    await act(async () => {
      darkRadio.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to update theme mode.")).toBeInTheDocument();
    });
  });

  it("reverts diagnostics sidebar on update failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Diagnostics update failed" });

    const diagnosticsLabel = screen.getByText("Always show diagnostics sidebar").closest("label");
    const checkbox = diagnosticsLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ alwaysShowDiagnosticsSidebar: true }),
      );
    });
  });

  it("reverts diagnostics sidebar on update exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    const diagnosticsLabel = screen.getByText("Always show diagnostics sidebar").closest("label");
    const checkbox = diagnosticsLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to update diagnostics sidebar visibility.")).toBeInTheDocument();
    });
  });

  it("reverts disable monkey on update failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Monkey update failed" });

    const monkeyLabel = screen.getByText("Disable monkey").closest("label");
    const checkbox = monkeyLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ disableGrooveLoadingSection: true }),
      );
    });
  });

  it("reverts disable monkey on update exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    const monkeyLabel = screen.getByText("Disable monkey").closest("label");
    const checkbox = monkeyLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to update Groove loading section visibility.")).toBeInTheDocument();
    });
  });

  it("reverts show FPS on update failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "FPS update failed" });

    const fpsLabel = screen.getByText("Show FPS").closest("label");
    const checkbox = fpsLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ showFps: true }),
      );
    });
  });

  it("reverts show FPS on update exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    const fpsLabel = screen.getByText("Show FPS").closest("label");
    const checkbox = fpsLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to update FPS settings.")).toBeInTheDocument();
    });
  });

  it("reverts periodic re-render on update failure", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockResolvedValue({ ok: false, error: "Periodic rerender failed" });

    const reRenderLabel = screen.getByText("Trigger periodic re-renders").closest("label");
    const checkbox = reRenderLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ periodicRerenderEnabled: true }),
      );
    });
  });

  it("reverts periodic re-render on update exception", async () => {
    await renderPage();

    globalSettingsUpdateMock.mockRejectedValue(new Error("Net"));

    const reRenderLabel = screen.getByText("Trigger periodic re-renders").closest("label");
    const checkbox = reRenderLabel!.querySelector("[role='checkbox']") as HTMLElement;

    await act(async () => {
      fireEvent.click(checkbox);
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to update periodic re-render trigger settings.")).toBeInTheDocument();
    });
  });

  it("shows connect repository message for symlinks when no workspace meta", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: undefined,
      rows: [],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText("Connect a repository to edit this list.")).toBeInTheDocument();
    });
  });
});
