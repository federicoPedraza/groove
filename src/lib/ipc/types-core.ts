import type { ThemeMode } from "@/src/lib/theme-constants";

export type DefaultTerminal =
  | "auto"
  | "ghostty"
  | "warp"
  | "kitty"
  | "gnome"
  | "xterm"
  | "none"
  | "custom";

export type CommandIntent = "blocking" | "background";

export const DEFAULT_PLAY_GROOVE_COMMAND =
  'x-terminal-emulator -e bash -lc "cd \\"{worktree}\\" && opencode"';
export const GROOVE_PLAY_COMMAND_SENTINEL = "__groove_terminal__";
export const GROOVE_PLAY_CLAUDE_CODE_COMMAND_SENTINEL =
  "__groove_terminal_claude__";
export const GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL = "__groove_terminal_open__";
export const DEFAULT_OPENCODE_SETTINGS_DIRECTORY = "~/.config/opencode";
export const DEFAULT_RUN_LOCAL_COMMAND = "pnpm run dev";

export type OpencodeSettings = {
  enabled: boolean;
  defaultModel?: string | null;
  settingsDirectory: string;
};

export type OpencodeUpdateWorkspaceSettingsPayload = {
  enabled: boolean;
  defaultModel?: string | null;
  settingsDirectory?: string | null;
};

export type OpencodeUpdateGlobalSettingsPayload = {
  enabled: boolean;
  defaultModel?: string | null;
  settingsDirectory?: string | null;
};

export type SummaryRecord = {
  worktreeIds: string[];
  createdAt: string;
  summary: string;
  oneLiner?: string;
};

export type WorktreeRecord = {
  id: string;
  createdAt: string;
  summaries?: SummaryRecord[];
};

export type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?: DefaultTerminal;
  terminalCustomCommand?: string | null;
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
  telemetryEnabled?: boolean;
  disableGrooveLoadingSection?: boolean;
  showFps?: boolean;
  playGrooveCommand?: string;
  worktreeSymlinkPaths?: string[];
  opencodeSettings?: OpencodeSettings;
  worktreeRecords?: Record<string, WorktreeRecord>;
  summaries?: SummaryRecord[];
};

export type WorkspaceRow = {
  worktree: string;
  worktreeId?: string | null;
  branchGuess: string;
  path: string;
  status: "paused" | "ready" | "corrupted" | "deleted";
  lastExecutedAt?: string;
};

export type WorkspaceContextResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  repositoryRemoteUrl?: string;
  workspaceMeta?: WorkspaceMeta;
  workspaceMessage?: string;
  hasWorktreesDirectory?: boolean;
  rows: WorkspaceRow[];
  cancelled?: boolean;
  error?: string;
};

export type WorkspaceTermSanityResponse = {
  requestId?: string;
  ok: boolean;
  termValue?: string;
  isUsable: boolean;
  applied?: boolean;
  fixedValue?: string;
  error?: string;
};

export type WorkspaceGitignoreSanityResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  isApplicable: boolean;
  hasGrooveEntry: boolean;
  hasWorkspaceEntry: boolean;
  missingEntries: string[];
  patched?: boolean;
  patchedWorktree?: string;
  playStarted?: boolean;
  error?: string;
};

export type SoundLibraryEntry = {
  id: string;
  name: string;
  fileName: string;
};

export type ClaudeCodeHookSoundEntry = {
  enabled: boolean;
  soundId: string | null;
};

export type ClaudeCodeSoundSettings = {
  notification: ClaudeCodeHookSoundEntry;
  stop: ClaudeCodeHookSoundEntry;
};

export type GrooveSoundHookType =
  | "play"
  | "pause"
  | "summaryStart"
  | "summaryEnd"
  | "emergency"
  | "remove";

export type GrooveSoundHookEntry = {
  enabled: boolean;
  soundId: string | null;
};

export type GrooveSoundSettings = {
  play: GrooveSoundHookEntry;
  pause: GrooveSoundHookEntry;
  summaryStart: GrooveSoundHookEntry;
  summaryEnd: GrooveSoundHookEntry;
  emergency: GrooveSoundHookEntry;
  remove: GrooveSoundHookEntry;
};

export type GlobalSettings = {
  telemetryEnabled: boolean;
  disableGrooveLoadingSection: boolean;
  showFps: boolean;
  alwaysShowDiagnosticsSidebar: boolean;
  periodicRerenderEnabled: boolean;
  themeMode: ThemeMode;
  keyboardShortcutLeader: string;
  keyboardLeaderBindings: Record<string, string>;
  opencodeSettings: OpencodeSettings;
  soundLibrary: SoundLibraryEntry[];
  claudeCodeSoundSettings: ClaudeCodeSoundSettings;
  grooveSoundSettings: GrooveSoundSettings;
};

export type GlobalSettingsUpdatePayload = {
  telemetryEnabled?: boolean;
  disableGrooveLoadingSection?: boolean;
  showFps?: boolean;
  alwaysShowDiagnosticsSidebar?: boolean;
  periodicRerenderEnabled?: boolean;
  themeMode?: ThemeMode;
  keyboardShortcutLeader?: string;
  keyboardLeaderBindings?: Record<string, string>;
  opencodeSettings?: OpencodeUpdateGlobalSettingsPayload;
  soundLibrary?: SoundLibraryEntry[];
  claudeCodeSoundSettings?: ClaudeCodeSoundSettings;
  grooveSoundSettings?: GrooveSoundSettings;
};

export type GlobalSettingsResponse = {
  requestId?: string;
  ok: boolean;
  globalSettings?: GlobalSettings;
  error?: string;
};

export type WorkspaceTerminalSettingsPayload = {
  defaultTerminal: DefaultTerminal;
  terminalCustomCommand?: string | null;
  telemetryEnabled?: boolean;
  disableGrooveLoadingSection?: boolean;
  showFps?: boolean;
};

export type WorkspaceTerminalSettingsResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  workspaceMeta?: WorkspaceMeta;
  error?: string;
};

export type WorkspaceCommandSettingsResponse =
  WorkspaceTerminalSettingsResponse;

export type WorkspaceCommandSettingsPayload = {
  playGrooveCommand: string;
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
};

export type WorkspaceWorktreeSymlinkPathsPayload = {
  worktreeSymlinkPaths: string[];
};

export type WorkspaceBrowseEntriesPayload = {
  relativePath?: string | null;
};

export type WorkspaceBrowseEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

export type WorkspaceBrowseEntriesResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  relativePath: string;
  entries: WorkspaceBrowseEntry[];
  error?: string;
};

export type WorkspaceEventsPayload = {
  rootName?: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
};

export type WorkspaceEventsResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  error?: string;
};

export type GrooveBinCheckStatus = {
  configuredPath?: string;
  configuredPathValid?: boolean;
  hasIssue: boolean;
  issue?: string;
  effectiveBinaryPath: string;
  effectiveBinarySource: "env" | "bundled" | "path" | string;
};

export type GrooveBinStatusResponse = {
  requestId?: string;
  ok: boolean;
  status: GrooveBinCheckStatus;
  error?: string;
};

export type GrooveBinRepairResponse = {
  requestId?: string;
  ok: boolean;
  changed: boolean;
  action: string;
  clearedPath?: string;
  status: GrooveBinCheckStatus;
  error?: string;
};

export type ExternalUrlOpenResponse = {
  requestId?: string;
  ok: boolean;
  error?: string;
};

export type IpcTelemetrySummaryRow = {
  command: string;
  count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
};
