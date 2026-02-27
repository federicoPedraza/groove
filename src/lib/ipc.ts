import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { trackCommandExecution } from "@/lib/command-history";
import { DEFAULT_THEME_MODE, type ThemeMode } from "@/src/lib/theme-constants";

export type DefaultTerminal = "auto" | "ghostty" | "warp" | "kitty" | "gnome" | "xterm" | "none" | "custom";

export type CommandIntent = "blocking" | "background";

export const DEFAULT_PLAY_GROOVE_COMMAND = "ghostty --working-directory={worktree} -e opencode";
export const GROOVE_PLAY_COMMAND_SENTINEL = "__groove_terminal__";
export const GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL = "__groove_terminal_open__";
export const DEFAULT_RUN_LOCAL_COMMAND = "pnpm run dev";
export const DEFAULT_TESTING_PORTS = [3000, 3001, 3002] as const;

type InvokeCommandOptions = {
  intent?: CommandIntent;
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
  testingPorts?: number[];
  worktreeSymlinkPaths?: string[];
  consellourSettings?: ConsellourSettings;
  jiraSettings?: JiraSettings;
  tasks?: WorkspaceTask[];
};

export type JiraSettings = {
  enabled: boolean;
  siteUrl: string;
  accountEmail: string;
  defaultProjectKey?: string | null;
  jql?: string | null;
  syncEnabled: boolean;
  syncOpenIssuesOnly: boolean;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
};

export type JiraApiError = {
  code: string;
  message: string;
  retryAfterSeconds?: number;
};

export type JiraConnectionStatusResponse = {
  requestId?: string;
  ok: boolean;
  connected: boolean;
  workspaceRoot?: string;
  settings?: JiraSettings;
  hasToken?: boolean;
  jiraError?: JiraApiError;
  error?: string;
};

export type JiraConnectApiTokenPayload = {
  siteUrl: string;
  email: string;
  apiToken: string;
  defaultProjectKey?: string;
  jql?: string;
  syncEnabled?: boolean;
  syncOpenIssuesOnly?: boolean;
};

export type JiraConnectResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  settings?: JiraSettings;
  accountDisplayName?: string;
  jiraError?: JiraApiError;
  error?: string;
};

export type JiraDisconnectResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  settings?: JiraSettings;
  error?: string;
};

export type JiraProjectSummary = {
  key: string;
  name: string;
  projectTypeKey?: string;
};

export type JiraProjectsListPayload = {
  includeArchived?: boolean;
};

export type JiraProjectsListResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  projects: JiraProjectSummary[];
  jiraError?: JiraApiError;
  error?: string;
};

export type JiraSyncPullPayload = {
  jqlOverride?: string;
  maxResults?: number;
};

export type JiraSyncPullResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  settings?: JiraSettings;
  jiraError?: JiraApiError;
  error?: string;
};

export type JiraIssueOpenInBrowserPayload = {
  issueKey: string;
};

export type JiraIssueOpenInBrowserResponse = {
  requestId?: string;
  ok: boolean;
  url?: string;
  error?: string;
};

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskOrigin = "consellourTool" | "externalSync";

export type WorkspaceTask = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  consellourPriority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  lastInteractedAt: string;
  origin: TaskOrigin;
  externalId?: string;
  externalUrl?: string;
};

export type ConsellourSettings = {
  openaiApiKey?: string;
  model: string;
  reasoningLevel: "low" | "medium" | "high";
  updatedAt: string;
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

export type WorkspaceCommandSettingsResponse = WorkspaceTerminalSettingsResponse;

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

export type ConsellourSettingsUpdatePayload = {
  openaiApiKey?: string;
  model?: string;
  reasoningLevel?: "low" | "medium" | "high";
};

export type WorkspaceTaskQueryPayload = {
  titleQuery?: string;
  descriptionQuery?: string;
};

export type ConsellourToolCreateTaskPayload = {
  title: string;
  description: string;
  priority: TaskPriority;
  consellourPriority: TaskPriority;
  origin?: TaskOrigin;
  externalId?: string;
  externalUrl?: string;
};

export type ConsellourToolEditTaskPayload = {
  id: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  consellourPriority?: TaskPriority;
  lastInteractedAt?: string;
  origin?: TaskOrigin;
  externalId?: string;
  externalUrl?: string;
};

export type ConsellourSettingsResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  settings?: ConsellourSettings;
  error?: string;
};

export type WorkspaceTasksResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  tasks: WorkspaceTask[];
  error?: string;
};

export type WorkspaceTaskResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  task?: WorkspaceTask;
  error?: string;
};

export type GlobalSettings = {
  telemetryEnabled: boolean;
  disableGrooveLoadingSection: boolean;
  showFps: boolean;
  alwaysShowDiagnosticsSidebar: boolean;
  periodicRerenderEnabled: boolean;
  themeMode: ThemeMode;
};

export type GlobalSettingsUpdatePayload = {
  telemetryEnabled?: boolean;
  disableGrooveLoadingSection?: boolean;
  showFps?: boolean;
  alwaysShowDiagnosticsSidebar?: boolean;
  periodicRerenderEnabled?: boolean;
  themeMode?: ThemeMode;
};

export type WorkspaceCommandSettingsPayload = {
  playGrooveCommand: string;
  testingPorts: number[];
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
};

export type GlobalSettingsResponse = {
  requestId?: string;
  ok: boolean;
  globalSettings?: GlobalSettings;
  error?: string;
};

