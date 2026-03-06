import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KeyboardShortcutsContext } from "@/components/shortcuts/shortcut-registry-context";
import type { GlobalSettings, WorkspaceContextResponse } from "@/src/lib/ipc";
import {
  DEFAULT_KEYBOARD_SHORTCUT_LEADER,
  OPEN_ACTION_LAUNCHER_COMMAND_ID,
  OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
} from "@/src/lib/shortcuts";
import { KeyboardShortcutsProvider } from "@/components/shortcuts/keyboard-shortcuts-provider";
import { useShortcutRegistration } from "@/components/shortcuts/use-shortcut-registration";

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
});
