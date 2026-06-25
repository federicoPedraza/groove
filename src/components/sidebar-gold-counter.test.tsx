import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarGoldCounter } from "@/src/components/sidebar-gold-counter";

afterEach(() => {
  vi.useRealTimers();
});

describe("SidebarGoldCounter", () => {
  it("renders the gold total", () => {
    render(<SidebarGoldCounter gold={1234} collapsed={false} ready />);
    expect(screen.getByText("1,234")).toBeTruthy();
  });

  it("does not animate or show a +N on the initial load", () => {
    const { container } = render(
      <SidebarGoldCounter gold={500} collapsed={false} ready />,
    );
    expect(container.textContent).not.toContain("+");
    expect(screen.getByText("500")).toBeTruthy();
  });

  it("surfaces a fading +N and rolls up to the new total on a gain", async () => {
    const { rerender } = render(
      <SidebarGoldCounter gold={100} collapsed={false} ready />,
    );

    rerender(<SidebarGoldCounter gold={175} collapsed={false} ready />);

    // The floating "+75" gain indicator appears.
    await waitFor(() => {
      expect(screen.getByText("+75")).toBeTruthy();
    });

    // The displayed total eventually settles on the new amount.
    await waitFor(() => {
      expect(screen.getByText("175")).toBeTruthy();
    });
  });

  it("snaps without a gain indicator when gold decreases", () => {
    const { rerender, container } = render(
      <SidebarGoldCounter gold={200} collapsed={false} ready />,
    );
    rerender(<SidebarGoldCounter gold={120} collapsed={false} ready />);
    expect(screen.getByText("120")).toBeTruthy();
    expect(container.textContent).not.toContain("+");
  });

  it("hides the number when collapsed but keeps the aria gold label", () => {
    render(<SidebarGoldCounter gold={42} collapsed ready />);
    expect(screen.queryByText("42")).toBeNull();
    expect(screen.getByLabelText("Gold: 42")).toBeTruthy();
  });
});
