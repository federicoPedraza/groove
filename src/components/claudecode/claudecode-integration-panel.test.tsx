import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobalSettings } from "@/src/lib/ipc";

const globalSettingsSnapshotRef = vi.hoisted(() => ({
  current: {
    telemetryEnabled: true,
    disableGrooveLoadingSection: false,
    showFps: false,
    alwaysShowDiagnosticsSidebar: false,
    periodicRerenderEnabled: false,
    themeMode: "groove" as const,
    keyboardShortcutLeader: "Space",
    keyboardLeaderBindings: {},
    opencodeSettings: {
      enabled: false,
      settingsDirectory: "~/.config/opencode",
    },
    soundLibrary: [] as Array<{ id: string; name: string; fileName: string }>,
    claudeCodeSoundSettings: {
      notification: { enabled: false, soundId: null as string | null },
      stop: { enabled: false, soundId: null as string | null },
    },
  } as GlobalSettings,
}));

vi.mock("@/src/lib/ipc", () => ({
  getGlobalSettingsSnapshot: vi.fn(() => globalSettingsSnapshotRef.current),
  subscribeToGlobalSettings: vi.fn((callback: () => void) => {
    void callback;
    return () => {};
  }),
  globalSettingsUpdate: vi.fn(),
  soundLibraryImport: vi.fn(),
}));

vi.mock("@/src/lib/utils/sound", () => ({
  playCustomSound: vi.fn(),
  playNotificationSound: vi.fn(),
}));

import { ClaudeCodeIntegrationPanel } from "./claudecode-integration-panel";

describe("ClaudeCodeIntegrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalSettingsSnapshotRef.current = {
      ...globalSettingsSnapshotRef.current,
      soundLibrary: [],
      claudeCodeSoundSettings: {
        notification: { enabled: false, soundId: null },
        stop: { enabled: false, soundId: null },
      },
    };
  });

  it("renders panel with title and description", () => {
    render(<ClaudeCodeIntegrationPanel />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(
      screen.getByText(/Hook sounds and notifications/),
    ).toBeInTheDocument();
  });

  it("shows no hooks enabled when all disabled", () => {
    render(<ClaudeCodeIntegrationPanel />);
    expect(screen.getByText(/No hooks enabled/)).toBeInTheDocument();
  });

  it("shows hook count when hooks are enabled", () => {
    globalSettingsSnapshotRef.current = {
      ...globalSettingsSnapshotRef.current,
      claudeCodeSoundSettings: {
        notification: { enabled: true, soundId: null },
        stop: { enabled: true, soundId: null },
      },
    };
    render(<ClaudeCodeIntegrationPanel />);
    expect(screen.getByText(/2 hooks enabled/)).toBeInTheDocument();
  });

  it("shows singular hook text for one enabled hook", () => {
    globalSettingsSnapshotRef.current = {
      ...globalSettingsSnapshotRef.current,
      claudeCodeSoundSettings: {
        notification: { enabled: true, soundId: null },
        stop: { enabled: false, soundId: null },
      },
    };
    render(<ClaudeCodeIntegrationPanel />);
    expect(screen.getByText(/1 hook enabled/)).toBeInTheDocument();
  });

  it("renders Settings button", () => {
    render(<ClaudeCodeIntegrationPanel />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("opens modal when Settings button is clicked", () => {
    render(<ClaudeCodeIntegrationPanel />);
    fireEvent.click(screen.getByText("Settings"));
    expect(screen.getByText("Claude Code settings")).toBeInTheDocument();
  });
});
