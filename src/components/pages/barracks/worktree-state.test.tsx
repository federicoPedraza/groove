import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BLOCKED_STATE_CLASSES,
  DEFEATED_STATE_CLASSES,
  FIGHTING_STATE_CLASSES,
  FORGOTTEN_STATE_CLASSES,
  PENDING_STATE_CLASSES,
  WOUNDED_STATE_CLASSES,
} from "@/src/components/pages/barracks/constants";
import {
  getWorktreeStateBadgeClasses,
  getWorktreeStateIcon,
  getWorktreeStateTitle,
} from "@/src/components/pages/barracks/worktree-state";

const ALL_STATES = [
  "pending",
  "fighting",
  "wounded",
  "defeated",
  "blocked",
  "forgotten",
] as const;

describe("worktree-state helpers", () => {
  it("returns the right badge classes per state", () => {
    expect(getWorktreeStateBadgeClasses("pending")).toBe(PENDING_STATE_CLASSES);
    expect(getWorktreeStateBadgeClasses("fighting")).toBe(FIGHTING_STATE_CLASSES);
    expect(getWorktreeStateBadgeClasses("wounded")).toBe(WOUNDED_STATE_CLASSES);
    expect(getWorktreeStateBadgeClasses("defeated")).toBe(DEFEATED_STATE_CLASSES);
    expect(getWorktreeStateBadgeClasses("blocked")).toBe(BLOCKED_STATE_CLASSES);
    expect(getWorktreeStateBadgeClasses("forgotten")).toBe(FORGOTTEN_STATE_CLASSES);
  });

  it("returns a tooltip title for every state", () => {
    for (const state of ALL_STATES) {
      expect(getWorktreeStateTitle(state)).toMatch(/Worktree/);
    }
  });

  it("renders an icon element for every state", () => {
    for (const state of ALL_STATES) {
      const { container, unmount } = render(<>{getWorktreeStateIcon(state)}</>);
      expect(container.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });
});
