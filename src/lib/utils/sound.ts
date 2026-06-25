import { soundLibraryRead } from "@/src/lib/ipc/commands-features";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Cache of decoded sound buffers keyed by file name. Sound files use stable,
 * UUID-based names (a rename produces a new file), so an entry never goes
 * stale. This dedupes the disk read + decode that would otherwise happen once
 * per waveform and once per playback — e.g. opening Settings renders a
 * waveform for every enabled hook, many sharing the same file.
 */
const soundBufferCache = new Map<string, Promise<AudioBuffer>>();

/** Reads, decodes, and caches a sound file's audio buffer (deduped per file). */
export function loadSoundBuffer(fileName: string): Promise<AudioBuffer> {
  const cached = soundBufferCache.get(fileName);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const result = await soundLibraryRead(fileName);
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? "Sound file not found");
    }
    const arrayBuffer = base64ToArrayBuffer(result.data);
    return getAudioContext().decodeAudioData(arrayBuffer);
  })();

  // Don't cache failures permanently so a transient error can be retried.
  pending.catch(() => {
    if (soundBufferCache.get(fileName) === pending) {
      soundBufferCache.delete(fileName);
    }
  });
  soundBufferCache.set(fileName, pending);
  return pending;
}

export type PlaySoundResult = {
  played: boolean;
  duration: number;
  error?: string;
};

/** Plays a custom sound file. Returns whether it actually played and the duration. */
export async function playCustomSound(
  fileName: string,
): Promise<PlaySoundResult> {
  try {
    const ctx = getAudioContext();
    const audioBuffer = await loadSoundBuffer(fileName);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = audioBuffer;
    gain.gain.value = 0.5;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    return { played: true, duration: audioBuffer.duration };
  } catch (e) {
    return {
      played: false,
      duration: 0,
      error: e instanceof Error ? e.message : "Failed to play sound",
    };
  }
}

export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.setValueAtTime(1047, now + 0.08);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.setValueAtTime(0.15, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
    gain.gain.linearRampToValueAtTime(0, now + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.25);
    osc2.stop(now + 0.25);
  } catch {
    // audio not available
  }
}
