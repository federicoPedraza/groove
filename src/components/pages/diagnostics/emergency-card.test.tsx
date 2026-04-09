import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EmergencyCard } from "@/src/components/pages/diagnostics/emergency-card";

let resizeCallback: ResizeObserverCallback | null = null;

beforeAll(() => {
  global.ResizeObserver = vi
    .fn()
    .mockImplementation((callback: ResizeObserverCallback) => {
      resizeCallback = callback;
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });
});

describe("EmergencyCard", () => {
  let onKillAllNodeInstances: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onKillAllNodeInstances = vi.fn();
    resizeCallback = null;
  });

  it("renders the emergency heading and description", () => {
    render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    expect(screen.getByText("Emergency")).toBeInTheDocument();
    expect(screen.getByText(/Kill all Node processes/)).toBeInTheDocument();
  });

  it("renders the kill button and calls handler on click", () => {
    render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    const killButton = screen.getByRole("button", { name: /kill all node/i });
    expect(killButton).not.toBeDisabled();

    fireEvent.click(killButton);
    expect(onKillAllNodeInstances).toHaveBeenCalledTimes(1);
  });

  it("disables the kill button when killing is in progress", () => {
    render(
      <EmergencyCard
        isKillingAllNodeInstances={true}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    const killButton = screen.getByRole("button", { name: /kill all node/i });
    expect(killButton).toBeDisabled();
  });

  it("renders the animation pane", () => {
    const { container } = render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    const animationPane = container.querySelector("[aria-hidden='true']");
    expect(animationPane).toBeInTheDocument();
  });

  it("advances frame index via setInterval", () => {
    vi.useFakeTimers();
    render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    // Advance time to trigger the interval callback
    act(() => {
      vi.advanceTimersByTime(180 * 3);
    });

    vi.useRealTimers();
  });

  it("handles ResizeObserver callback with entries", () => {
    render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    // Trigger the resize observer callback with an entry
    if (resizeCallback) {
      act(() => {
        resizeCallback!(
          [
            { contentRect: { width: 300, height: 200 } },
          ] as unknown as ResizeObserverEntry[],
          {} as ResizeObserver,
        );
      });
    }
  });

  it("handles ResizeObserver callback with empty entries", () => {
    render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    // Trigger with empty entries array
    if (resizeCallback) {
      act(() => {
        resizeCallback!(
          [] as unknown as ResizeObserverEntry[],
          {} as ResizeObserver,
        );
      });
    }
  });

  it("changes color class on button hover", () => {
    const { container } = render(
      <EmergencyCard
        isKillingAllNodeInstances={false}
        onKillAllNodeInstances={onKillAllNodeInstances}
      />,
    );

    const killButton = screen.getByRole("button", { name: /kill all node/i });
    // The animation pane is the div with pointer-events-none and overflow-hidden
    const animationPane = container.querySelector(
      ".pointer-events-none",
    ) as HTMLElement;

    expect(animationPane.className).toContain("text-foreground");

    fireEvent.mouseEnter(killButton);
    expect(animationPane.className).toContain("text-red-600");

    fireEvent.mouseLeave(killButton);
    expect(animationPane.className).toContain("text-foreground");
  });
});
