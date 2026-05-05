import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorktreeStateDropdownMenu } from "@/src/components/pages/barracks/state-selector";

describe("WorktreeStateDropdownMenu", () => {
  it("opens a menu listing every other state and fires onSelect", () => {
    const onSelect = vi.fn();
    render(
      <WorktreeStateDropdownMenu
        worktree="feature/a"
        currentState="pending"
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /Set state for worktree feature\/a/,
    });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);

    for (const label of [
      "fighting",
      "wounded",
      "defeated",
      "blocked",
      "forgotten",
    ]) {
      expect(
        screen.getByRole("menuitem", { name: new RegExp(label) }),
      ).toBeTruthy();
    }
    expect(screen.queryByRole("menuitem", { name: /pending/ })).toBeFalsy();

    fireEvent.click(screen.getByRole("menuitem", { name: /fighting/ }));
    expect(onSelect).toHaveBeenCalledWith("fighting");
  });
});
