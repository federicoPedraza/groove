import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KeyboardShortcutsContext } from "@/src/components/shortcuts/shortcut-registry-context";
import type { GlobalSettings, WorkspaceContextResponse } from "@/src/lib/ipc";
import {
  DEFAULT_KEYBOARD_SHORTCUT_LEADER,
  OPEN_ACTION_LAUNCHER_COMMAND_ID,
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
} from "@/src/lib/shortcuts";
import { KeyboardShortcutsProvider } from "@/src/components/shortcuts/keyboard-shortcuts-provider";
import { useShortcutRegistration } from "@/src/components/shortcuts/use-shortcut-registration";

const {
  getGlobalSettingsSnapshotMock,
  globalSettingsSnapshot,
  subscribeToGlobalSettingsMock,
  workspaceGetActiveMock,
  listenWorkspaceReadyMock,
  listenWorkspaceChangeMock,
} = vi.hoisted(() => ({
  getGlobalSettingsSnapshotMock: vi.fn(),
  globalSettingsSnapshot: {
    telemetryEnabled: true,
    disableGrooveLoadingSection: false,
    showFps: false,
    alwaysShowDiagnosticsSidebar: false,
    periodicRerenderEnabled: false,
    themeMode: "groove",
    keyboardShortcutLeader: "Space",
    keyboardLeaderBindings: {
      openActionLauncher: "k",
      openWorktreeDetailsLauncher: "p",
    },
    opencodeSettings: {
      enabled: false,
      defaultModel: null,
      settingsDirectory: "~/.config/opencode",
    },
  } as GlobalSettings,
  subscribeToGlobalSettingsMock: vi.fn((onStoreChange: () => void) => {
    void onStoreChange;
    return () => {};
  }),
  workspaceGetActiveMock: vi.fn(),
  listenWorkspaceReadyMock: vi.fn(async () => () => {}),
  listenWorkspaceChangeMock: vi.fn(async () => () => {}),
}));

vi.mock("@/src/lib/ipc", () => ({
  getGlobalSettingsSnapshot: getGlobalSettingsSnapshotMock,
  subscribeToGlobalSettings: subscribeToGlobalSettingsMock,
  workspaceGetActive: workspaceGetActiveMock,
  listenWorkspaceReady: listenWorkspaceReadyMock,
  listenWorkspaceChange: listenWorkspaceChangeMock,
}));

function ShortcutFixture() {
  useShortcutRegistration({
    actionables: [{ id: "general-action", type: "button", label: "Refresh worktrees", run: () => {} }],
    worktreeDetailActionables: [{ id: "worktree-detail-action", type: "button", label: "Open details", run: () => {} }],
  });

  return null;
}

function ExplicitRegistrationFixture() {
  const context = useContext(KeyboardShortcutsContext);

  useEffect(() => {
    if (!context) {
      return;
    }

    context.register("registration-dashboard", "/", {
      worktreeDetailActionables: [{ id: "dashboard-worktree-list", type: "button", label: "Dashboard worktree list", run: () => {} }],
    });
    context.register("registration-detail", "/worktrees/alpha", {
      worktreeDetailActionables: [{ id: "detail-worktree-action", type: "button", label: "Detail-only action", run: () => {} }],
    });

    return () => {
      context.unregister("registration-dashboard");
      context.unregister("registration-detail");
    };
  }, [context]);

  return null;
}

