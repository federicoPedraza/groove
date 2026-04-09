/**
 * Frontend-only sound system for Groove UI actions.
 * Reads groove sound settings and plays the appropriate sound for each hook type.
 */
import {
  getGrooveSoundSettings,
  getSoundLibrary,
} from "@/src/lib/ipc/global-settings";
import type { GrooveSoundHookType } from "@/src/lib/ipc/types-core";
import { playCustomSound, playNotificationSound } from "@/src/lib/utils/sound";

export function playGrooveHookSound(hookType: GrooveSoundHookType): void {
  const settings = getGrooveSoundSettings();
  const hookEntry = settings[hookType];

  if (!hookEntry.enabled) {
    return;
  }

  if (hookEntry.soundId) {
    const soundLibrary = getSoundLibrary();
    const sound = soundLibrary.find((s) => s.id === hookEntry.soundId);
    if (sound) {
      void playCustomSound(sound.fileName);
      return;
    }
  }

  playNotificationSound();
}
