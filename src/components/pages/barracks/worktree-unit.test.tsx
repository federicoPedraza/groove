import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  getWorktreeUnitBadgeClasses,
  getWorktreeUnitKindIcon,
  getWorktreeUnitLevelIcon,
  getWorktreeUnitTitle,
} from "@/src/components/pages/barracks/worktree-unit";
import type { WorktreeUnit } from "@/src/lib/ipc";

const BUG: WorktreeUnit = {
  kind: "bug",
  level: 3,
  reward: 145,
  name: "Omen",
};
const GOLDMINE: WorktreeUnit = {
  kind: "goldmine",
  level: 5,
  reward: 1100,
  name: "Goldmine",
};
const GEMS: WorktreeUnit = {
  kind: "gems",
  level: 4,
  reward: 900,
  name: "Gems",
};

describe("worktree-unit helpers", () => {
  it("uses a distinct palette per kind (red bug, yellow goldmine, purple gems)", () => {
    const bugClasses = getWorktreeUnitBadgeClasses(BUG);
    const goldmineClasses = getWorktreeUnitBadgeClasses(GOLDMINE);
    const gemsClasses = getWorktreeUnitBadgeClasses(GEMS);
    expect(bugClasses).toMatch(/red/);
    expect(goldmineClasses).toMatch(/yellow/);
    expect(gemsClasses).toMatch(/purple/);
    expect(new Set([bugClasses, goldmineClasses, gemsClasses]).size).toBe(3);
  });

  it("uses a darker, lower-opacity palette when the unit is rewarded", () => {
    const rewardedBug = getWorktreeUnitBadgeClasses({ ...BUG, rewarded: true });
    const rewardedGoldmine = getWorktreeUnitBadgeClasses({
      ...GOLDMINE,
      rewarded: true,
    });
    const rewardedGems = getWorktreeUnitBadgeClasses({
      ...GEMS,
      rewarded: true,
    });
    // Bug: shifts to red-950 background with /40 alpha.
    expect(rewardedBug).toMatch(/bg-red-950\/40/);
    expect(rewardedBug).toMatch(/border-red-900\/40/);
    // Goldmine: shifts to yellow-700 with /40 alpha (going darker than the
    // bright yellow-400 base) and flips text to a light yellow so it stays
    // legible on the faded background.
    expect(rewardedGoldmine).toMatch(/bg-yellow-700\/40/);
    expect(rewardedGoldmine).toMatch(/border-yellow-700\/40/);
    expect(rewardedGoldmine).toMatch(/text-yellow-50/);
    expect(rewardedGoldmine).not.toMatch(/text-yellow-950/);
    // Gems: faded purple at /40 alpha.
    expect(rewardedGems).toMatch(/bg-purple-900\/40/);
    expect(rewardedGems).toMatch(/border-purple-800\/40/);
  });

  it("renders a kind icon for every kind", () => {
    for (const unit of [BUG, GOLDMINE, GEMS]) {
      const { container, unmount } = render(
        <>{getWorktreeUnitKindIcon(unit)}</>,
      );
      expect(container.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });

  it("renders a level icon for every level", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const unit: WorktreeUnit = {
        kind: "bug",
        level,
        reward: 0,
        name: "Test",
      };
      const { container, unmount } = render(
        <>{getWorktreeUnitLevelIcon(unit)}</>,
      );
      expect(container.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });

  it("includes kind and level in the title (no reward shown)", () => {
    expect(getWorktreeUnitTitle(BUG)).toMatch(/Bug/);
    expect(getWorktreeUnitTitle(BUG)).toMatch(/level 3/);
    expect(getWorktreeUnitTitle(GOLDMINE)).toMatch(/Goldmine/);
    expect(getWorktreeUnitTitle(GOLDMINE)).toMatch(/level 5/);
    expect(getWorktreeUnitTitle(GEMS)).toMatch(/Gems/);
    expect(getWorktreeUnitTitle(GEMS)).toMatch(/level 4/);
    expect(getWorktreeUnitTitle(BUG)).not.toMatch(/145/);
    expect(getWorktreeUnitTitle(GOLDMINE)).not.toMatch(/1100/);
    expect(getWorktreeUnitTitle(GEMS)).not.toMatch(/900/);
  });
});