export type WorkspaceRow = {
  worktree: string;
  branchGuess: string;
  path: string;
  status: "paused" | "closing" | "ready" | "corrupted" | "deleted";
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

export type WorkspaceGitignoreSanityResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  isApplicable: boolean;
  hasGrooveEntry: boolean;
  hasWorkspaceEntry: boolean;
  missingEntries: string[];
  patched?: boolean;
  error?: string;
};

type RuntimeStateRow = {
  branch: string;
  worktree: string;
  opencodeState: "running" | "not-running" | "unknown";
  opencodeInstanceId?: string;
  logState: "latest" | "broken-latest" | "none" | "unknown";
  logTarget?: string;
  opencodeActivityState: "thinking" | "idle" | "finished" | "error" | "unknown";
  opencodeActivityDetail?: {
    reason?: string;
    ageS?: number;
    marker?: string;
    log?: string;
  };
};

type GrooveListPayload = {
  rootName?: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  dir?: string;
};

export type GrooveListResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  rows: Record<string, RuntimeStateRow>;
  stdout: string;
  stderr: string;
  error?: string;
};

export type GrooveRestorePayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  action?: "restore" | "go";
  target?: string;
  dir?: string;
  opencodeLogFile?: string;
};

export type GrooveNewPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  branch: string;
  base?: string;
  dir?: string;
};

export type GrooveNewResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type GrooveRestoreResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type GrooveRmPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  target: string;
  worktree: string;
  dir?: string;
  force?: boolean;
};

export type GrooveRmResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type GrooveStopPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  instanceId?: string;
  dir?: string;
};

export type GrooveStopResponse = {
  requestId?: string;
  ok: boolean;
  alreadyStopped?: boolean;
  pid?: number;
  source?: "request" | "runtime";
  error?: string;
};

export type TestingEnvironmentStatusPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
};

export type TestingEnvironmentSetTargetPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  workspaceRoot?: string;
  worktree: string;
  enabled?: boolean;
  autoStartIfCurrentRunning?: boolean;
  stopRunningProcessesWhenUnset?: boolean;
};

export type TestingEnvironmentStartPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree?: string;
};

export type TestingEnvironmentStopPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree?: string;
};

export type TestingEnvironmentEntry = {
  worktree: string;
  worktreePath: string;
  workspaceRoot?: string;
  isTarget: boolean;
  status: "stopped" | "running";
  instanceId?: string;
  pid?: number;
  port?: number;
  startedAt?: string;
};

export type TestingEnvironmentResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  environments: TestingEnvironmentEntry[];
  targetWorktree?: string;
  targetPath?: string;
  status: "none" | "stopped" | "running";
  instanceId?: string;
  pid?: number;
  startedAt?: string;
  error?: string;
};

export type ExternalUrlOpenResponse = {
  requestId?: string;
  ok: boolean;
  error?: string;
};

export type DiagnosticsProcessRow = {
  pid: number;
  processName: string;
  command: string;
};

export type DiagnosticsOpencodeInstancesResponse = {
  requestId?: string;
  ok: boolean;
  rows: DiagnosticsProcessRow[];
  error?: string;
};

export type DiagnosticsStopResponse = {
  requestId?: string;
  ok: boolean;
  pid?: number;
  alreadyStopped?: boolean;
  error?: string;
};

export type DiagnosticsStopAllResponse = {
  requestId?: string;
  ok: boolean;
  attempted: number;
  stopped: number;
  alreadyStopped: number;
  failed: number;
  errors: string[];
  error?: string;
};

export type DiagnosticsNodeAppRow = {
  pid: number;
  ppid: number;
  cmd: string;
};

export type DiagnosticsNodeAppsResponse = {
  requestId?: string;
  ok: boolean;
  rows: DiagnosticsNodeAppRow[];
  warning?: string;
  error?: string;
};

export type DiagnosticsMostConsumingProgramsResponse = {
  requestId?: string;
  ok: boolean;
  output: string;
  error?: string;
};

export type DiagnosticsSystemOverview = {
  cpuUsagePercent?: number;
  cpuCores?: number;
  ramTotalBytes?: number;
  ramUsedBytes?: number;
  ramUsagePercent?: number;
  swapTotalBytes?: number;
  swapUsedBytes?: number;
  swapUsagePercent?: number;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  diskUsagePercent?: number;
  platform: string;
  hostname?: string;
};

export type DiagnosticsSystemOverviewResponse = {
  requestId?: string;
  ok: boolean;
  overview?: DiagnosticsSystemOverview;
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

export type GitAuthStatusPayload = {
  workspaceRoot: string;
};

export type GitAuthStatusResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  profile: {
    userName?: string;
    userEmail?: string;
  };
  sshStatus: {
    state: string;
    message: string;
  };
  error?: string;
};

export type GitStatusPayload = {
  path: string;
};

export type GitStatusResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  dirty: boolean;
  outputSnippet?: string;
  error?: string;
};

export type GitCurrentBranchPayload = {
  path: string;
};

export type GitCurrentBranchResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  branch?: string;
  outputSnippet?: string;
  error?: string;
};

export type GitListBranchesPayload = {
  path: string;
};

export type GitListBranchesResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  branches: string[];
  outputSnippet?: string;
  error?: string;
};

export type GitAheadBehindPayload = {
  path: string;
};

export type GitAheadBehindResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  ahead: number;
  behind: number;
  outputSnippet?: string;
  error?: string;
};

export type GitPullPayload = {
  path: string;
  rebase?: boolean;
};

export type GitPushPayload = {
  path: string;
  setUpstream?: boolean;
  forceWithLease?: boolean;
  branch?: string;
};

export type GitMergePayload = {
  path: string;
  targetBranch: string;
  ffOnly?: boolean;
};

