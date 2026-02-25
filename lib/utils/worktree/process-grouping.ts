export const UNKNOWN_WORKTREE_LABEL = "Unknown worktree";

type WorktreeProcessGroup<T> = {
  worktree: string;
  rows: T[];
};

export function detectWorktreeNameFromCommand(command: string): string | null {
  const match = command.match(/(?:^|[\\/])\.worktrees?(?:[\\/]+)([^\\/"']+)/i);
  if (!match?.[1]) {
    return null;
  }

  const worktree = match[1].trim();
  return worktree.length > 0 ? worktree : null;
}

export function groupRowsByWorktree<T>(rows: T[], getCommand: (row: T) => string): WorktreeProcessGroup<T>[] {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const worktree = detectWorktreeNameFromCommand(getCommand(row)) ?? UNKNOWN_WORKTREE_LABEL;
    const existingRows = grouped.get(worktree);
    if (existingRows) {
      existingRows.push(row);
      continue;
    }

    grouped.set(worktree, [row]);
  }

  const groups = [...grouped.entries()].map(([worktree, groupRows]) => ({
    worktree,
    rows: groupRows,
  }));

  const knownGroups = groups
    .filter((group) => group.worktree !== UNKNOWN_WORKTREE_LABEL)
    .sort((left, right) => left.worktree.localeCompare(right.worktree));
  const unknownGroups = groups.filter((group) => group.worktree === UNKNOWN_WORKTREE_LABEL);

  return [...knownGroups, ...unknownGroups];
}
