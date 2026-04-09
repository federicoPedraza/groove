import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  getWorktreeStatusBadgeClasses,
  getWorktreeStatusIcon,
  getWorktreeStatusTitle,
} from "@/src/components/pages/dashboard/worktree-status";
import {
  CORRUPTED_STATUS_CLASSES,
  DELETED_STATUS_CLASSES,
  PAUSED_STATUS_CLASSES,
  READY_STATUS_CLASSES,
} from "@/src/components/pages/dashboard/constants";
import type { WorktreeStatus } from "@/src/components/pages/dashboard/types";

const ALL_STATUSES: WorktreeStatus[] = [
  "ready",
  "paused",
  "deleted",
  "corrupted",
];

describe("getWorktreeStatusBadgeClasses", () => {
  it.each([
    ["ready", READY_STATUS_CLASSES],
    ["paused", PAUSED_STATUS_CLASSES],
    ["deleted", DELETED_STATUS_CLASSES],
    ["corrupted", CORRUPTED_STATUS_CLASSES],
  ] as const)("returns correct classes for %s", (status, expected) => {
    expect(getWorktreeStatusBadgeClasses(status)).toBe(expected);
  });
});

describe("getWorktreeStatusTitle", () => {
  it.each([
    ["ready", "Worktree has active terminal sessions."],
    ["paused", "Worktree has no active terminal sessions."],
    ["deleted", "Worktree was deleted and can be restored."],
    ["corrupted", "Workspace is invalid or missing groove metadata."],
  ] as const)("returns correct title for %s", (status, expected) => {
    expect(getWorktreeStatusTitle(status)).toBe(expected);
  });
});

describe("getWorktreeStatusIcon", () => {
  it.each(ALL_STATUSES)("renders an svg icon for %s status", (status) => {
    const icon = getWorktreeStatusIcon(status);
    const { container } = render(<>{icon}</>);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders distinct icons for each status", () => {
    const classNames = ALL_STATUSES.map((status) => {
      const icon = getWorktreeStatusIcon(status);
      const { container } = render(<>{icon}</>);
      const svg = container.querySelector("svg");
      return svg?.classList.toString();
    });
    const unique = new Set(classNames);
    expect(unique.size).toBe(ALL_STATUSES.length);
  });
});