export type GitMergeAbortPayload = {
  path: string;
};

export type GitCommitPayload = {
  path: string;
  message?: string;
};

export type GitFilesPayload = {
  path: string;
  files: string[];
};

export type GitFileStatesResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  outputSnippet?: string;
  error?: string;
};

export type GitCommandResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  exitCode?: number | null;
  outputSnippet?: string;
  error?: string;
};

export type GitBooleanResponse = {
  requestId?: string;
  ok: boolean;
  path?: string;
  value: boolean;
  outputSnippet?: string;
  error?: string;
};

export type GhDetectRepoPayload = {
  path: string;
};

export type GhDetectRepoResponse = {
  requestId?: string;
  ok: boolean;
  repositoryRoot?: string;
  remoteName?: string;
  remoteUrl?: string;
  host?: string;
  owner?: string;
  repo?: string;
  nameWithOwner?: string;
  repositoryUrl?: string;
  verified: boolean;
  message?: string;
  error?: string;
};

export type GhAuthStatusPayload = {
  hostname?: string;
  path?: string;
  remoteUrl?: string;
};

export type GhAuthStatusResponse = {
  requestId?: string;
  ok: boolean;
  installed: boolean;
  authenticated: boolean;
  hostname?: string;
  username?: string;
  message: string;
  error?: string;
};

export type GhAuthLogoutPayload = {
  hostname?: string;
};

export type GhAuthLogoutResponse = {
  requestId?: string;
  ok: boolean;
  hostname?: string;
  message: string;
  error?: string;
};

export type GhPullRequestItem = {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  url: string;
};

export type GhPrListPayload = {
  owner: string;
  repo: string;
  hostname?: string;
};

export type GhPrListResponse = {
  requestId?: string;
  ok: boolean;
  repository: string;
  prs: GhPullRequestItem[];
  error?: string;
};

export type GhPrCreatePayload = {
  owner: string;
  repo: string;
  base: string;
  head: string;
  title: string;
  body: string;
  hostname?: string;
};

export type GhPrCreateResponse = {
  requestId?: string;
  ok: boolean;
  repository: string;
  url?: string;
  message?: string;
  error?: string;
};

export type GhBranchActionPayload = {
  path: string;
  branch: string;
};

export type GhBranchActionResponse = {
  requestId?: string;
  ok: boolean;
  branch?: string;
  message?: string;
  error?: string;
};

export type GhBranchPrItem = {
  number: number;
  title: string;
  url: string;
};

export type GhCheckBranchPrResponse = {
  requestId?: string;
  ok: boolean;
  branch: string;
  prs: GhBranchPrItem[];
  activePr?: GhBranchPrItem;
  error?: string;
};

type WorkspaceEvent = {
  index?: number;
  source?: string;
  kind?: string;
};

export type GrooveTerminalSession = {
  sessionId: string;
  workspaceRoot: string;
  worktree: string;
  worktreePath: string;
  command: string;
  startedAt: string;
  cols: number;
  rows: number;
  snapshot?: string;
};

export type GrooveTerminalOpenPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  target?: string;
  openMode?: "opencode" | "runLocal";
  cols?: number;
  rows?: number;
  forceRestart?: boolean;
  openNew?: boolean;
};

export type GrooveTerminalWritePayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  sessionId?: string;
  input: string;
};

export type GrooveTerminalResizePayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  sessionId?: string;
  cols: number;
  rows: number;
};

export type GrooveTerminalClosePayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  sessionId?: string;
};

export type GrooveTerminalSessionPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree: string;
  sessionId?: string;
};

export type GrooveTerminalCommandResponse = {
  requestId?: string;
  ok: boolean;
  session?: GrooveTerminalSession;
  error?: string;
};

export type GrooveTerminalSessionResponse = {
  requestId?: string;
  ok: boolean;
  session?: GrooveTerminalSession;
  error?: string;
};

export type GrooveTerminalSessionsResponse = {
  requestId?: string;
  ok: boolean;
  sessions: GrooveTerminalSession[];
  error?: string;
};

export type GrooveTerminalOutputEvent = {
  sessionId: string;
  workspaceRoot: string;
  worktree: string;
  chunk: string;
};

export type GrooveTerminalLifecycleEvent = {
  sessionId: string;
  workspaceRoot: string;
  worktree: string;
  kind: "started" | "closed" | "error";
  message?: string;
};

const UNTRACKED_COMMANDS = new Set<string>([
  "groove_list",
  "testing_environment_get_status",
  "workspace_events",
  "workspace_get_active",
  "workspace_gitignore_sanity_check",
  "groove_bin_status",
  "groove_bin_repair",
  "git_auth_status",
  "git_status",
  "git_current_branch",
  "git_list_branches",
  "git_ahead_behind",
  "git_list_file_states",
  "gh_detect_repo",
  "gh_auth_status",
  "gh_check_branch_pr",
  "global_settings_get",
  "global_settings_update",
  "diagnostics_get_system_overview",
  "workspace_list_symlink_entries",
  "consellour_get_settings",
  "consellour_update_settings",
  "tasks_list",
  "consellour_get_task",
  "consellour_get_recommended_task",
  "consellour_tool_create_task",
  "consellour_tool_edit_task",
  "groove_terminal_open",
  "groove_terminal_write",
  "groove_terminal_resize",
  "groove_terminal_close",
  "groove_terminal_get_session",
  "groove_terminal_list_sessions",
  "jira_connection_status",
  "jira_connect_api_token",
  "jira_disconnect",
  "jira_projects_list",
  "jira_sync_pull",
  "jira_issue_open_in_browser",
]);