describe("KeyboardShortcutsProvider launcher modes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    getGlobalSettingsSnapshotMock.mockImplementation(() => globalSettingsSnapshot);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    workspaceGetActiveMock.mockResolvedValue({ ok: false, rows: [] } satisfies WorkspaceContextResponse);
    globalSettingsSnapshot.keyboardShortcutLeader = DEFAULT_KEYBOARD_SHORTCUT_LEADER;
    globalSettingsSnapshot.keyboardLeaderBindings = {
      [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "k",
      [OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]: "p",
    };
  });

  it("opens the actions launcher from leader+k", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Refresh worktrees")).toBeTruthy();
    expect(screen.queryByText("Open details")).toBeNull();
  });

  it("opens the worktree details launcher from leader+p", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "p" });

    expect(screen.getByText("Worktree details")).toBeTruthy();
    expect(screen.getByText("Open details")).toBeTruthy();
    expect(screen.queryByText("Refresh worktrees")).toBeNull();
  });

  it("keeps leader+p bound to dashboard worktree list across routes", () => {
    render(
      <MemoryRouter initialEntries={["/worktrees/alpha"]}>
        <KeyboardShortcutsProvider>
          <ExplicitRegistrationFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "p" });

    expect(screen.getByText("Worktree details")).toBeTruthy();
    expect(screen.getByText("Dashboard worktree list")).toBeTruthy();
    expect(screen.queryByText("Detail-only action")).toBeNull();
  });

  it("shows global worktree details on non-dashboard routes before dashboard mounts", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          worktree: "alpha",
          branchGuess: "feature/alpha",
          path: "/repo/.worktrees/alpha",
          status: "ready",
        },
      ],
    } satisfies WorkspaceContextResponse);

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(workspaceGetActiveMock).toHaveBeenCalled();
    });

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "p" });

    expect(screen.getByText("Worktree details")).toBeTruthy();
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.queryByText("No actions match this search.")).toBeNull();
  });

  it("ignores keyboard shortcuts when meta/ctrl/alt is pressed", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    // Leader with ctrl held should be ignored
    fireEvent.keyDown(document, { key: " ", ctrlKey: true });
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("ignores keyboard shortcuts when target is an input element", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
          <input data-testid="text-input" />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    const input = screen.getByTestId("text-input");
    fireEvent.keyDown(input, { key: " " });
    fireEvent.keyDown(input, { key: "k" });

    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("clears leader state when document loses focus", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    // Press leader key
    fireEvent.keyDown(document, { key: " " });

    // Window loses focus
    fireEvent.blur(window);

    // Now pressing "k" should not trigger the launcher
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("ignores unrecognized keys after leader", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: " " });
    // Press an unbound key
    fireEvent.keyDown(document, { key: "z" });

    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("clears fallback worktree detail actionables when workspace fetch fails", async () => {
    workspaceGetActiveMock.mockRejectedValue(new Error("Network error"));

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(workspaceGetActiveMock).toHaveBeenCalled();
    });

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "p" });

    expect(screen.getByText("Worktree details")).toBeTruthy();
    // Should show the fixture's worktree detail actionables as fallback
    expect(screen.getByText("Open details")).toBeTruthy();
  });

  it("filters out deleted worktrees from global actionables", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      rows: [
        { worktree: "active-tree", branchGuess: "main", path: "/repo/.worktrees/active-tree", status: "ready" },
        { worktree: "deleted-tree", branchGuess: "old", path: "/repo/.worktrees/deleted-tree", status: "deleted" },
      ],
    } satisfies WorkspaceContextResponse);

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <KeyboardShortcutsProvider>
          <div>child</div>
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(workspaceGetActiveMock).toHaveBeenCalled();
    });

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "p" });

    await waitFor(() => {
      expect(screen.getByText("active-tree")).toBeTruthy();
    });
    expect(screen.queryByText("deleted-tree")).toBeNull();
  });

  it("does not open launcher when document does not have focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("clears leader state after timeout expires", async () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    // Press leader key
    fireEvent.keyDown(document, { key: " " });

    // Wait for leader timeout (1400ms)
    vi.advanceTimersByTime(1500);

    // Now pressing "k" should not trigger the launcher
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByText("Actions")).toBeNull();

    vi.useRealTimers();
  });

  it("unregistering a non-existent id is a no-op", () => {
    const unregisterSpy = vi.fn();

    function UnregisterFixture() {
      const context = useContext(KeyboardShortcutsContext);

      useEffect(() => {
        if (!context) {
          return;
        }

        // Unregister an ID that was never registered
        context.unregister("non-existent-id");
        unregisterSpy();
      }, [context]);

      return null;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <UnregisterFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    expect(unregisterSpy).toHaveBeenCalled();
    // Should not crash
  });

  it("handles listener setup error during workspace listeners", async () => {
    listenWorkspaceReadyMock.mockRejectedValue(new Error("listener setup failed"));

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listenWorkspaceReadyMock).toHaveBeenCalled();
    });

    // Should not crash even if listener setup fails
    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.getByText("Actions")).toBeTruthy();
  });

  it("runs page-level commands from leader binding", () => {
    const pageCommandRun = vi.fn();

    function PageCommandFixture() {
      useShortcutRegistration({
        commands: [
          {
            id: "goDashboard",
            label: "Go to Dashboard override",
            description: "Override",
            run: pageCommandRun,
          },
        ],
      });
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <PageCommandFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    // Bind goDashboard to a key
    globalSettingsSnapshot.keyboardLeaderBindings = {
      ...globalSettingsSnapshot.keyboardLeaderBindings,
      goDashboard: "d",
    };

    fireEvent.keyDown(document, { key: " " });
    fireEvent.keyDown(document, { key: "d" });

    expect(pageCommandRun).toHaveBeenCalled();
  });

  it("ignores non-alphanumeric key presses", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <KeyboardShortcutsProvider>
          <ShortcutFixture />
        </KeyboardShortcutsProvider>
      </MemoryRouter>,
    );

    // Press a key that normalizeKeyboardEventKey returns null for
    fireEvent.keyDown(document, { key: "Shift" });
    fireEvent.keyDown(document, { key: "k" });

    // Since "Shift" was ignored (not leader), "k" alone shouldn't trigger anything
    expect(screen.queryByText("Actions")).toBeNull();
  });
});
