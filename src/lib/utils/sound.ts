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

/** Plays a custom sound file. Returns the duration in seconds, or 0 on fallback. */
export async function playCustomSound(fileName: string): Promise<number> {
  try {
    const result = await soundLibraryRead(fileName);
    if (!result.ok || !result.data) {
      playNotificationSound();
      return 0;
    }

    const arrayBuffer = base64ToArrayBuffer(result.data);
    const ctx = getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = audioBuffer;
    gain.gain.value = 0.5;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    return audioBuffer.duration;
  } catch {
    playNotificationSound();
    return 0;
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