const NON_DEDUPED_COMMANDS = new Set<string>(["groove_terminal_write"]);

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const MAX_ARGS_SUMMARY_LENGTH = 180;
const MAX_IPC_TELEMETRY_SAMPLES = 500;

type IpcTelemetryAggregate = {
  count: number;
  sumMs: number;
  maxMs: number;
  samples: number[];
};

export type IpcTelemetrySummaryRow = {
  command: string;
  count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
};

const ipcTelemetryAggregates = new Map<string, IpcTelemetryAggregate>();

declare global {
  interface Window {
    __grooveTelemetrySummary?: () => IpcTelemetrySummaryRow[];
    __grooveTelemetrySummaryClear?: () => void;
  }
}

let inflightInvokeCount = 0;
const inflightInvokes = new Map<string, { promise: Promise<unknown>; joinedCalls: number }>();
let blockingInvokeCount = 0;
let latestGlobalSettings: GlobalSettings = {
  telemetryEnabled: true,
  disableGrooveLoadingSection: false,
  showFps: false,
  alwaysShowDiagnosticsSidebar: false,
  periodicRerenderEnabled: false,
  themeMode: DEFAULT_THEME_MODE,
};
const globalSettingsListeners = new Set<() => void>();
const blockingInvokeListeners = new Set<() => void>();

function isThemeMode(value: unknown): value is ThemeMode {
  return (
    value === "light" ||
    value === "groove" ||
    value === "ice" ||
    value === "lava" ||
    value === "earth" ||
    value === "wind" ||
    value === "dark-groove" ||
    value === "dark"
  );
}

function normalizeGlobalSettings(value: Partial<GlobalSettings> | null | undefined): GlobalSettings {
  return {
    telemetryEnabled: value?.telemetryEnabled !== false,
    disableGrooveLoadingSection: value?.disableGrooveLoadingSection === true,
    showFps: value?.showFps === true,
    alwaysShowDiagnosticsSidebar: value?.alwaysShowDiagnosticsSidebar === true,
    periodicRerenderEnabled: value?.periodicRerenderEnabled === true,
    themeMode: isThemeMode(value?.themeMode) ? value.themeMode : DEFAULT_THEME_MODE,
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

function updateBlockingInvokeCount(delta: number): void {
  const nextCount = Math.max(0, blockingInvokeCount + delta);
  if (nextCount === blockingInvokeCount) {
    return;
  }
  blockingInvokeCount = nextCount;
  emitBlockingInvokeChanged();
}

function syncGlobalSettingsFromResult(result: unknown): void {
  if (!result || typeof result !== "object") {
    return;
  }

  const response = result as {
    globalSettings?: Partial<GlobalSettings> | null;
  };

  if (!response.globalSettings || typeof response.globalSettings !== "object") {
    return;
  }

  const nextGlobalSettings = normalizeGlobalSettings(response.globalSettings);
  const didChange =
    nextGlobalSettings.telemetryEnabled !== latestGlobalSettings.telemetryEnabled ||
    nextGlobalSettings.disableGrooveLoadingSection !== latestGlobalSettings.disableGrooveLoadingSection ||
    nextGlobalSettings.showFps !== latestGlobalSettings.showFps ||
    nextGlobalSettings.alwaysShowDiagnosticsSidebar !== latestGlobalSettings.alwaysShowDiagnosticsSidebar ||
    nextGlobalSettings.periodicRerenderEnabled !== latestGlobalSettings.periodicRerenderEnabled ||
    nextGlobalSettings.themeMode !== latestGlobalSettings.themeMode;

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

function summarizeArgValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 40 ? `string(len=${value.length})` : JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value == null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `array(len=${value.length})`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const preview = keys.slice(0, 4).join(",");
    const suffix = keys.length > 4 ? ",..." : "";
    return `object(keys=${preview}${suffix})`;
  }
  return typeof value;
}

function summarizeInvokeArgs(args?: Record<string, unknown>): string | undefined {
  if (!args || Object.keys(args).length === 0) {
    return undefined;
  }

  const blockedKeyPattern = /(token|secret|password|credential|cookie|session|api.?key|auth)/i;
  const segments: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (blockedKeyPattern.test(key)) {
      continue;
    }
    if (key === "payload" && value && typeof value === "object" && !Array.isArray(value)) {
      const payloadKeys = Object.keys(value as Record<string, unknown>)
        .filter((payloadKey) => !blockedKeyPattern.test(payloadKey))
        .slice(0, 5);
      const payloadSummary = payloadKeys.length > 0 ? payloadKeys.join(",") : "redacted-or-empty";
      segments.push(`payload{${payloadSummary}}`);
      continue;
    }
    segments.push(`${key}=${summarizeArgValue(value)}`);
    if (segments.length >= 6) {
      break;
    }
  }

  if (segments.length === 0) {
    return "redacted";
  }

  const summary = segments.join(" ");
  return summary.length > MAX_ARGS_SUMMARY_LENGTH ? `${summary.slice(0, MAX_ARGS_SUMMARY_LENGTH)}...` : summary;
}

function resolveTelemetryOutcome(result: unknown): "ok" | "error" | "success" {
  if (result && typeof result === "object" && "ok" in result) {
    const maybeOk = (result as { ok?: unknown }).ok;
    if (typeof maybeOk === "boolean") {
      return maybeOk ? "ok" : "error";
    }
  }
  return "success";
}

function roundTelemetryMs(value: number): number {
  return Number(value.toFixed(2));
}

function getPercentileMs(samples: number[], percentile: number): number {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lowerIndex === upperIndex) {
    return lower;
  }

  const ratio = position - lowerIndex;
  return lower + (upper - lower) * ratio;
}

