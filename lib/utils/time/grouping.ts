import type { WorkspaceRow } from "@/src/lib/ipc";

export function parseLastExecutedAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getRelativeAgeGroupLabel(timestamp: Date, now: Date): string {
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const valueStart = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  const dayDiff = Math.floor((nowStart.getTime() - valueStart.getTime()) / 86_400_000);

  if (dayDiff <= 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Yesterday";
  }
  if (now.getFullYear() === timestamp.getFullYear() && now.getMonth() === timestamp.getMonth()) {
    return `${String(dayDiff)} days ago`;
  }

  const monthDiff = (now.getFullYear() - timestamp.getFullYear()) * 12 + (now.getMonth() - timestamp.getMonth());
  if (monthDiff > 0 && now.getFullYear() === timestamp.getFullYear()) {
    return `${String(monthDiff)} months ago`;
  }

  const yearDiff = now.getFullYear() - timestamp.getFullYear();
  return `${String(Math.max(yearDiff, 1))} years ago`;
}

export type GroupedWorktreeItem =
  | {
      type: "section";
      label: string;
      key: string;
    }
  | {
      type: "row";
      row: WorkspaceRow;
      key: string;
    };

export function buildGroupedWorktreeItems(rows: WorkspaceRow[]): GroupedWorktreeItem[] {
  const sortedRows = [...rows].sort((left, right) => {
    const leftDate = parseLastExecutedAt(left.lastExecutedAt);
    const rightDate = parseLastExecutedAt(right.lastExecutedAt);
    const leftTime = leftDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightTime = rightDate?.getTime() ?? Number.NEGATIVE_INFINITY;

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    const byWorktree = left.worktree.localeCompare(right.worktree);
    if (byWorktree !== 0) {
      return byWorktree;
    }
    return left.path.localeCompare(right.path);
  });

  const now = new Date();
  const items: GroupedWorktreeItem[] = [];
  let activeGroup: string | null = null;

  for (const row of sortedRows) {
    const rowDate = parseLastExecutedAt(row.lastExecutedAt);
    const groupLabel = rowDate ? getRelativeAgeGroupLabel(rowDate, now) : "No activity yet";
    if (groupLabel !== activeGroup) {
      activeGroup = groupLabel;
      items.push({
        type: "section",
        label: groupLabel,
        key: `section:${groupLabel}`,
      });
    }

    items.push({
      type: "row",
      row,
      key: `row:${row.path}`,
    });
  }

  return items;
}
