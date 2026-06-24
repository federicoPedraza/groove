import type { ItemRarity } from "@/src/lib/items/definitions";
import type { ThemeMode } from "@/src/lib/theme-constants";

export type DefaultTerminal =
  | "auto"
  | "ghostty"
  | "warp"
  | "kitty"
  | "alacritty"
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

export type CommentState = "uncommitted" | "committed";

export type CommentRecord = {
  worktreeId: string;
  createdAt: string;
  message: string;
  state: CommentState;
};

export const WORKTREE_STATES = [
  "pending",
  "hunting",
  "fighting",
  "wounded",
  "defeated",
  "blocked",
  "forgotten",
] as const;

export type WorktreeState = (typeof WORKTREE_STATES)[number];

export const DEFAULT_WORKTREE_STATE: WorktreeState = "pending";

export type WorktreeUnitKind = "bug" | "goldmine" | "gems";

export type WorktreeLootEntry = {
  itemId: string;
  rarity: ItemRarity;
};

export type WorktreeUnit = {
  kind: WorktreeUnitKind;
  level: 1 | 2 | 3 | 4 | 5;
  reward: number;
  name: string;
  /** True once the player has collected the gold bounty. */
  rewarded?: boolean;
  /**
   * True once the player has opened the looting interface and rolled +
   * collected the unit's items. Absent / `false` on units that exist
   * but haven't been looted yet (including any pre-existing units from
   * before the gold/loot split — they read as "not looted yet").
   */
  looted?: boolean;
  /** Empty until the player triggers the loot step (rolled lazily). */
  loot?: readonly WorktreeLootEntry[];
};

export type WorktreeRecord = {
  id: string;
  createdAt: string;
  claudeSessionStarted?: boolean;
  state?: WorktreeState;
  unit?: WorktreeUnit;
  summaries?: SummaryRecord[];
  comments?: CommentRecord[];
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
  disableGrooveBusiness?: boolean;
  showFps?: boolean;
  playGrooveCommand?: string;
  worktreeSymlinkPaths?: string[];
  opencodeSettings?: OpencodeSettings;
  onboardingSymlinksConfigured?: boolean;
  onboardingCommandsConfigured?: boolean;
  worktreeRecords?: Record<string, WorktreeRecord>;
  summaries?: SummaryRecord[];
  rootDirectory?: string | null;
  gold?: number;
  defeatedCount?: number;
  /**
   * Bug names that have ever been rolled in this workspace. Populated
   * whenever the Discover flow produces a `Bug` unit. Surfaces a
   * "bestiary" of encountered creatures.
   */
  knownBugs?: string[];
  /**
   * Item-id → count of items collected over the workspace's lifetime.
   * Bumped when a worktree's reward is claimed (alongside gold).
   */
  inventory?: Record<string, number>;
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
  disableGrooveBusiness: boolean;
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
  disableGrooveBusiness?: boolean;
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
  disableGrooveBusiness?: boolean;
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

export type SetWorktreeStatePayload = {
  worktree: string;
  state: WorktreeState;
};

export type ClaimWorktreeRewardPayload = {
  worktree: string;
};

export type ClaimWorktreeRewardResponse = {
  requestId?: string;
  ok: boolean;
  unit?: WorktreeUnit;
  gold?: number;
  error?: string;
};

export type LootWorktreePayload = {
  worktree: string;
};

export type LootWorktreeResponse = {
  requestId?: string;
  ok: boolean;
  unit?: WorktreeUnit;
  loot?: readonly WorktreeLootEntry[];
  inventory?: Record<string, number>;
  error?: string;
};

export type SetWorktreeStateResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  worktree?: string;
  record?: WorktreeRecord;
  error?: string;
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
