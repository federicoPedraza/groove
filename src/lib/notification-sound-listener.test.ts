import { beforeEach, describe, expect, it, vi } from "vitest";

const listenGrooveNotificationMock = vi.fn();
const getClaudeCodeSoundSettingsMock = vi.fn();
const getSoundLibraryMock = vi.fn();
const playNotificationSoundMock = vi.fn();
const playCustomSoundMock = vi.fn();
const addNotifiedWorktreeMock = vi.fn();

vi.mock("@/src/lib/ipc", () => ({
  listenGrooveNotification: listenGrooveNotificationMock,
  getClaudeCodeSoundSettings: getClaudeCodeSoundSettingsMock,
  getSoundLibrary: getSoundLibraryMock,
}));

vi.mock("@/src/lib/utils/sound", () => ({
  playNotificationSound: playNotificationSoundMock,
  playCustomSound: playCustomSoundMock,
}));

vi.mock("@/src/lib/utils/notified-worktrees", () => ({
  addNotifiedWorktree: addNotifiedWorktreeMock,
}));

type NotificationHandler = (event: {
  workspaceRoot: string;
  notification: {
    id: string;
    action: string;
    worktree: string;
    message: string;
    type: string;
    timestamp: string;
    source: string;
  };
}) => void;

describe("notification-sound-listener", () => {
  let handler: NotificationHandler | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    handler = null;

    listenGrooveNotificationMock.mockImplementation(
      async (cb: NotificationHandler) => {
        handler = cb;
        return () => {
          handler = null;
        };
      },
    );

    getClaudeCodeSoundSettingsMock.mockReturnValue({
      notification: { enabled: false, soundId: null },
      stop: { enabled: false, soundId: null },
    });
    getSoundLibraryMock.mockReturnValue([]);
  });

  async function startListener(workspaceRoot = "/repo") {
    const mod = await import("@/src/lib/notification-sound-listener");
    mod.startNotificationListener(workspaceRoot);
    await vi.waitFor(() => expect(handler).not.toBeNull());
    return mod;
  }

  function fireNotification(
    overrides: Partial<{
      workspaceRoot: string;
      action: string;
      worktree: string;
    }> = {},
  ) {
    handler?.({
      workspaceRoot: overrides.workspaceRoot ?? "/repo",
      notification: {
        id: "n1",
        action: overrides.action ?? "notification",
        worktree: overrides.worktree ?? "w",
        message: "hi",
        type: "info",
        timestamp: "t",
        source: "s",
      },
    });
  }

  it("plays default synthesized sound when no custom sound is configured", async () => {
    await startListener();
    fireNotification();
    expect(playNotificationSoundMock).toHaveBeenCalled();
  });

  it("plays custom sound when hook is enabled and sound is configured", async () => {
    getClaudeCodeSoundSettingsMock.mockReturnValue({
      notification: { enabled: true, soundId: "s1" },
      stop: { enabled: false, soundId: null },
    });
    getSoundLibraryMock.mockReturnValue([
      { id: "s1", name: "Chime", fileName: "chime.mp3" },
    ]);

    await startListener();
    fireNotification();
    expect(playCustomSoundMock).toHaveBeenCalledWith("chime.mp3");
  });

  it("falls back to default sound when sound ID is missing from library", async () => {
    getClaudeCodeSoundSettingsMock.mockReturnValue({
      notification: { enabled: true, soundId: "deleted-id" },
      stop: { enabled: false, soundId: null },
    });
    getSoundLibraryMock.mockReturnValue([]);

    await startListener();
    fireNotification();
    expect(playNotificationSoundMock).toHaveBeenCalled();
  });

  it("routes stop action to stop hook settings", async () => {
    getClaudeCodeSoundSettingsMock.mockReturnValue({
      notification: { enabled: false, soundId: null },
      stop: { enabled: true, soundId: "s2" },
    });
    getSoundLibraryMock.mockReturnValue([
      { id: "s2", name: "Done", fileName: "done.wav" },
    ]);

    await startListener();
    fireNotification({ action: "stop" });
    expect(playCustomSoundMock).toHaveBeenCalledWith("done.wav");
  });

  it("ignores notifications from other workspaces", async () => {
    await startListener();
    fireNotification({ workspaceRoot: "/other-repo" });
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
    expect(playCustomSoundMock).not.toHaveBeenCalled();
  });

  it("adds worktree to notified set", async () => {
    await startListener();
    fireNotification({ worktree: "feature-branch" });
    expect(addNotifiedWorktreeMock).toHaveBeenCalledWith("feature-branch");
  });

  it("skips sound when worktree is muted", async () => {
    const mod = await startListener();
    mod.setNotificationMutedWorktrees(new Set(["w"]));
    fireNotification({ worktree: "w" });
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
    expect(addNotifiedWorktreeMock).not.toHaveBeenCalled();
  });

  it("skips sound when viewing worktree and app is focused", async () => {
    const mod = await startListener();
    mod.setNotificationViewingWorktree("w");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    fireNotification({ worktree: "w" });
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
    expect(addNotifiedWorktreeMock).not.toHaveBeenCalled();
  });

  it("plays sound when viewing worktree but app is not focused", async () => {
    const mod = await startListener();
    mod.setNotificationViewingWorktree("w");
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    fireNotification({ worktree: "w" });
    expect(playNotificationSoundMock).toHaveBeenCalled();
  });
});
