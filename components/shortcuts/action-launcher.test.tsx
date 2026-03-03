import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActionLauncher, type ActionLauncherItem } from "@/components/shortcuts/action-launcher";

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

    render(<ActionLauncher open={true} onOpenChange={onOpenChange} title="Actions" items={items} />);

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

    render(<ActionLauncher open={true} onOpenChange={onOpenChange} title="Actions" items={items} />);

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
          { id: "nested-first", type: "button", label: "Nested first", closeOnRun: false, run: runNestedFirst },
          { id: "nested-second", type: "button", label: "Nested second", closeOnRun: false, run: runNestedSecond },
        ],
      },
      { id: "other", type: "button", label: "Other", run: vi.fn() },
    ];
    const onOpenChange = vi.fn();

    render(<ActionLauncher open={true} onOpenChange={onOpenChange} title="Actions" items={items} />);

    const input = screen.getByPlaceholderText("Search actions...");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Nested first")).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(runNestedFirst).toHaveBeenCalledTimes(1);
    expect(runNestedSecond).not.toHaveBeenCalled();
  });
});
