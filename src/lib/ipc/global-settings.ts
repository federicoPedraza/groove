import {
  DEFAULT_KEYBOARD_LEADER_BINDINGS,
  DEFAULT_KEYBOARD_SHORTCUT_LEADER,
  normalizeKeyboardLeaderBindings,
  normalizeShortcutKey,
} from "@/src/lib/shortcuts";
import { DEFAULT_THEME_MODE, type ThemeMode } from "@/src/lib/theme-constants";

import type {
  ClaudeCodeSoundSettings,
  GlobalSettings,
  GrooveSoundSettings,
  OpencodeSettings,
  SoundLibraryEntry,
} from "./types-core";
import { DEFAULT_OPENCODE_SETTINGS_DIRECTORY } from "./types-core";

const DEFAULT_OPENCODE_SETTINGS: OpencodeSettings = {
  enabled: false,
  defaultModel: null,
  settingsDirectory: DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
};

const DEFAULT_CLAUDE_CODE_HOOK_SOUND_ENTRY = { enabled: false, soundId: null };

const DEFAULT_CLAUDE_CODE_SOUND_SETTINGS: ClaudeCodeSoundSettings = {
  notification: { ...DEFAULT_CLAUDE_CODE_HOOK_SOUND_ENTRY },
  stop: { ...DEFAULT_CLAUDE_CODE_HOOK_SOUND_ENTRY },
};

const DEFAULT_GROOVE_SOUND_HOOK_ENTRY = { enabled: false, soundId: null };

const DEFAULT_GROOVE_SOUND_SETTINGS: GrooveSoundSettings = {
  play: { ...DEFAULT_GROOVE_SOUND_HOOK_ENTRY },
  pause: { ...DEFAULT_GROOVE_SOUND_HOOK_ENTRY },
  summaryStart: { ...DEFAULT_GROOVE_SOUND_HOOK_ENTRY },
  summaryEnd: { ...DEFAULT_GROOVE_SOUND_HOOK_ENTRY },
  emergency: { ...DEFAULT_GROOVE_SOUND_HOOK_ENTRY },
  remove: { ...DEFAULT_GROOVE_SOUND_HOOK_ENTRY },
};

let latestGlobalSettings: GlobalSettings = {
  telemetryEnabled: true,
  disableGrooveLoadingSection: false,
  showFps: false,
  alwaysShowDiagnosticsSidebar: false,
  periodicRerenderEnabled: false,
  themeMode: DEFAULT_THEME_MODE,
  keyboardShortcutLeader: DEFAULT_KEYBOARD_SHORTCUT_LEADER,
  keyboardLeaderBindings: { ...DEFAULT_KEYBOARD_LEADER_BINDINGS },
  opencodeSettings: { ...DEFAULT_OPENCODE_SETTINGS },
  soundLibrary: [],
  claudeCodeSoundSettings: { ...DEFAULT_CLAUDE_CODE_SOUND_SETTINGS },
  grooveSoundSettings: { ...DEFAULT_GROOVE_SOUND_SETTINGS },
};

const globalSettingsListeners = new Set<() => void>();
const blockingInvokeListeners = new Set<() => void>();
let blockingInvokeCount = 0;

function normalizeOpencodeSettings(
  value: Partial<OpencodeSettings> | null | undefined,
): OpencodeSettings {
  const defaultModel = value?.defaultModel;
  const settingsDirectory = value?.settingsDirectory;
  return {
    enabled: value?.enabled === true,
    defaultModel:
      typeof defaultModel === "string" && defaultModel.trim().length > 0
        ? defaultModel.trim()
        : null,
    settingsDirectory:
      typeof settingsDirectory === "string" &&
      settingsDirectory.trim().length > 0
        ? settingsDirectory.trim()
        : DEFAULT_OPENCODE_SETTINGS_DIRECTORY,
  };
}

function isThemeMode(value: unknown): value is ThemeMode {
  return (
    value === "light" ||
    value === "groove" ||
    value === "ice" ||
    value === "gum" ||
    value === "lava" ||
    value === "earth" ||
    value === "wind" ||
    value === "dark-groove" ||
    value === "dark"
  );
}