function recordIpcTelemetryDuration(command: string, durationMs: number): void {
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const existing = ipcTelemetryAggregates.get(command);
  if (!existing) {
    ipcTelemetryAggregates.set(command, {
      count: 1,
      sumMs: safeDurationMs,
      maxMs: safeDurationMs,
      samples: [safeDurationMs],
    });
    return;
  }

  existing.count += 1;
  existing.sumMs += safeDurationMs;
  existing.maxMs = Math.max(existing.maxMs, safeDurationMs);

  if (existing.samples.length < MAX_IPC_TELEMETRY_SAMPLES) {
    existing.samples.push(safeDurationMs);
    return;
  }

  const replacementIndex = Math.floor(Math.random() * existing.count);
  if (replacementIndex < MAX_IPC_TELEMETRY_SAMPLES) {
    existing.samples[replacementIndex] = safeDurationMs;
  }
}

export function getIpcTelemetrySummary(): IpcTelemetrySummaryRow[] {
  return [...ipcTelemetryAggregates.entries()]
    .map(([command, aggregate]) => {
      const avgMs = aggregate.count === 0 ? 0 : aggregate.sumMs / aggregate.count;
      return {
        command,
        count: aggregate.count,
        avg_ms: roundTelemetryMs(avgMs),
        p50_ms: roundTelemetryMs(getPercentileMs(aggregate.samples, 0.5)),
        p95_ms: roundTelemetryMs(getPercentileMs(aggregate.samples, 0.95)),
        max_ms: roundTelemetryMs(aggregate.maxMs),
      };
    })
    .sort((a, b) => b.p95_ms - a.p95_ms || b.count - a.count || a.command.localeCompare(b.command));
}

export function printIpcTelemetrySummary(): IpcTelemetrySummaryRow[] {
  const rows = getIpcTelemetrySummary();
  console.table(rows);
  return rows;
}

export function clearIpcTelemetrySummary(): void {
  ipcTelemetryAggregates.clear();
}

function attachIpcTelemetryWindowHelpers(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.__grooveTelemetrySummary = () => printIpcTelemetrySummary();
  window.__grooveTelemetrySummaryClear = () => {
    clearIpcTelemetrySummary();
  };
}

attachIpcTelemetryWindowHelpers();

function serializeInvokeArg(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeInvokeArg(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${serializeInvokeArg(entry)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function getInvokeDedupeKey(command: string, args?: Record<string, unknown>): string {
  return `${command}:${serializeInvokeArg(args ?? null)}`;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>, options?: InvokeCommandOptions): Promise<T> {
  const startedAtMs = globalThis.performance?.now() ?? Date.now();
  const argsSummary = summarizeInvokeArgs(args);
  const shouldDedupe = !NON_DEDUPED_COMMANDS.has(command);
  const dedupeKey = shouldDedupe ? getInvokeDedupeKey(command, args) : null;
  const commandIntent: CommandIntent = options?.intent ?? "blocking";
  const isBlockingInvoke = commandIntent === "blocking";
  const existingInvoke = dedupeKey ? inflightInvokes.get(dedupeKey) : undefined;

  if (existingInvoke) {
    existingInvoke.joinedCalls += 1;
    if (isBlockingInvoke) {
      updateBlockingInvokeCount(1);
    }

    try {
      const result = (await existingInvoke.promise) as T;
      const durationMs = Math.max(0, (globalThis.performance?.now() ?? Date.now()) - startedAtMs);
      const outcome = resolveTelemetryOutcome(result);
      syncGlobalSettingsFromResult(result);

      if (isTelemetryEnabled()) {
        recordIpcTelemetryDuration(command, durationMs);
        console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
          command,
          duration_ms: Number(durationMs.toFixed(2)),
          outcome,
          inflight: inflightInvokeCount,
          deduped_join: true,
          command_intent: commandIntent,
          ...(argsSummary ? { args_summary: argsSummary } : {}),
        });
      }

      return result;
    } catch (error: unknown) {
      const durationMs = Math.max(0, (globalThis.performance?.now() ?? Date.now()) - startedAtMs);
      if (isTelemetryEnabled()) {
        recordIpcTelemetryDuration(command, durationMs);
        console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
          command,
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "throw",
          inflight: inflightInvokeCount,
          deduped_join: true,
          command_intent: commandIntent,
          ...(argsSummary ? { args_summary: argsSummary } : {}),
        });
      }
      throw error;
    } finally {
      if (isBlockingInvoke) {
        updateBlockingInvokeCount(-1);
      }
    }
  }

  inflightInvokeCount += 1;
  if (isBlockingInvoke) {
    updateBlockingInvokeCount(1);
  }
  const inflightAtStart = inflightInvokeCount;
  const trackedInvokePromise = (async () => {
    const invokeRunner = () => invoke<T>(command, args);
    return UNTRACKED_COMMANDS.has(command)
      ? await invokeRunner()
      : await trackCommandExecution(command, invokeRunner);
  })();
  if (dedupeKey) {
    inflightInvokes.set(dedupeKey, {
      promise: trackedInvokePromise as Promise<unknown>,
      joinedCalls: 0,
    });
  }

  try {
    const result = await trackedInvokePromise;

    const durationMs = Math.max(0, (globalThis.performance?.now() ?? Date.now()) - startedAtMs);
    const outcome = resolveTelemetryOutcome(result);
    syncGlobalSettingsFromResult(result);

    if (isTelemetryEnabled()) {
      recordIpcTelemetryDuration(command, durationMs);
      console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
        command,
        duration_ms: Number(durationMs.toFixed(2)),
        outcome,
        inflight: inflightAtStart,
        deduped_joiners: dedupeKey ? (inflightInvokes.get(dedupeKey)?.joinedCalls ?? 0) : 0,
        command_intent: commandIntent,
        ...(argsSummary ? { args_summary: argsSummary } : {}),
      });
    }

    return result;
  } catch (error: unknown) {
    const durationMs = Math.max(0, (globalThis.performance?.now() ?? Date.now()) - startedAtMs);
    if (isTelemetryEnabled()) {
      recordIpcTelemetryDuration(command, durationMs);
      console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
        command,
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "throw",
        inflight: inflightAtStart,
        deduped_joiners: dedupeKey ? (inflightInvokes.get(dedupeKey)?.joinedCalls ?? 0) : 0,
        command_intent: commandIntent,
        ...(argsSummary ? { args_summary: argsSummary } : {}),
      });
    }
    throw error;
  } finally {
    if (dedupeKey) {
      inflightInvokes.delete(dedupeKey);
    }
    inflightInvokeCount = Math.max(0, inflightInvokeCount - 1);
    if (isBlockingInvoke) {
      updateBlockingInvokeCount(-1);
    }
  }
}

