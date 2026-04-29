import { describe, it, expect } from "vitest";

import type { WorkspaceRow } from "@/src/lib/ipc";

import {
  parseLastExecutedAt,
  getRelativeAgeGroupLabel,
  buildGroupedWorktreeItems,
} from "@/src/lib/utils/time/grouping";

function makeRow(
  overrides: Partial<WorkspaceRow> & { path: string },
): WorkspaceRow {
  return {
    worktree: "default",
    branchGuess: "main",
    status: "ready",
    ...overrides,
  };
}

describe("parseLastExecutedAt", () => {
  it("returns null for undefined", () => {
    expect(parseLastExecutedAt(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseLastExecutedAt("")).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(parseLastExecutedAt("not-a-date")).toBeNull();
  });

  it("returns a Date for a valid ISO string", () => {
    const result = parseLastExecutedAt("2025-01-15T10:00:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2025-01-15T10:00:00.000Z");
  });
});

describe("getRelativeAgeGroupLabel", () => {
  const now = new Date(2025, 5, 15, 14, 0, 0); // June 15, 2025

  it("returns 'Today' for same day", () => {
    const timestamp = new Date(2025, 5, 15, 8, 0, 0);
    expect(getRelativeAgeGroupLabel(timestamp, now)).toBe("Today");
  });

  it("returns 'Today' for a future timestamp on the same day", () => {
    const timestamp = new Date(2025, 5, 15, 18, 0, 0);
    expect(getRelativeAgeGroupLabel(timestamp, now)).toBe("Today");
  });

  it("returns 'Yesterday' for one day ago", () => {
    const timestamp = new Date(2025, 5, 14, 20, 0, 0);
    expect(getRelativeAgeGroupLabel(timestamp, now)).toBe("Yesterday");
  });

  it("returns 'N days ago' for multiple days in the same month", () => {
    const timestamp = new Date(2025, 5, 10, 12, 0, 0);
    expect(getRelativeAgeGroupLabel(timestamp, now)).toBe("5 days ago");
  });

  it("returns 'N months ago' for different months in the same year", () => {
    const timestamp = new Date(2025, 2, 15, 12, 0, 0); // March 15, 2025
    expect(getRelativeAgeGroupLabel(timestamp, now)).toBe("3 months ago");
  });

  it("returns 'N years ago' for different years", () => {
    const timestamp = new Date(2023, 5, 15, 12, 0, 0);
    expect(getRelativeAgeGroupLabel(timestamp, now)).toBe("2 years ago");
  });

  it("returns '1 years ago' when yearDiff is 0 but crosses year boundary", () => {
    // now is Jan 2025, timestamp is Dec 2024 -- monthDiff>0 but different year
    const janNow = new Date(2025, 0, 15, 14, 0, 0);
    const decTimestamp = new Date(2024, 11, 1, 12, 0, 0);
    expect(getRelativeAgeGroupLabel(decTimestamp, janNow)).toBe("1 years ago");
  });
});

describe("buildGroupedWorktreeItems", () => {
  it("returns empty array for empty input", () => {
    expect(buildGroupedWorktreeItems([])).toEqual([]);
  });

  it("groups active rows by age and puts deleted rows at the end", () => {
    const now = new Date();
    const todayIso = now.toISOString();

    const rows: WorkspaceRow[] = [
      makeRow({ path: "/a", lastExecutedAt: todayIso, status: "ready" }),
      makeRow({ path: "/b", status: "deleted" }),
      makeRow({ path: "/c", status: "deleted", worktree: "alpha" }),
    ];

    const items = buildGroupedWorktreeItems(rows);

    const sections = items.filter((item) => item.type === "section");
    expect(sections.length).toBe(2);
    expect(sections[sections.length - 1].label).toBe("Deleted worktrees");

    const rowItems = items.filter((item) => item.type === "row");
    expect(rowItems.length).toBe(3);
  });

  it("sorts active rows by lastExecutedAt descending, then by worktree, then by path", () => {
    const rows: WorkspaceRow[] = [
      makeRow({
        path: "/z",
        worktree: "beta",
        lastExecutedAt: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        path: "/a",
        worktree: "alpha",
        lastExecutedAt: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        path: "/b",
        worktree: "alpha",
        lastExecutedAt: "2025-01-01T00:00:00Z",
      }),
      makeRow({ path: "/x", lastExecutedAt: "2025-06-01T00:00:00Z" }),
    ];

    const items = buildGroupedWorktreeItems(rows);
    const rowItems = items.filter((item) => item.type === "row");

    expect(rowItems[0].key).toBe("row:/x");
    expect(rowItems[1].key).toBe("row:/a");
    expect(rowItems[2].key).toBe("row:/b");
    expect(rowItems[3].key).toBe("row:/z");
  });

  it("uses 'No activity yet' for rows without lastExecutedAt", () => {
    const rows: WorkspaceRow[] = [makeRow({ path: "/a" })];

    const items = buildGroupedWorktreeItems(rows);
    const sections = items.filter((item) => item.type === "section");
    expect(sections[0].label).toBe("No activity yet");
  });

  it("sorts deleted rows by worktree then path", () => {
    const rows: WorkspaceRow[] = [
      makeRow({ path: "/z", worktree: "beta", status: "deleted" }),
      makeRow({ path: "/a", worktree: "alpha", status: "deleted" }),
    ];

    const items = buildGroupedWorktreeItems(rows);
    const rowItems = items.filter((item) => item.type === "row");

    expect(rowItems[0].key).toBe("row:/a");
    expect(rowItems[1].key).toBe("row:/z");
  });

  it("sorts deleted rows by path when worktree names are the same", () => {
    const rows: WorkspaceRow[] = [
      makeRow({ path: "/z", worktree: "same", status: "deleted" }),
      makeRow({ path: "/a", worktree: "same", status: "deleted" }),
    ];

    const items = buildGroupedWorktreeItems(rows);
    const rowItems = items.filter((item) => item.type === "row");

    expect(rowItems[0].key).toBe("row:/a");
    expect(rowItems[1].key).toBe("row:/z");
  });

  it("does not add deleted section when there are no deleted rows", () => {
    const now = new Date();
    const rows: WorkspaceRow[] = [
      makeRow({ path: "/a", lastExecutedAt: now.toISOString() }),
    ];

    const items = buildGroupedWorktreeItems(rows);
    const sections = items.filter((item) => item.type === "section");
    expect(sections.every((s) => s.label !== "Deleted worktrees")).toBe(true);
  });

  it("creates separate section headers for different age groups", () => {
    const rows: WorkspaceRow[] = [
      makeRow({ path: "/a", lastExecutedAt: new Date().toISOString() }),
      makeRow({ path: "/b", lastExecutedAt: "2020-01-01T00:00:00Z" }),
    ];

    const items = buildGroupedWorktreeItems(rows);
    const sections = items.filter((item) => item.type === "section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });
});
