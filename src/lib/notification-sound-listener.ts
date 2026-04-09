/**
 * Singleton listener for groove notifications that plays sounds and marks
 * worktrees as notified. Lives outside React to avoid unmount gaps.
 */
import {
  listenGrooveNotification,
  getClaudeCodeSoundSettings,
  getSoundLibrary,
} from "@/src/lib/ipc";
import { addNotifiedWorktree } from "@/src/lib/utils/notified-worktrees";
import { playCustomSound, playNotificationSound } from "@/src/lib/utils/sound";

let activeUnlisten: (() => void) | null = null;
let activeWorkspaceRoot: string | null = null;
let viewingWorktree: string | undefined;
let mutedWorktrees = new Set<string>();

export function setNotificationViewingWorktree(
  worktree: string | undefined,
): void {
  viewingWorktree = worktree;
}

export function setNotificationMutedWorktrees(muted: Set<string>): void {
  mutedWorktrees = muted;
}

export function startNotificationListener(workspaceRoot: string): void {
  if (activeWorkspaceRoot === workspaceRoot && activeUnlisten) {
    return;
  }

  stopNotificationListener();
  activeWorkspaceRoot = workspaceRoot;

  void (async () => {
    activeUnlisten = await listenGrooveNotification((event) => {
      if (event.workspaceRoot !== activeWorkspaceRoot) {
        return;
      }

      const worktreeName = event.notification.worktree;
      if (worktreeName && mutedWorktrees.has(worktreeName)) {
        return;
      }

      if (
        worktreeName &&
        worktreeName === viewingWorktree &&
        document.hasFocus()
      ) {
        return;
      }

      if (worktreeName) {
        addNotifiedWorktree(worktreeName);
      }

      const action = event.notification.action;
      const hookType = action === "stop" ? "stop" : "notification";
      const settings = getClaudeCodeSoundSettings();
      const hookEntry = settings[hookType];
      const soundLibrary = getSoundLibrary();

      if (hookEntry.enabled && hookEntry.soundId) {
        const sound = soundLibrary.find((s) => s.id === hookEntry.soundId);
        if (sound) {
          void playCustomSound(sound.fileName);
          return;
        }
      }

      playNotificationSound();
    });
  })();
}

export function stopNotificationListener(): void {
  if (activeUnlisten) {
    activeUnlisten();
    activeUnlisten = null;
  }
  activeWorkspaceRoot = null;
}
