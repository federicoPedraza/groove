import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { globalSettingsUpdateMock, soundLibraryImportMock } = vi.hoisted(() => ({
  globalSettingsUpdateMock: vi.fn(),
  soundLibraryImportMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  globalSettingsUpdate: globalSettingsUpdateMock,
  soundLibraryImport: soundLibraryImportMock,
}));

vi.mock("@/src/lib/utils/sound", () => ({
  playCustomSound: vi.fn(),
  playNotificationSound: vi.fn(),
}));

import { ClaudeCodeSettingsModal } from "./claudecode-settings-modal";
import type { ClaudeCodeSoundSettings, SoundLibraryEntry } from "@/src/lib/ipc";

const DEFAULT_SETTINGS: ClaudeCodeSoundSettings = {
  notification: { enabled: false, soundId: null },
  stop: { enabled: false, soundId: null },
};

const DEFAULT_PROPS = {
  open: true,
  soundLibrary: [] as SoundLibraryEntry[],
  claudeCodeSoundSettings: DEFAULT_SETTINGS,
  onSettingsSaved: vi.fn(),
  onSoundLibraryChanged: vi.fn(),
  onOpenChange: vi.fn(),
};

describe("ClaudeCodeSettingsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalSettingsUpdateMock.mockResolvedValue({
      ok: true,
      globalSettings: {
        claudeCodeSoundSettings: DEFAULT_SETTINGS,
        soundLibrary: [],
      },
    });
  });

  it("renders the dialog with title and description", () => {
    render(<ClaudeCodeSettingsModal {...DEFAULT_PROPS} />);
    expect(screen.getByText("Claude Code settings")).toBeInTheDocument();
    expect(
      screen.getByText(/Configure sounds for Claude Code lifecycle hooks/),
    ).toBeInTheDocument();
  });

  it("renders both hook types", () => {
    render(<ClaudeCodeSettingsModal {...DEFAULT_PROPS} />);
    expect(screen.getByText("Notification")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
  });

  it("enables a hook and calls globalSettingsUpdate", async () => {
    const onSettingsSaved = vi.fn();
    const enabledSettings: ClaudeCodeSoundSettings = {
      notification: { enabled: true, soundId: null },
      stop: { enabled: false, soundId: null },
    };
    globalSettingsUpdateMock.mockResolvedValue({
      ok: true,
      globalSettings: {
        claudeCodeSoundSettings: enabledSettings,
        soundLibrary: [],
      },
    });

    render(
      <ClaudeCodeSettingsModal
        {...DEFAULT_PROPS}
        onSettingsSaved={onSettingsSaved}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    await waitFor(() => {
      expect(globalSettingsUpdateMock).toHaveBeenCalledWith({
        claudeCodeSoundSettings: expect.objectContaining({
          notification: expect.objectContaining({ enabled: true }),
        }),
      });
    });

    await waitFor(() => {
      expect(onSettingsSaved).toHaveBeenCalledWith(
        "Claude Code hook settings saved.",
      );
    });
  });

  it("shows import prompt when no sounds in library and hook is enabled", () => {
    render(
      <ClaudeCodeSettingsModal
        {...DEFAULT_PROPS}
        claudeCodeSoundSettings={{
          notification: { enabled: true, soundId: null },
          stop: { enabled: false, soundId: null },
        }}
      />,
    );
    expect(screen.getByText(/No sounds in library/)).toBeInTheDocument();
    expect(screen.getByText("Import a sound")).toBeInTheDocument();
  });

  it("shows sound dropdown when library has sounds and hook is enabled", () => {
    render(
      <ClaudeCodeSettingsModal
        {...DEFAULT_PROPS}
        soundLibrary={[{ id: "s1", name: "Chime", fileName: "chime.mp3" }]}
        claudeCodeSoundSettings={{
          notification: { enabled: true, soundId: null },
          stop: { enabled: false, soundId: null },
        }}
      />,
    );
    expect(
      screen.getByLabelText("Sound for Notification hook"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Play Notification sound"),
    ).toBeInTheDocument();
  });

  it("displays error when settings update fails", async () => {
    globalSettingsUpdateMock.mockResolvedValue({
      ok: false,
      error: "Something went wrong",
    });

    render(<ClaudeCodeSettingsModal {...DEFAULT_PROPS} />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  });

  it("closes dialog when Close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <ClaudeCodeSettingsModal
        {...DEFAULT_PROPS}
        onOpenChange={onOpenChange}
      />,
    );

    const closeButtons = screen.getAllByText("Close");
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render content when closed", () => {
    render(<ClaudeCodeSettingsModal {...DEFAULT_PROPS} open={false} />);
    expect(screen.queryByText("Claude Code settings")).not.toBeInTheDocument();
  });
});
