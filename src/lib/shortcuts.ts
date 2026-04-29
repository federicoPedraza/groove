export const OPEN_ACTION_LAUNCHER_COMMAND_ID = "openActionLauncher";
export const OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID =
  "openWorktreeDetailsLauncher";
export const DEFAULT_KEYBOARD_SHORTCUT_LEADER = "Space";

export const DEFAULT_KEYBOARD_LEADER_BINDINGS: Record<string, string> = {
  [OPEN_ACTION_LAUNCHER_COMMAND_ID]: "k",
  [OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID]: "p",
};

export const SHORTCUT_KEY_OPTIONS: string[] = [
  "Space",
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
];

const SHORTCUT_KEY_PATTERN = /^[a-z0-9]$/;
const LEGACY_OPEN_ACTION_LAUNCHER_DEFAULT_KEY = "p";

function normalizeAlphaNumericKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return SHORTCUT_KEY_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeShortcutKey(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  if (value.trim().toLowerCase() === "space") {
    return "Space";
  }

  return normalizeAlphaNumericKey(value) ?? fallback;
}

export function normalizeKeyboardLeaderBindings(
  value: unknown,
  defaults: Record<string, string> = DEFAULT_KEYBOARD_LEADER_BINDINGS,
): Record<string, string> {
  const normalized: Record<string, string> = { ...defaults };
  if (!value || typeof value !== "object") {
    return normalized;
  }

  const candidateBindings = value as Record<string, unknown>;

  for (const [commandId, shortcutKey] of Object.entries(candidateBindings)) {
    if (!(commandId in defaults)) {
      continue;
    }

    normalized[commandId] = normalizeShortcutKey(
      shortcutKey,
      defaults[commandId],
    );
  }

  const hasWorktreeDetailsBinding = Object.prototype.hasOwnProperty.call(
    candidateBindings,
    OPEN_WORKTREE_DETAILS_LAUNCHER_COMMAND_ID,
  );
  const hasActionLauncherBinding = Object.prototype.hasOwnProperty.call(
    candidateBindings,
    OPEN_ACTION_LAUNCHER_COMMAND_ID,
  );
  if (hasActionLauncherBinding && !hasWorktreeDetailsBinding) {
    const actionLauncherBinding = normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID];
    if (actionLauncherBinding === LEGACY_OPEN_ACTION_LAUNCHER_DEFAULT_KEY) {
      normalized[OPEN_ACTION_LAUNCHER_COMMAND_ID] =
        defaults[OPEN_ACTION_LAUNCHER_COMMAND_ID];
    }
  }

  return normalized;
}

export function toShortcutDisplayLabel(key: string): string {
  if (key === "Space") {
    return key;
  }

  return key.toUpperCase();
}
