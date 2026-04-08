import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HelpModal } from "@/src/components/pages/help/help-modal";

describe("HelpModal", () => {
  let onOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onOpenChange = vi.fn();
  });

  it("renders modal content when open", () => {
    render(<HelpModal open={true} onOpenChange={onOpenChange} />);

    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByAltText("No help available")).toBeInTheDocument();
  });

  it("does not render modal content when closed", () => {
    render(<HelpModal open={false} onOpenChange={onOpenChange} />);

    expect(screen.queryByText("Help")).not.toBeInTheDocument();
  });

  it("renders the help image with correct src", () => {
    render(<HelpModal open={true} onOpenChange={onOpenChange} />);

    const image = screen.getByAltText("No help available");
    expect(image).toHaveAttribute("src", "/nohelp.jpg");
  });

  it("calls onOpenChange when close button is clicked", () => {
    render(<HelpModal open={true} onOpenChange={onOpenChange} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