function normalizeClaudeCodeSoundSettings(
  value: Partial<ClaudeCodeSoundSettings> | null | undefined,
): ClaudeCodeSoundSettings {
  return {
    notification: {
      enabled: value?.notification?.enabled === true,
      soundId:
        typeof value?.notification?.soundId === "string"
          ? value.notification.soundId
          : null,
    },
    stop: {
      enabled: value?.stop?.enabled === true,
      soundId:
        typeof value?.stop?.soundId === "string" ? value.stop.soundId : null,
    },
  };
}

const GROOVE_SOUND_HOOK_KEYS: (keyof GrooveSoundSettings)[] = [
  "play",
  "pause",
  "summaryStart",
  "summaryEnd",
  "emergency",
  "remove",
];

function normalizeGrooveSoundSettings(
  value: Partial<GrooveSoundSettings> | null | undefined,
): GrooveSoundSettings {
  const result = {} as GrooveSoundSettings;
  for (const key of GROOVE_SOUND_HOOK_KEYS) {
    const entry = value?.[key];
    result[key] = {
      enabled: entry?.enabled === true,
      soundId: typeof entry?.soundId === "string" ? entry.soundId : null,
    };
  }
  return result;
}

function normalizeSoundLibrary(
  value: SoundLibraryEntry[] | null | undefined,
): SoundLibraryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is SoundLibraryEntry =>
      entry != null &&
      typeof entry === "object" &&
      typeof entry.id === "string" &&
      typeof entry.name === "string" &&
      typeof entry.fileName === "string",
  );
}

function normalizeGlobalSettings(
  value: Partial<GlobalSettings> | null | undefined,
): GlobalSettings {
  return {
    telemetryEnabled: value?.telemetryEnabled !== false,
    disableGrooveLoadingSection: value?.disableGrooveLoadingSection === true,
    showFps: value?.showFps === true,
    alwaysShowDiagnosticsSidebar: value?.alwaysShowDiagnosticsSidebar === true,
    periodicRerenderEnabled: value?.periodicRerenderEnabled === true,
    themeMode: isThemeMode(value?.themeMode)
      ? value.themeMode
      : DEFAULT_THEME_MODE,
    keyboardShortcutLeader: normalizeShortcutKey(
      value?.keyboardShortcutLeader,
      DEFAULT_KEYBOARD_SHORTCUT_LEADER,
    ),
    keyboardLeaderBindings: normalizeKeyboardLeaderBindings(
      value?.keyboardLeaderBindings,
      DEFAULT_KEYBOARD_LEADER_BINDINGS,
    ),
    opencodeSettings: normalizeOpencodeSettings(value?.opencodeSettings),
    soundLibrary: normalizeSoundLibrary(value?.soundLibrary),
    claudeCodeSoundSettings: normalizeClaudeCodeSoundSettings(
      value?.claudeCodeSoundSettings,
    ),
    grooveSoundSettings: normalizeGrooveSoundSettings(
      value?.grooveSoundSettings,
    ),
  };
}

function emitGlobalSettingsChanged(): void {
  for (const listener of globalSettingsListeners) {
    listener();
  }
}

function emitBlockingInvokeChanged(): void {
  for (const listener of blockingInvokeListeners) {
    listener();
  }
}

export function updateBlockingInvokeCount(delta: number): void {
  const nextCount = Math.max(0, blockingInvokeCount + delta);
  if (nextCount === blockingInvokeCount) {
    return;
  }
  blockingInvokeCount = nextCount;
  emitBlockingInvokeChanged();
}

const GLOBAL_SETTINGS_SYNC_COMMANDS = new Set<string>([
  "global_settings_get",
  "global_settings_update",
  "sound_library_import",
  "sound_library_remove",
]);

