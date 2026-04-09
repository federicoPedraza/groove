import type { WorkspaceRow } from "@/src/lib/ipc";

export type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?:
    | "auto"
    | "ghostty"
    | "warp"
    | "kitty"
    | "gnome"
    | "xterm"
    | "none"
    | "custom";
  terminalCustomCommand?: string | null;
  playGrooveCommand?: string;
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
};

export type WorktreeRow = WorkspaceRow;
export type WorktreeStatus = WorkspaceRow["status"];

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

export type ActiveWorkspace = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  repositoryRemoteUrl?: string;
  rows: WorktreeRow[];
  hasWorktreesDirectory: boolean;
};
