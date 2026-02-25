import type { DefaultTerminal } from "@/src/lib/ipc";

export type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?: DefaultTerminal;
  terminalCustomCommand?: string | null;
  telemetryEnabled?: boolean;
  disableGrooveLoadingSection?: boolean;
  showFps?: boolean;
  playGrooveCommand?: string;
  testingPorts?: number[];
  openTerminalAtWorktreeCommand?: string | null;
  runLocalCommand?: string | null;
  worktreeSymlinkPaths?: string[];
};

export type SaveState = "idle" | "saving" | "success" | "error";
