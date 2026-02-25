import type { TestingEnvironmentResponse, WorkspaceRow } from "@/src/lib/ipc";

export type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?: "auto" | "ghostty" | "warp" | "kitty" | "gnome" | "xterm" | "none" | "custom";
  terminalCustomCommand?: string | null;
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
};

export type WorktreeRow = WorkspaceRow;
export type WorktreeStatus = WorkspaceRow["status"];
export type OpencodeState = "running" | "not-running" | "unknown";

export type RuntimeStateRow = {
  branch: string;
  worktree: string;
  opencodeState: OpencodeState;
  opencodeInstanceId?: string;
  logState: "latest" | "broken-latest" | "none" | "unknown";
  logTarget?: string;
};

export type RuntimeListApiResponse = {
  requestId?: string;
  ok: boolean;
  rows: Record<string, RuntimeStateRow>;
  stdout: string;
  stderr: string;
  error?: string;
};

export type RestoreApiResponse = {
  requestId?: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type StopApiResponse = {
  requestId?: string;
  ok: boolean;
  alreadyStopped?: boolean;
  pid?: number;
  source?: "request" | "runtime";
  error?: string;
};

export type TestingEnvironmentState = TestingEnvironmentResponse;

export type TestingEnvironmentColor = {
  iconClassName: string;
  cardBorderClassName: string;
  cardBackgroundClassName: string;
};

export type ActiveWorkspace = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  repositoryRemoteUrl?: string;
  rows: WorktreeRow[];
  hasWorktreesDirectory: boolean;
};
