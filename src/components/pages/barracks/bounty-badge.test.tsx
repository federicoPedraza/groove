import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BountyBadge } from "@/src/components/pages/barracks/bounty-badge";
import type { WorktreeUnit } from "@/src/lib/ipc";

const UNIT: WorktreeUnit = {
  kind: "bug",
  level: 3,
  reward: 145,
  name: "Omen",
};

describe("BountyBadge", () => {
  it("renders nothing when state is not wounded or defeated", () => {
    for (const state of ["pending", "fighting", "blocked", "forgotten"] as const) {
      const { container, unmount } = render(
        <BountyBadge state={state} unit={UNIT} />,
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it("renders nothing when wounded and a unit has already been discovered", () => {
    const { container } = render(<BountyBadge state="wounded" unit={UNIT} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the spinner when isDiscovering is true regardless of state", () => {
    for (const state of [
      "pending",
      "wounded",
      "fighting",
      "blocked",
      "defeated",
      "forgotten",
    ] as const) {
      const { container, unmount } = render(
        <BountyBadge state={state} isDiscovering />,
      );
      expect(
        container.querySelector('[role="status"][aria-label="Discovering"]'),
      ).toBeTruthy();
      unmount();
    }
  });

  it("shows the Discover icon-badge button when wounded or defeated with no unit", async () => {
    for (const state of ["wounded", "defeated"] as const) {
      const onDiscover = vi.fn();
      const { unmount } = render(
        <BountyBadge state={state} onDiscover={onDiscover} />,
      );
      const button = screen.getByRole("button", { name: /Discover/ });
      expect(button.className).toMatch(/aspect-square/);
      fireEvent.focus(button);
      await waitFor(() => {
        expect(screen.getAllByText("Discover").length).toBeGreaterThan(0);
      });
      fireEvent.click(button);
      expect(onDiscover).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("shows the bounty as a clickable gold coins button when defeated and not yet claimed", async () => {
    const onReward = vi.fn();
    render(<BountyBadge state="defeated" unit={UNIT} onReward={onReward} />);
    const button = screen.getByRole("button", { name: /Claim bounty 145/ });
    expect(button.className).toMatch(/aspect-square/);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.focus(button);
    await waitFor(() => {
      expect(screen.getAllByText("145").length).toBeGreaterThan(0);
    });
    fireEvent.click(button);
    expect(onReward).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Discover/ })).toBeNull();
  });

  it("transforms into the looting (Beef) badge once gold is claimed", () => {
    const onReward = vi.fn();
    const onLoot = vi.fn();
    render(
      <BountyBadge
        state="defeated"
        unit={{ ...UNIT, rewarded: true }}
        onReward={onReward}
        onLoot={onLoot}
      />,
    );
    // The bounty (Coins) button must be gone…
    expect(screen.queryByRole("button", { name: /Claim bounty/ })).toBeNull();
    // …and the looting button must take its place.
    const lootButton = screen.getByRole("button", { name: /Loot/ });
    fireEvent.click(lootButton);
    expect(onLoot).toHaveBeenCalledTimes(1);
    expect(onReward).not.toHaveBeenCalled();
  });

  it("renders nothing once both rewarded and looted are true", () => {
    const { container } = render(
      <BountyBadge
        state="defeated"
        unit={{ ...UNIT, rewarded: true, looted: true }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("disables the Discover button when no handler is provided", () => {
    render(<BountyBadge state="wounded" />);
    expect(
      (screen.getByRole("button", { name: /Discover/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("renders the new-discovery indicator on top of the badge when isNewDiscovery is true", () => {
    const { container, rerender } = render(
      <BountyBadge state="wounded" isNewDiscovery />,
    );
    expect(
      container.querySelector('[aria-label="New discovery"]'),
    ).toBeTruthy();

    rerender(
      <BountyBadge
        state="defeated"
        unit={UNIT}
        onReward={() => {}}
        isNewDiscovery
      />,
    );
    expect(
      container.querySelector('[aria-label="New discovery"]'),
    ).toBeTruthy();
  });

  it("does not render the new-discovery indicator when isNewDiscovery is false", () => {
    const { container } = render(<BountyBadge state="wounded" />);
    expect(
      container.querySelector('[aria-label="New discovery"]'),
    ).toBeNull();
  });
});
