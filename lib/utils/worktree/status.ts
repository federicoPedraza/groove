import type { GrooveRmResponse, WorkspaceRow } from "@/src/lib/ipc";

type RuntimeStateRow = {
  opencodeState: "running" | "not-running" | "unknown";
};

type RuntimeStateByWorktree = Record<string, RuntimeStateRow | undefined>;

export type WorktreeStatus = WorkspaceRow["status"];

export function deriveWorktreeStatus(
  worktreeStatus: WorktreeStatus,
  runtimeRow: RuntimeStateRow | undefined,
): WorktreeStatus {
  if (worktreeStatus === "deleted") {
    return "deleted";
  }

  if (worktreeStatus === "corrupted") {
    return "corrupted";
  }

  if (worktreeStatus === "closing") {
    return "closing";
  }

  return runtimeRow?.opencodeState === "running" ? "ready" : "paused";
}

export function isWorktreeActive(
  row: WorkspaceRow,
  runtimeRow: RuntimeStateRow | undefined,
  testingRunningWorktrees: readonly string[],
): boolean {
  const status = deriveWorktreeStatus(row.status, runtimeRow);
  return status === "ready" || testingRunningWorktrees.includes(row.worktree);
}

export function getActiveWorktreeRows(
  rows: WorkspaceRow[],
  runtimeStateByWorktree: RuntimeStateByWorktree,
  testingRunningWorktrees: readonly string[],
): WorkspaceRow[] {
  return rows
    .filter((row) => isWorktreeActive(row, runtimeStateByWorktree[row.worktree], testingRunningWorktrees))
    .sort((left, right) => left.worktree.localeCompare(right.worktree));
}

export function shouldPromptForceCutRetry(result: GrooveRmResponse): boolean {
  const combinedOutput = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();
  return /contains modified or untracked files/.test(combinedOutput) && /use --force to delete it/.test(combinedOutput);
}
