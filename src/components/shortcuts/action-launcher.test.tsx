import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ActionLauncher,
  type ActionLauncherItem,
} from "@/src/components/shortcuts/action-launcher";

describe("ActionLauncher keyboard interaction", () => {
  it("runs the first visible action by default and wraps with arrow navigation", () => {
    const runFirst = vi.fn();
    const runSecond = vi.fn();
    const runThird = vi.fn();

    const items: ActionLauncherItem[] = [
      { id: "first", type: "button", label: "First", run: runFirst },
      { id: "second", type: "button", label: "Second", run: runSecond },
      { id: "third", type: "button", label: "Third", run: runThird },
    ];
    const onOpenChange = vi.fn();

    render(
      <ActionLauncher
        open={true}
        onOpenChange={onOpenChange}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    const firstAction = screen.getByRole("button", { name: "First" });
    const thirdAction = screen.getByRole("button", { name: "Third" });

    expect(firstAction.getAttribute("data-highlighted")).toBe("true");
    expect(firstAction.className).toContain("bg-accent");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(runFirst).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(thirdAction.getAttribute("data-highlighted")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(runThird).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(runFirst).toHaveBeenCalledTimes(2);
    expect(runSecond).not.toHaveBeenCalled();
  });

  it("resets highlight to first visible action after filtering", () => {
    const runAlpha = vi.fn();
    const runBeta = vi.fn();

    const items: ActionLauncherItem[] = [
      { id: "alpha", type: "button", label: "Alpha", run: runAlpha },
      { id: "beta", type: "button", label: "Beta", run: runBeta },
    ];
    const onOpenChange = vi.fn();

    render(
      <ActionLauncher
        open={true}
        onOpenChange={onOpenChange}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(runBeta).toHaveBeenCalledTimes(1);
    expect(runAlpha).not.toHaveBeenCalled();
  });

  it("defaults to the first action when entering a nested level", async () => {
    const runNestedFirst = vi.fn();
    const runNestedSecond = vi.fn();

    const items: ActionLauncherItem[] = [
      {
        id: "group",
        type: "dropdown",
        label: "Group",
        items: [
          {
            id: "nested-first",
            type: "button",
            label: "Nested first",
            closeOnRun: false,
            run: runNestedFirst,
          },
          {
            id: "nested-second",
            type: "button",
            label: "Nested second",
            closeOnRun: false,
            run: runNestedSecond,
          },
        ],
      },
      { id: "other", type: "button", label: "Other", run: vi.fn() },
    ];
    const onOpenChange = vi.fn();

    render(
      <ActionLauncher
        open={true}
        onOpenChange={onOpenChange}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Nested first")).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(runNestedFirst).toHaveBeenCalledTimes(1);
    expect(runNestedSecond).not.toHaveBeenCalled();
  });

  it("navigates into a checkbox-multiple-input item and toggles options", async () => {
    const onToggle = vi.fn();

    const items: ActionLauncherItem[] = [
      {
        id: "multi-check",
        type: "checkbox-multiple-input",
        label: "Multi Check",
        description: "Select multiple options",
        options: [
          { id: "opt-a", label: "Option A", checked: false },
          { id: "opt-b", label: "Option B", checked: true },
        ],
        onToggle,
      },
    ];
    const onOpenChange = vi.fn();

    render(
      <ActionLauncher
        open={true}
        onOpenChange={onOpenChange}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    // Enter the checkbox-multiple-input level
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Option A")).toBeTruthy();
      expect(screen.getByText("Option B")).toBeTruthy();
    });

    // Run first option via Enter
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToggle).toHaveBeenCalledWith("opt-a");
  });

  it("navigates back from a nested level", async () => {
    const items: ActionLauncherItem[] = [
      {
        id: "group",
        type: "dropdown",
        label: "Group",
        items: [
          {
            id: "nested",
            type: "button",
            label: "Nested",
            closeOnRun: false,
            run: vi.fn(),
          },
        ],
      },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Nested")).toBeTruthy();
    });

    // Click the Back button
    fireEvent.click(screen.getByText("Back"));

    await waitFor(() => {
      expect(screen.getByText("Group")).toBeTruthy();
    });
  });

  it("shows no-match message when search yields no results", () => {
    const items: ActionLauncherItem[] = [
      { id: "one", type: "button", label: "One", run: vi.fn() },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    fireEvent.change(input, { target: { value: "zzz-nonexistent" } });

    expect(screen.getByText("No actions match this search.")).toBeTruthy();
  });

  it("does not run anything on Enter when no items are visible", () => {
    const run = vi.fn();
    const items: ActionLauncherItem[] = [
      { id: "one", type: "button", label: "One", run },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    fireEvent.change(input, { target: { value: "nonexistent" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).not.toHaveBeenCalled();
  });

  it("displays shortcutKeyHint for button items", () => {
    const items: ActionLauncherItem[] = [
      {
        id: "action-with-hint",
        type: "button",
        label: "Hinted Action",
        shortcutKeyHint: "k",
        run: vi.fn(),
      },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    expect(screen.getByText("K")).toBeTruthy();
  });

  it("displays 'Selected' badge for shortcutKeyHint=Selected", () => {
    const items: ActionLauncherItem[] = [
      {
        id: "selected-hint",
        type: "button",
        label: "Selected Hint",
        shortcutKeyHint: "Selected",
        run: vi.fn(),
      },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    expect(screen.getByText("Selected")).toBeTruthy();
  });

  it("displays selected badge for isSelected items without shortcutKeyHint", () => {
    const items: ActionLauncherItem[] = [
      {
        id: "sel-item",
        type: "button",
        label: "Sel Item",
        isSelected: true,
        run: vi.fn(),
      },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    // There should be a "Selected" text from the isSelected badge
    expect(screen.getByText("Selected")).toBeTruthy();
  });

  it("toggles isSelected state when running closeOnRun=false item", () => {
    const run = vi.fn();
    const items: ActionLauncherItem[] = [
      {
        id: "toggle:sub",
        type: "button",
        label: "Toggle Item",
        closeOnRun: false,
        isSelected: false,
        run,
      },
    ];

    const onOpenChange = vi.fn();
    render(
      <ActionLauncher
        open={true}
        onOpenChange={onOpenChange}
        title="Actions"
        items={items}
      />,
    );

    fireEvent.click(screen.getByText("Toggle Item"));
    expect(run).toHaveBeenCalled();
    // Should not close
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("highlights item on mouse enter", () => {
    const items: ActionLauncherItem[] = [
      { id: "a", type: "button", label: "Item A", run: vi.fn() },
      { id: "b", type: "button", label: "Item B", run: vi.fn() },
    ];

    render(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    const itemB = screen.getByRole("button", { name: "Item B" });
    fireEvent.mouseEnter(itemB);
    expect(itemB.getAttribute("data-highlighted")).toBe("true");
  });

  it("handles ArrowDown starting from index -1", () => {
    // Render with no items initially, then re-render with items
    const items: ActionLauncherItem[] = [
      { id: "x", type: "button", label: "X", run: vi.fn() },
      { id: "y", type: "button", label: "Y", run: vi.fn() },
    ];

    const { rerender } = render(
      <ActionLauncher
        open={false}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );
    rerender(
      <ActionLauncher
        open={true}
        onOpenChange={vi.fn()}
        title="Actions"
        items={items}
      />,
    );

    const input = screen.getByPlaceholderText("Search actions...");
    // Items should be highlighted at index 0 after open
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const itemY = screen.getByRole("button", { name: "Y" });
    expect(itemY.getAttribute("data-highlighted")).toBe("true");
  });
});
