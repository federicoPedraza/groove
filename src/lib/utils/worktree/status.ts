import type { GrooveRmResponse, WorkspaceRow } from "@/src/lib/ipc";
import { parseLastExecutedAt } from "@/src/lib/utils/time/grouping";

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
    .sort((left, right) => {
      // Most recently played first, matching the barracks list ordering.
      const leftTime =
        parseLastExecutedAt(left.lastExecutedAt)?.getTime() ??
        Number.NEGATIVE_INFINITY;
      const rightTime =
        parseLastExecutedAt(right.lastExecutedAt)?.getTime() ??
        Number.NEGATIVE_INFINITY;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      const byWorktree = left.worktree.localeCompare(right.worktree);
      if (byWorktree !== 0) {
        return byWorktree;
      }
      return left.path.localeCompare(right.path);
    });
}

export function shouldPromptForceCutRetry(result: GrooveRmResponse): boolean {
  const combinedOutput =
    `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();
  return (
    /contains modified or untracked files/.test(combinedOutput) &&
    /use --force to delete it/.test(combinedOutput)
  );
}
