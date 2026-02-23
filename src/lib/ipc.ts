import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { trackCommandExecution } from "@/lib/command-history";

export type DefaultTerminal = "auto" | "ghostty" | "warp" | "kitty" | "gnome" | "xterm" | "none" | "custom";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?: DefaultTerminal;
  terminalCustomCommand?: string | null;
  telemetryEnabled?: boolean;
};

export type WorkspaceTerminalSettingsPayload = {
  defaultTerminal: DefaultTerminal;
  terminalCustomCommand?: string | null;
  telemetryEnabled?: boolean;
};

export type WorkspaceTerminalSettingsResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
  workspaceMeta?: WorkspaceMeta;
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

const UNTRACKED_COMMANDS = new Set<string>([
  "groove_list",
  "testing_environment_get_status",
  "workspace_events",
  "workspace_get_active",
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
]);

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const MAX_ARGS_SUMMARY_LENGTH = 180;

let inflightInvokeCount = 0;
let latestTelemetryEnabled = true;

function resolveTelemetryEnabled(value: WorkspaceMeta | null | undefined): boolean {
  return value?.telemetryEnabled !== false;
}

function syncTelemetryEnabledFromResult(result: unknown): void {
  if (!result || typeof result !== "object") {
    return;
  }

  const response = result as {
    ok?: unknown;
    workspaceRoot?: unknown;
    workspaceMeta?: WorkspaceMeta | null;
  };

  if (response.workspaceMeta && typeof response.workspaceMeta === "object") {
    latestTelemetryEnabled = resolveTelemetryEnabled(response.workspaceMeta);
    return;
  }

  if (response.ok === true && response.workspaceRoot == null) {
    latestTelemetryEnabled = true;
  }
}

export function isTelemetryEnabled(): boolean {
  return latestTelemetryEnabled;
}

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

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const startedAtMs = globalThis.performance?.now() ?? Date.now();
  const argsSummary = summarizeInvokeArgs(args);

  inflightInvokeCount += 1;
  const inflightAtStart = inflightInvokeCount;

  try {
    const invokeRunner = () => invoke<T>(command, args);
    const result = UNTRACKED_COMMANDS.has(command)
      ? await invokeRunner()
      : await trackCommandExecution(command, invokeRunner);

    const durationMs = Math.max(0, (globalThis.performance?.now() ?? Date.now()) - startedAtMs);
    const outcome = resolveTelemetryOutcome(result);
    syncTelemetryEnabledFromResult(result);

    if (isTelemetryEnabled()) {
      console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
        command,
        duration_ms: Number(durationMs.toFixed(2)),
        outcome,
        inflight: inflightAtStart,
        ...(argsSummary ? { args_summary: argsSummary } : {}),
      });
    }

    return result;
  } catch (error: unknown) {
    const durationMs = Math.max(0, (globalThis.performance?.now() ?? Date.now()) - startedAtMs);
    if (isTelemetryEnabled()) {
      console.info(`${UI_TELEMETRY_PREFIX} ipc.invoke`, {
        command,
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "throw",
        inflight: inflightAtStart,
        ...(argsSummary ? { args_summary: argsSummary } : {}),
      });
    }
    throw error;
  } finally {
    inflightInvokeCount = Math.max(0, inflightInvokeCount - 1);
  }
}

export function grooveList(payload: GrooveListPayload): Promise<GrooveListResponse> {
  return invokeCommand<GrooveListResponse>("groove_list", { payload });
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

export function diagnosticsListOpencodeInstances(): Promise<DiagnosticsOpencodeInstancesResponse> {
  return invokeCommand<DiagnosticsOpencodeInstancesResponse>("diagnostics_list_opencode_instances");
}

export function diagnosticsStopProcess(pid: number): Promise<DiagnosticsStopResponse> {
  return invokeCommand<DiagnosticsStopResponse>("diagnostics_stop_process", { pid });
}

export function diagnosticsStopAllOpencodeInstances(): Promise<DiagnosticsStopAllResponse> {
  return invokeCommand<DiagnosticsStopAllResponse>("diagnostics_stop_all_opencode_instances");
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

export function workspacePickAndOpen(): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_pick_and_open");
}

export function workspaceOpen(workspaceRoot: string): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_open", { workspaceRoot });
}

export function workspaceGetActive(): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_get_active");
}

export function grooveBinStatus(): Promise<GrooveBinStatusResponse> {
  return invokeCommand<GrooveBinStatusResponse>("groove_bin_status");
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

export function workspaceUpdateTerminalSettings(
  payload: WorkspaceTerminalSettingsPayload,
): Promise<WorkspaceTerminalSettingsResponse> {
  return invokeCommand<WorkspaceTerminalSettingsResponse>("workspace_update_terminal_settings", { payload });
}

export function workspaceOpenTerminal(payload: TestingEnvironmentStartPayload): Promise<GrooveRestoreResponse> {
  return invokeCommand<GrooveRestoreResponse>("workspace_open_terminal", { payload });
}
