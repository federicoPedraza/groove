import type { WorkspaceMeta } from "./types-core";

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

export type GrooveSummaryPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  sessionIds: string[];
};

export type GrooveSummaryEntry = {
  sessionId: string;
  worktree?: string;
  ok: boolean;
  summary?: string;
  error?: string;
};

export type GrooveSummaryResponse = {
  requestId?: string;
  ok: boolean;
  summaries: GrooveSummaryEntry[];
  compiledSummary?: string;
  error?: string;
};

export type WorkspaceOpenTerminalPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
  worktree?: string;
};

export type WorkspaceOpenWorkspaceTerminalPayload = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta?: WorkspaceMeta;
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
