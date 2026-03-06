type WorktreeLabelRow = {
  worktree: string;
  taskId?: string | null;
};

export type WorktreeInstanceLabel = {
  worktree: string;
  usesTaskTitle: boolean;
  baseLabel: string;
  displayLabel: string;
};

export function buildWorktreeInstanceLabels(
  rows: readonly WorktreeLabelRow[],
  taskTitlesById: Readonly<Record<string, string>>,
): WorktreeInstanceLabel[] {
  const worktreeItems = rows.map((row) => {
    const assignedTaskTitle = row.taskId ? taskTitlesById[row.taskId] : undefined;
    const trimmedTaskTitle = assignedTaskTitle?.trim();
    const baseLabel = trimmedTaskTitle || row.worktree;

    return {
      worktree: row.worktree,
      usesTaskTitle: Boolean(trimmedTaskTitle),
      baseLabel,
    };
  });

  const labelCounts = worktreeItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.baseLabel] = (counts[item.baseLabel] ?? 0) + 1;
    return counts;
  }, {});

  const duplicateIndexesByLabel: Record<string, number> = {};

  return worktreeItems.map((item) => {
    const duplicateCount = labelCounts[item.baseLabel] ?? 0;
    if (duplicateCount <= 1) {
      return {
        worktree: item.worktree,
        usesTaskTitle: item.usesTaskTitle,
        baseLabel: item.baseLabel,
        displayLabel: item.baseLabel,
      };
    }

    duplicateIndexesByLabel[item.baseLabel] = (duplicateIndexesByLabel[item.baseLabel] ?? 0) + 1;
    const displayLabel = `[${String(duplicateIndexesByLabel[item.baseLabel])}] ${item.baseLabel}`;

    return {
      worktree: item.worktree,
      usesTaskTitle: item.usesTaskTitle,
      baseLabel: item.baseLabel,
      displayLabel,
    };
  });
}
