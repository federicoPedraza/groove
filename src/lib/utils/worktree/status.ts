import type { GrooveRmResponse, WorkspaceRow } from "@/src/lib/ipc";

export type WorktreeStatus = WorkspaceRow["status"];

export function deriveWorktreeStatus(
  worktreeStatus: WorktreeStatus,
  hasActiveTerminal: boolean,
): WorktreeStatus {
  if (worktreeStatus === "deleted") {
    return "deleted";
  }

  if (worktreeStatus === "corrupted") {
    return "corrupted";
  }

  return hasActiveTerminal ? "ready" : "paused";
}

export function isWorktreeActive(
  row: WorkspaceRow,
  hasActiveTerminal: boolean,
): boolean {
  const status = deriveWorktreeStatus(row.status, hasActiveTerminal);
  return status === "ready";
}

export function getActiveWorktreeRows(
  rows: WorkspaceRow[],
  activeWorktrees: ReadonlySet<string>,
): WorkspaceRow[] {
  return rows
    .filter((row) => isWorktreeActive(row, activeWorktrees.has(row.worktree)))
    .sort((left, right) => left.worktree.localeCompare(right.worktree));
}

export function shouldPromptForceCutRetry(result: GrooveRmResponse): boolean {
  const combinedOutput =
    `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();
  return (
    /contains modified or untracked files/.test(combinedOutput) &&
    /use --force to delete it/.test(combinedOutput)
  );
}
