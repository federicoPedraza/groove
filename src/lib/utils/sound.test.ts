import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSoundLibraryRead } = vi.hoisted(() => ({
  mockSoundLibraryRead: vi.fn(),
}));

vi.mock("@/src/lib/ipc/commands-features", () => ({
  soundLibraryRead: mockSoundLibraryRead,
}));

function createMockOscillator() {
  return {
    type: "" as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockGain() {
  return {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

describe("playNotificationSound", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates oscillators and gain node and connects them", async () => {
    const mockOsc1 = createMockOscillator();
    const mockOsc2 = createMockOscillator();
    const mockGain = createMockGain();
    let oscCallCount = 0;

    const mockCtx = {
      currentTime: 100,
      destination: { type: "destination" },
      createOscillator: vi.fn(() => {
        oscCallCount += 1;
        return oscCallCount === 1 ? mockOsc1 : mockOsc2;
      }),
      createGain: vi.fn(() => mockGain),
    };

    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => mockCtx),
    );

    const { playNotificationSound } = await import("@/src/lib/utils/sound");
    playNotificationSound();

    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockCtx.createGain).toHaveBeenCalledTimes(1);

    expect(mockOsc1.type).toBe("sine");
    expect(mockOsc2.type).toBe("sine");
    expect(mockOsc1.connect).toHaveBeenCalledWith(mockGain);
    expect(mockOsc2.connect).toHaveBeenCalledWith(mockGain);
    expect(mockGain.connect).toHaveBeenCalledWith(mockCtx.destination);

    expect(mockOsc1.start).toHaveBeenCalled();
    expect(mockOsc2.start).toHaveBeenCalled();
    expect(mockOsc1.stop).toHaveBeenCalled();
    expect(mockOsc2.stop).toHaveBeenCalled();

    expect(mockOsc1.frequency.setValueAtTime).toHaveBeenCalledTimes(2);
    expect(mockOsc2.frequency.setValueAtTime).toHaveBeenCalledTimes(1);
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledTimes(2);
    expect(mockGain.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(3);
  });

  it("reuses the same AudioContext on subsequent calls", async () => {
    const mockCtx = {
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => createMockOscillator()),
      createGain: vi.fn(() => createMockGain()),
    };

    const AudioContextMock = vi.fn(() => mockCtx);
    vi.stubGlobal("AudioContext", AudioContextMock);

    const { playNotificationSound } = await import("@/src/lib/utils/sound");
    playNotificationSound();
    playNotificationSound();

    expect(AudioContextMock).toHaveBeenCalledTimes(1);
  });

  it("catches errors silently when AudioContext is unavailable", async () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("not supported");
      }),
    );

    const { playNotificationSound } = await import("@/src/lib/utils/sound");
    expect(() => playNotificationSound()).not.toThrow();
  });
});

describe("playCustomSound", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockSoundLibraryRead.mockReset();
  });

  it("reads file via IPC and plays audio via Web Audio API", async () => {
    const mockBase64 = btoa("fake-audio-data");
    mockSoundLibraryRead.mockResolvedValue({ ok: true, data: mockBase64 });

    const mockAudioBuffer = { duration: 1 };
    const mockSource = {
      buffer: null as unknown,
      connect: vi.fn(),
      start: vi.fn(),
    };
    const mockGain = {
      gain: { value: 1 },
      connect: vi.fn(),
    };
    const mockCtx = {
      currentTime: 0,
      destination: {},
      createBufferSource: vi.fn(() => mockSource),
      createGain: vi.fn(() => mockGain),
      createOscillator: vi.fn(() => createMockOscillator()),
      decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => mockCtx),
    );

    const { playCustomSound } = await import("@/src/lib/utils/sound");
    await playCustomSound("s1.mp3");

    expect(mockSoundLibraryRead).toHaveBeenCalledWith("s1.mp3");
    expect(mockCtx.decodeAudioData).toHaveBeenCalled();
    expect(mockSource.connect).toHaveBeenCalledWith(mockGain);
    expect(mockGain.connect).toHaveBeenCalledWith(mockCtx.destination);
    expect(mockSource.start).toHaveBeenCalledWith(0);
    expect(mockSource.buffer).toBe(mockAudioBuffer);
    expect(mockGain.gain.value).toBe(0.5);
  });

  it("falls back to synthesized sound when IPC read fails", async () => {
    mockSoundLibraryRead.mockResolvedValue({ ok: false, error: "not found" });

    const mockCtx = {
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => createMockOscillator()),
      createGain: vi.fn(() => createMockGain()),
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => mockCtx),
    );

    const { playCustomSound } = await import("@/src/lib/utils/sound");
    await playCustomSound("missing.mp3");

    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });

  it("falls back to synthesized sound when IPC throws", async () => {
    mockSoundLibraryRead.mockRejectedValue(new Error("ipc error"));

    const mockCtx = {
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => createMockOscillator()),
      createGain: vi.fn(() => createMockGain()),
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => mockCtx),
    );

    const { playCustomSound } = await import("@/src/lib/utils/sound");
    await playCustomSound("s1.mp3");

    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });
});