export function grooveList(payload: GrooveListPayload, options?: InvokeCommandOptions): Promise<GrooveListResponse> {
  return invokeCommand<GrooveListResponse>("groove_list", { payload }, options);
}

export function grooveRestore(payload: GrooveRestorePayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("groove_restore", { payload });
}

export function grooveNew(payload: GrooveNewPayload): Promise<GrooveNewResponse> {
  return invokeCommand<GrooveNewResponse>("groove_new", { payload });
}

export function grooveRm(payload: GrooveRmPayload): Promise<GrooveRmResponse> {
  return invokeCommand<GrooveRmResponse>("groove_rm", { payload });
}

export function grooveStop(payload: GrooveStopPayload): Promise<GrooveStopResponse> {
  return invokeCommand<GrooveStopResponse>("groove_stop", { payload });
}

export function workspaceEvents(payload: WorkspaceEventsPayload): Promise<WorkspaceEventsResponse> {
  return invokeCommand<WorkspaceEventsResponse>("workspace_events", { payload });
}

export function testingEnvironmentGetStatus(payload: TestingEnvironmentStatusPayload): Promise<TestingEnvironmentResponse> {
  return invokeCommand<TestingEnvironmentResponse>("testing_environment_get_status", { payload });
}

export function testingEnvironmentSetTarget(payload: TestingEnvironmentSetTargetPayload): Promise<TestingEnvironmentResponse> {
  return invokeCommand<TestingEnvironmentResponse>("testing_environment_set_target", { payload });
}

export function testingEnvironmentStart(payload: TestingEnvironmentStartPayload): Promise<TestingEnvironmentResponse> {
  return invokeCommand<TestingEnvironmentResponse>("testing_environment_start", { payload });
}

export function testingEnvironmentStartSeparateTerminal(payload: TestingEnvironmentStartPayload): Promise<TestingEnvironmentResponse> {
  return invokeCommand<TestingEnvironmentResponse>("testing_environment_start_separate_terminal", { payload });
}

export function testingEnvironmentStop(payload: TestingEnvironmentStopPayload): Promise<TestingEnvironmentResponse> {
  return invokeCommand<TestingEnvironmentResponse>("testing_environment_stop", { payload });
}

export function openExternalUrl(url: string): Promise<ExternalUrlOpenResponse> {
  return invokeCommand<ExternalUrlOpenResponse>("open_external_url", { url });
}

export function diagnosticsListOpencodeInstances(): Promise<DiagnosticsOpencodeInstancesResponse> {
  return invokeCommand<DiagnosticsOpencodeInstancesResponse>("diagnostics_list_opencode_instances");
}

export function diagnosticsStopProcess(pid: number): Promise<DiagnosticsStopResponse> {
  return invokeCommand<DiagnosticsStopResponse>("diagnostics_stop_process", { pid });
}

export function diagnosticsStopAllOpencodeInstances(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_stop_all_opencode_instances");
}

export function diagnosticsStopAllNonWorktreeOpencodeInstances(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_stop_all_non_worktree_opencode_instances");
}

export function diagnosticsListWorktreeNodeApps(): Promise<DiagnosticsNodeAppsResponse> {
  return invokeCommand<DiagnosticsNodeAppsResponse>("diagnostics_list_worktree_node_apps");
}

export function diagnosticsCleanAllDevServers(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_clean_all_dev_servers");
}

export function diagnosticsGetMsotConsumingPrograms(): Promise<DiagnosticsMostConsumingProgramsResponse> {
  return invokeCommand<DiagnosticsMostConsumingProgramsResponse>("diagnostics_get_msot_consuming_programs");
}

export function diagnosticsGetSystemOverview(): Promise<DiagnosticsSystemOverviewResponse> {
  return invokeCommand<DiagnosticsSystemOverviewResponse>("diagnostics_get_system_overview", undefined, {
    intent: "background",
  });
}

export function listenWorkspaceChange(
  callback: (event: WorkspaceEvent) => void,
): Promise<UnlistenFn> {
  return listen<WorkspaceEvent>("workspace-change", (event) => {
    callback(event.payload);
  });
}

export function listenWorkspaceReady(callback: (event: Record<string, unknown>) => void): Promise<UnlistenFn> {
  return listen<Record<string, unknown>>("workspace-ready", (event) => {
    callback(event.payload);
  });
}

