import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LootingModal } from "@/src/components/pages/barracks/looting-modal";
import { getItemDefinition } from "@/src/lib/items/definitions";

const FIRST_ITEM_ID = "bug-husk";
const SECOND_ITEM_ID = "mandible-fragment";

function nameOf(itemId: string): string {
  return getItemDefinition(itemId)?.name ?? itemId;
}

describe("LootingModal", () => {
  it("renders only the card — no counter, header, or action buttons", () => {
    render(
      <LootingModal
        snapshot={{
          worktree: "wt",
          unitName: "Beetle",
          loot: [{ itemId: FIRST_ITEM_ID, rarity: "common" }],
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(nameOf(FIRST_ITEM_ID))).toBeTruthy();
    expect(screen.queryByText("Accept all")).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText(/revealed/)).toBeNull();
    expect(screen.queryByText("1 / 1")).toBeNull();
  });

  it("advances to the next loot card on click, then closes on the final click", () => {
    const onClose = vi.fn();
    render(
      <LootingModal
        snapshot={{
          worktree: "wt",
          unitName: "Beetle",
          loot: [
            { itemId: FIRST_ITEM_ID, rarity: "common" },
            { itemId: SECOND_ITEM_ID, rarity: "uncommon" },
          ],
        }}
        onClose={onClose}
      />,
    );

    // First card shown.
    fireEvent.click(screen.getByText(nameOf(FIRST_ITEM_ID)));

    // Second card now shown, still open.
    expect(screen.getByText(nameOf(SECOND_ITEM_ID))).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    // Clicking the last card dismisses.
    fireEvent.click(screen.getByText(nameOf(SECOND_ITEM_ID)));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes immediately when there is no loot", () => {
    const onClose = vi.fn();
    render(
      <LootingModal
        snapshot={{ worktree: "wt", unitName: "Beetle", loot: [] }}
        onClose={onClose}
      />,
    );
    expect(onClose).toHaveBeenCalled();
  });
});
