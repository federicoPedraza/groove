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
};

export type WorkspaceTerminalSettingsPayload = {
  defaultTerminal: DefaultTerminal;
  terminalCustomCommand?: string | null;
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
  status: "paused" | "closing" | "ready" | "corrupted";
  lastExecutedAt?: string;
};

export type WorkspaceContextResponse = {
  requestId?: string;
  ok: boolean;
  workspaceRoot?: string;
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
  worktree: string;
  enabled?: boolean;
  autoStartIfCurrentRunning?: boolean;
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

type WorkspaceEvent = {
  index?: number;
  source?: string;
  kind?: string;
};

const UNTRACKED_COMMANDS = new Set<string>(["groove_list", "testing_environment_get_status", "workspace_events", "workspace_get_active"]);

function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (UNTRACKED_COMMANDS.has(command)) {
    return invoke<T>(command, args);
  }
  return trackCommandExecution(command, () => invoke<T>(command, args));
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

export function workspaceClearActive(): Promise<WorkspaceContextResponse> {
  return invokeCommand<WorkspaceContextResponse>("workspace_clear_active");
}

export function workspaceUpdateTerminalSettings(
  payload: WorkspaceTerminalSettingsPayload,
): Promise<WorkspaceTerminalSettingsResponse> {
  return invokeCommand<WorkspaceTerminalSettingsResponse>("workspace_update_terminal_settings", { payload });
}