export function listenGrooveTerminalOutput(
  callback: (event: GrooveTerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveTerminalOutputEvent>("groove-terminal-output", (event) => {
    callback(event.payload);
  });
}

export function listenGrooveTerminalLifecycle(
  callback: (event: GrooveTerminalLifecycleEvent) => void,
): Promise<UnlistenFn> {
  return listen<GrooveTerminalLifecycleEvent>("groove-terminal-lifecycle", (event) => {
    callback(event.payload);
  });
}

export function workspacePickAndOpen(): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_pick_and_open");
}

export function workspaceOpen(workspaceRoot: string): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_open", { workspaceRoot });
}

export function workspaceGetActive(): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_get_active", undefined, {
    intent: "background",
  });
}

export function workspaceGitignoreSanityCheck(): Promise<WorkspaceGitignoreSanityResponse> {
  return invokeCommand<WorkspaceGitignoreSanityResponse>("workspace_gitignore_sanity_check", undefined, {
    intent: "background",
  });
}

export function workspaceGitignoreSanityApply(): Promise<WorkspaceGitignoreSanityResponse> {
  return invokeCommand<WorkspaceGitignoreSanityResponse>("workspace_gitignore_sanity_apply");
}

export function grooveBinStatus(): Promise<GrooveBinStatusResponse> {
  return invokeCommand<GrooveBinStatusResponse>("groove_bin_status", undefined, {
    intent: "background",
  });
}

export function grooveBinRepair(): Promise<GrooveBinRepairResponse> {
  return invokeCommand<GrooveBinRepairResponse>("groove_bin_repair");
}

export function workspaceClearActive(): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_clear_active");
}

export function gitAuthStatus(payload: GitAuthStatusPayload): Promise<GitAuthStatusResponse> {
  return invokeCommand<GitAuthStatusResponse>("git_auth_status", { payload });
}

export function gitStatus(payload: GitStatusPayload): Promise<GitStatusResponse> {
  return invokeCommand<GitStatusResponse>("git_status", { payload });
}

export function gitCurrentBranch(payload: GitCurrentBranchPayload): Promise<GitCurrentBranchResponse> {
  return invokeCommand<GitCurrentBranchResponse>("git_current_branch", { payload });
}

export function gitListBranches(payload: GitListBranchesPayload): Promise<GitListBranchesResponse> {
  return invokeCommand<GitListBranchesResponse>("git_list_branches", { payload });
}

export function gitAheadBehind(payload: GitAheadBehindPayload): Promise<GitAheadBehindResponse> {
  return invokeCommand<GitAheadBehindResponse>("git_ahead_behind", { payload });
}

export function gitPull(payload: GitPullPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_pull", { payload });
}

export function gitPush(payload: GitPushPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_push", { payload });
}

export function gitMerge(payload: GitMergePayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_merge", { payload });
}

export function gitMergeAbort(payload: GitMergeAbortPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_merge_abort", { payload });
}

export function gitHasStagedChanges(payload: GitStatusPayload): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>("git_has_staged_changes", { payload });
}

export function gitMergeInProgress(payload: GitStatusPayload): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>("git_merge_in_progress", { payload });
}

export function gitHasUpstream(payload: GitStatusPayload): Promise<GitBooleanResponse> {
  return invokeCommand<GitBooleanResponse>("git_has_upstream", { payload });
}

export function gitAdd(payload: GitStatusPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_add", { payload });
}

export function gitListFileStates(payload: GitStatusPayload): Promise<GitFileStatesResponse> {
  return invokeCommand<GitFileStatesResponse>("git_list_file_states", { payload });
}

export function gitStageFiles(payload: GitFilesPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_stage_files", { payload });
}

export function gitUnstageFiles(payload: GitFilesPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_unstage_files", { payload });
}

export function gitCommit(payload: GitCommitPayload): Promise<GitCommandResponse> {
  return invokeCommand<GitCommandResponse>("git_commit", { payload });
}

export function ghDetectRepo(payload: GhDetectRepoPayload): Promise<GhDetectRepoResponse> {
  return invokeCommand<GhDetectRepoResponse>("gh_detect_repo", { payload });
}

export function ghAuthStatus(payload: GhAuthStatusPayload = {}): Promise<GhAuthStatusResponse> {
  return invokeCommand<GhAuthStatusResponse>("gh_auth_status", { payload });
}

export function ghAuthLogout(payload: GhAuthLogoutPayload = {}): Promise<GhAuthLogoutResponse> {
  return invokeCommand<GhAuthLogoutResponse>("gh_auth_logout", { payload });
}

export function ghPrList(payload: GhPrListPayload): Promise<GhPrListResponse> {
  return invokeCommand<GhPrListResponse>("gh_pr_list", { payload });
}

export function ghPrCreate(payload: GhPrCreatePayload): Promise<GhPrCreateResponse> {
  return invokeCommand<GhPrCreateResponse>("gh_pr_create", { payload });
}

export function ghOpenBranch(payload: GhBranchActionPayload): Promise<GhBranchActionResponse> {
  return invokeCommand<GhBranchActionResponse>("gh_open_branch", { payload });
}

export function ghOpenActivePr(payload: GhBranchActionPayload): Promise<GhBranchActionResponse> {
  return invokeCommand<GhBranchActionResponse>("gh_open_active_pr", { payload });
}

export function ghCheckBranchPr(payload: GhBranchActionPayload): Promise<GhCheckBranchPrResponse> {
  return invokeCommand<GhCheckBranchPrResponse>("gh_check_branch_pr", { payload });
}

export function globalSettingsGet(): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("global_settings_get", undefined, {
    intent: "background",
  });
}

