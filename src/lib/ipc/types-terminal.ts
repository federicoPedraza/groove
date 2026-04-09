import type { WorkspaceMeta } from "./types-core";

export type GrooveTerminalSession = {
  sessionId: string;
  pid?: number;
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
  openMode?: "opencode" | "runLocal" | "plain";
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

export type GrooveTerminalActiveWorktreesResponse = {
  requestId?: string;
  ok: boolean;
  worktrees: string[];
  error?: string;
};

export type GrooveTerminalActivityEntry = {
  sessionId: string;
  hasActivity: boolean;
};

export type GrooveTerminalActivityResponse = {
  requestId?: string;
  ok: boolean;
  entries: GrooveTerminalActivityEntry[];
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

export type GrooveNotification = {
  id: string;
  action?: string;
  worktree: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  timestamp: string;
  source: string;
};

export type GrooveNotificationEvent = {
  workspaceRoot: string;
  notification: GrooveNotification;
};
