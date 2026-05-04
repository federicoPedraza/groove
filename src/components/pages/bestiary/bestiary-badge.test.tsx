import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BestiaryBadge } from "@/src/components/pages/bestiary/bestiary-badge";

describe("BestiaryBadge", () => {
  it("renders the bug name in known mode", () => {
    render(<BestiaryBadge mode="known" name="Omen" />);
    expect(screen.getByText("Omen")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders an interactive button when known mode receives onClick", () => {
    const onClick = vi.fn();
    render(<BestiaryBadge mode="known" name="Omen" onClick={onClick} />);
    const button = screen.getByRole("button", {
      name: "Open details for Omen",
    });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a masked '? ? ?' name in hidden mode", () => {
    render(<BestiaryBadge mode="hidden" />);
    expect(screen.getByLabelText("Undiscovered bug")).toBeTruthy();
    expect(screen.getByText("? ? ?")).toBeTruthy();
    expect(screen.queryByText(/Omen/)).toBeFalsy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
