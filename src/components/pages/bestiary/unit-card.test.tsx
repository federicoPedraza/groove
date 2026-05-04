import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UnitCard } from "@/src/components/pages/bestiary/unit-card";
import type { BugDefinition } from "@/src/lib/bestiary/definitions";

const SAMPLE_DEFINITION: BugDefinition = {
  name: "Omen",
  kingdom: "veilwood",
  description: "A test description for Omen.",
  history: "A test history for Omen.",
};

describe("UnitCard", () => {
  it("renders the unit name and kingdom subtitle on the front face", () => {
    render(
      <UnitCard
        open={true}
        definition={SAMPLE_DEFINITION}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Omen" })).toBeTruthy();
    expect(screen.getByText("Veilwood")).toBeTruthy();
  });

  it("starts in the front-facing state with the back face aria-hidden", () => {
    render(
      <UnitCard
        open={true}
        definition={SAMPLE_DEFINITION}
        onClose={() => {}}
      />,
    );
    const flipButton = screen.getByRole("button", {
      name: "Show back of Omen card",
    });
    expect(flipButton).toBeTruthy();
  });

  it("flips to the back face when the card is clicked", () => {
    render(
      <UnitCard
        open={true}
        definition={SAMPLE_DEFINITION}
        onClose={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show back of Omen card" }),
    );

    expect(
      screen.getByRole("button", { name: "Show front of Omen card" }),
    ).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Physical capabilities")).toBeTruthy();
    expect(screen.getByText("A test description for Omen.")).toBeTruthy();
    expect(screen.getByText("A test history for Omen.")).toBeTruthy();
  });

  it("flips back to the front when clicked again", () => {
    render(
      <UnitCard
        open={true}
        definition={SAMPLE_DEFINITION}
        onClose={() => {}}
      />,
    );
    const flip = () =>
      fireEvent.click(screen.getByRole("button", { name: /Show .* of Omen/ }));
    flip();
    flip();
    expect(
      screen.getByRole("button", { name: "Show back of Omen card" }),
    ).toBeTruthy();
  });

  it("does not render when open is false", () => {
    render(
      <UnitCard
        open={false}
        definition={SAMPLE_DEFINITION}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render when definition is null", () => {
    render(<UnitCard open={true} definition={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onClose when the dialog close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <UnitCard
        open={true}
        definition={SAMPLE_DEFINITION}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