export function syncGlobalSettingsFromResult(
  command: string,
  result: unknown,
): void {
  if (!GLOBAL_SETTINGS_SYNC_COMMANDS.has(command)) {
    return;
  }

  if (!result || typeof result !== "object") {
    return;
  }

  const response = result as {
    ok?: boolean;
    globalSettings?: Partial<GlobalSettings> | null;
  };

  if (response.ok !== true) {
    return;
  }

  if (!response.globalSettings || typeof response.globalSettings !== "object") {
    return;
  }

  const nextGlobalSettings = normalizeGlobalSettings(response.globalSettings);
  const didBindingsChange = Object.keys(DEFAULT_KEYBOARD_LEADER_BINDINGS).some(
    (commandId) => {
      return (
        nextGlobalSettings.keyboardLeaderBindings[commandId] !==
        latestGlobalSettings.keyboardLeaderBindings[commandId]
      );
    },
  );
  const didChange =
    nextGlobalSettings.telemetryEnabled !==
      latestGlobalSettings.telemetryEnabled ||
    nextGlobalSettings.disableGrooveLoadingSection !==
      latestGlobalSettings.disableGrooveLoadingSection ||
    nextGlobalSettings.showFps !== latestGlobalSettings.showFps ||
    nextGlobalSettings.alwaysShowDiagnosticsSidebar !==
      latestGlobalSettings.alwaysShowDiagnosticsSidebar ||
    nextGlobalSettings.periodicRerenderEnabled !==
      latestGlobalSettings.periodicRerenderEnabled ||
    nextGlobalSettings.themeMode !== latestGlobalSettings.themeMode ||
    nextGlobalSettings.keyboardShortcutLeader !==
      latestGlobalSettings.keyboardShortcutLeader ||
    nextGlobalSettings.opencodeSettings.enabled !==
      latestGlobalSettings.opencodeSettings.enabled ||
    nextGlobalSettings.opencodeSettings.defaultModel !==
      latestGlobalSettings.opencodeSettings.defaultModel ||
    nextGlobalSettings.opencodeSettings.settingsDirectory !==
      latestGlobalSettings.opencodeSettings.settingsDirectory ||
    didBindingsChange ||
    JSON.stringify(nextGlobalSettings.soundLibrary) !==
      JSON.stringify(latestGlobalSettings.soundLibrary) ||
    JSON.stringify(nextGlobalSettings.claudeCodeSoundSettings) !==
      JSON.stringify(latestGlobalSettings.claudeCodeSoundSettings) ||
    JSON.stringify(nextGlobalSettings.grooveSoundSettings) !==
      JSON.stringify(latestGlobalSettings.grooveSoundSettings);

  latestGlobalSettings = nextGlobalSettings;

  if (didChange) {
    emitGlobalSettingsChanged();
  }
}

export function isTelemetryEnabled(): boolean {
  return latestGlobalSettings.telemetryEnabled;
}

export function isGrooveLoadingSectionDisabled(): boolean {
  return latestGlobalSettings.disableGrooveLoadingSection;
}

export function isShowFpsEnabled(): boolean {
  return latestGlobalSettings.showFps;
}

export function isAlwaysShowDiagnosticsSidebarEnabled(): boolean {
  return latestGlobalSettings.alwaysShowDiagnosticsSidebar;
}

export function isPeriodicRerenderEnabled(): boolean {
  return latestGlobalSettings.periodicRerenderEnabled;
}

export function getThemeMode(): ThemeMode {
  return latestGlobalSettings.themeMode;
}

export function getGlobalSettingsSnapshot(): GlobalSettings {
  return latestGlobalSettings;
}

export function getSoundLibrary(): SoundLibraryEntry[] {
  return latestGlobalSettings.soundLibrary;
}

export function getClaudeCodeSoundSettings(): ClaudeCodeSoundSettings {
  return latestGlobalSettings.claudeCodeSoundSettings;
}

export function getGrooveSoundSettings(): GrooveSoundSettings {
  return latestGlobalSettings.grooveSoundSettings;
}

export function subscribeToGlobalSettings(listener: () => void): () => void {
  globalSettingsListeners.add(listener);
  return () => {
    globalSettingsListeners.delete(listener);
  };
}

export function hasBlockingInvokeInFlight(): boolean {
  return blockingInvokeCount > 0;
}

export function subscribeToBlockingInvokes(listener: () => void): () => void {
  blockingInvokeListeners.add(listener);
  return () => {
    blockingInvokeListeners.delete(listener);
  };
}

export const subscribeToWorkspaceSettings = subscribeToGlobalSettings;