export function globalSettingsUpdate(payload: GlobalSettingsUpdatePayload): Promise<GlobalSettingsResponse> {
  return invokeCommand<GlobalSettingsResponse>("global_settings_update", { payload });
}

export function workspaceUpdateTerminalSettings(
  payload: WorkspaceTerminalSettingsPayload,
): Promise<WorkspaceTerminalSettingsResponse> {
  return invokeCommand<WorkspaceTerminalSettingsResponse>("workspace_update_terminal_settings", { payload });
}

export function workspaceUpdateCommandsSettings(
  payload: WorkspaceCommandSettingsPayload,
): Promise<WorkspaceCommandSettingsResponse> {
  return invokeCommand<WorkspaceCommandSettingsResponse>("workspace_update_commands_settings", { payload });
}

export function workspaceUpdateWorktreeSymlinkPaths(
  payload: WorkspaceWorktreeSymlinkPathsPayload,
): Promise<WorkspaceCommandSettingsResponse> {
  return invokeCommand<WorkspaceCommandSettingsResponse>("workspace_update_worktree_symlink_paths", { payload });
}

export function workspaceListSymlinkEntries(
  payload: WorkspaceBrowseEntriesPayload = {},
): Promise<WorkspaceBrowseEntriesResponse> {
  return invokeCommand<WorkspaceBrowseEntriesResponse>("workspace_list_symlink_entries", { payload }, {
    intent: "background",
  });
}

export function consellourGetSettings(): Promise<ConsellourSettingsResponse> {
  return invokeCommand<ConsellourSettingsResponse>("consellour_get_settings", undefined, {
    intent: "background",
  });
}

export function consellourUpdateSettings(payload: ConsellourSettingsUpdatePayload): Promise<ConsellourSettingsResponse> {
  return invokeCommand<ConsellourSettingsResponse>("consellour_update_settings", { payload });
}

export function tasksList(): Promise<WorkspaceTasksResponse> {
  return invokeCommand<WorkspaceTasksResponse>("tasks_list", undefined, {
    intent: "background",
  });
}

export function consellourGetTask(payload: WorkspaceTaskQueryPayload): Promise<WorkspaceTaskResponse> {
  return invokeCommand<WorkspaceTaskResponse>("consellour_get_task", { payload }, {
    intent: "background",
  });
}

export function consellourGetRecommendedTask(): Promise<WorkspaceTaskResponse> {
  return invokeCommand<WorkspaceTaskResponse>("consellour_get_recommended_task", undefined, {
    intent: "background",
  });
}

export function consellourToolCreateTask(payload: ConsellourToolCreateTaskPayload): Promise<WorkspaceTaskResponse> {
  return invokeCommand<WorkspaceTaskResponse>("consellour_tool_create_task", { payload });
}

export function consellourToolEditTask(payload: ConsellourToolEditTaskPayload): Promise<WorkspaceTaskResponse> {
  return invokeCommand<WorkspaceTaskResponse>("consellour_tool_edit_task", { payload });
}

export function jiraConnectionStatus(): Promise<JiraConnectionStatusResponse> {
  return invokeCommand<JiraConnectionStatusResponse>("jira_connection_status", undefined, {
    intent: "background",
  });
}

export function jiraConnectApiToken(payload: JiraConnectApiTokenPayload): Promise<JiraConnectResponse> {
  return invokeCommand<JiraConnectResponse>("jira_connect_api_token", { payload });
}

export function jiraDisconnect(): Promise<JiraDisconnectResponse> {
  return invokeCommand<JiraDisconnectResponse>("jira_disconnect");
}

export function jiraProjectsList(payload: JiraProjectsListPayload = {}): Promise<JiraProjectsListResponse> {
  return invokeCommand<JiraProjectsListResponse>("jira_projects_list", { payload }, {
    intent: "background",
  });
}

export function jiraSyncPull(payload: JiraSyncPullPayload = {}): Promise<JiraSyncPullResponse> {
  return invokeCommand<JiraSyncPullResponse>("jira_sync_pull", { payload });
}

export function jiraIssueOpenInBrowser(payload: JiraIssueOpenInBrowserPayload): Promise<JiraIssueOpenInBrowserResponse> {
  return invokeCommand<JiraIssueOpenInBrowserResponse>("jira_issue_open_in_browser", { payload });
}

export function workspaceOpenTerminal(payload: TestingEnvironmentStartPayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("workspace_open_terminal", { payload });
}

export function workspaceOpenWorkspaceTerminal(payload: TestingEnvironmentStatusPayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("workspace_open_workspace_terminal", { payload });
}

export function grooveTerminalOpen(payload: GrooveTerminalOpenPayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_open", { payload });
}

export function grooveTerminalWrite(payload: GrooveTerminalWritePayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_write", { payload }, { intent: "background" });
}

export function grooveTerminalResize(payload: GrooveTerminalResizePayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_resize", { payload }, { intent: "background" });
}

export function grooveTerminalClose(payload: GrooveTerminalClosePayload): Promise<GrooveTerminalCommandResponse> {
  return invokeCommand<GrooveTerminalCommandResponse>("groove_terminal_close", { payload });
}

export function grooveTerminalGetSession(payload: GrooveTerminalSessionPayload): Promise<GrooveTerminalSessionResponse> {
  return invokeCommand<GrooveTerminalSessionResponse>("groove_terminal_get_session", { payload }, { intent: "background" });
}

export function grooveTerminalListSessions(payload: GrooveTerminalSessionPayload): Promise<GrooveTerminalSessionsResponse> {
  return invokeCommand<GrooveTerminalSessionsResponse>("groove_terminal_list_sessions", { payload }, { intent: "background" });
}
