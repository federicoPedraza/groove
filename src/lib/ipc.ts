import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRow = {
  worktree: string;
  branchGuess: string;
  path: string;
  status: "ready" | "missing .groove";
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

export function grooveList(payload: GrooveListPayload): Promise<GrooveListResponse> {
  return invoke<GrooveListResponse>("groove_list", { payload });
}

export function grooveRestore(payload: GrooveRestorePayload): Promise<GrooveRestoreResponse> {
  return invoke<GrooveRestoreResponse>("groove_restore", { payload });
}

export function grooveNew(payload: GrooveNewPayload): Promise<GrooveNewResponse> {
  return invoke<GrooveNewResponse>("groove_new", { payload });
}

export function grooveRm(payload: GrooveRmPayload): Promise<GrooveRmResponse> {
  return invoke<GrooveRmResponse>("groove_rm", { payload });
}

export function grooveStop(payload: GrooveStopPayload): Promise<GrooveStopResponse> {
  return invoke<GrooveStopResponse>("groove_stop", { payload });
}

export function workspaceEvents(payload: WorkspaceEventsPayload): Promise<WorkspaceEventsResponse> {
  return invoke<WorkspaceEventsResponse>("workspace_events", { payload });
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
  return invoke<WorkspaceContextResponse>("workspace_pick_and_open");
}

export function workspaceOpen(workspaceRoot: string): Promise<WorkspaceContextResponse> {
  return invoke<WorkspaceContextResponse>("workspace_open", { workspaceRoot });
}

export function workspaceGetActive(): Promise<WorkspaceContextResponse> {
  return invoke<WorkspaceContextResponse>("workspace_get_active");
}

export function workspaceClearActive(): Promise<WorkspaceContextResponse> {
  return invoke<WorkspaceContextResponse>("workspace_clear_active");
}
