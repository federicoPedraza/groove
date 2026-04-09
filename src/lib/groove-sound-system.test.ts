import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getGrooveSoundSettingsMock,
  getSoundLibraryMock,
  playCustomSoundMock,
  playNotificationSoundMock,
} = vi.hoisted(() => ({
  getGrooveSoundSettingsMock: vi.fn(),
  getSoundLibraryMock: vi.fn(),
  playCustomSoundMock: vi.fn(),
  playNotificationSoundMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc/global-settings", () => ({
  getGrooveSoundSettings: getGrooveSoundSettingsMock,
  getSoundLibrary: getSoundLibraryMock,
}));

vi.mock("@/src/lib/utils/sound", () => ({
  playCustomSound: playCustomSoundMock,
  playNotificationSound: playNotificationSoundMock,
}));

import { playGrooveHookSound } from "@/src/lib/groove-sound-system";

beforeEach(() => {
  vi.clearAllMocks();
  getSoundLibraryMock.mockReturnValue([]);
});

function mockSettings(
  hookType: string,
  overrides: { enabled?: boolean; soundId?: string | null } = {},
) {
  getGrooveSoundSettingsMock.mockReturnValue({
    [hookType]: {
      enabled: overrides.enabled ?? true,
      soundId: overrides.soundId ?? null,
    },
  });
}

describe("playGrooveHookSound", () => {
  it("does nothing when hook is disabled", () => {
    mockSettings("play", { enabled: false });

    playGrooveHookSound("play");

    expect(playNotificationSoundMock).not.toHaveBeenCalled();
    expect(playCustomSoundMock).not.toHaveBeenCalled();
  });

  it("plays notification sound when no soundId is set", () => {
    mockSettings("play", { enabled: true, soundId: null });

    playGrooveHookSound("play");

    expect(playNotificationSoundMock).toHaveBeenCalledOnce();
    expect(playCustomSoundMock).not.toHaveBeenCalled();
  });

  it("plays custom sound when soundId matches a library entry", () => {
    mockSettings("play", { enabled: true, soundId: "chime-01" });
    getSoundLibraryMock.mockReturnValue([
      { id: "chime-01", fileName: "chime-01.wav", name: "Chime" },
    ]);

    playGrooveHookSound("play");

    expect(playCustomSoundMock).toHaveBeenCalledWith("chime-01.wav");
    expect(playNotificationSoundMock).not.toHaveBeenCalled();
  });

  it("falls back to notification sound when soundId not found in library", () => {
    mockSettings("emergency", { enabled: true, soundId: "missing-sound" });
    getSoundLibraryMock.mockReturnValue([
      { id: "chime-01", fileName: "chime-01.wav", name: "Chime" },
    ]);

    playGrooveHookSound("emergency");

    expect(playNotificationSoundMock).toHaveBeenCalledOnce();
    expect(playCustomSoundMock).not.toHaveBeenCalled();
  });
});
