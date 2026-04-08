let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
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
