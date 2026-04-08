import { describe, it, expect, vi, beforeEach } from "vitest";

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

    vi.stubGlobal("AudioContext", vi.fn(() => mockCtx));

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
    vi.stubGlobal("AudioContext", vi.fn(() => {
      throw new Error("not supported");
    }));

    const { playNotificationSound } = await import("@/src/lib/utils/sound");
    expect(() => playNotificationSound()).not.toThrow();
  });
});
