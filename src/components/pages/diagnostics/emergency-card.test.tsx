import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EmergencyCard } from "@/src/components/pages/diagnostics/emergency-card";

let resizeCallback: ResizeObserverCallback | null = null;

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation((callback: ResizeObserverCallback) => {
    resizeCallback = callback;
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  });
});

describe("EmergencyCard", () => {
  let onKillAllNodeAndOpencodeInstances: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onKillAllNodeAndOpencodeInstances = vi.fn();
    resizeCallback = null;
  });

  it("renders the emergency heading and description", () => {
    render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    expect(screen.getByText("Emergency")).toBeInTheDocument();
    expect(screen.getByText(/Kill all Node and OpenCode processes/)).toBeInTheDocument();
  });

  it("renders the kill button and calls handler on click", () => {
    render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    const killButton = screen.getByRole("button", { name: /kill all node/i });
    expect(killButton).not.toBeDisabled();

    fireEvent.click(killButton);
    expect(onKillAllNodeAndOpencodeInstances).toHaveBeenCalledTimes(1);
  });

  it("disables the kill button when killing is in progress", () => {
    render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={true}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    const killButton = screen.getByRole("button", { name: /kill all node/i });
    expect(killButton).toBeDisabled();
  });

  it("renders the animation pane", () => {
    const { container } = render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    const animationPane = container.querySelector("[aria-hidden='true']");
    expect(animationPane).toBeInTheDocument();
  });

  it("advances frame index via setInterval", () => {
    vi.useFakeTimers();
    render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
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
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    // Trigger the resize observer callback with an entry
    if (resizeCallback) {
      act(() => {
        resizeCallback!(
          [{ contentRect: { width: 300, height: 200 } }] as unknown as ResizeObserverEntry[],
          {} as ResizeObserver,
        );
      });
    }
  });

  it("handles ResizeObserver callback with empty entries", () => {
    render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    // Trigger with empty entries array
    if (resizeCallback) {
      act(() => {
        resizeCallback!([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      });
    }
  });

  it("changes color class on button hover", () => {
    const { container } = render(
      <EmergencyCard
        isKillingAllNodeAndOpencodeInstances={false}
        onKillAllNodeAndOpencodeInstances={onKillAllNodeAndOpencodeInstances}
      />,
    );

    const killButton = screen.getByRole("button", { name: /kill all node/i });
    // The animation pane is the div with pointer-events-none and overflow-hidden
    const animationPane = container.querySelector(".pointer-events-none") as HTMLElement;

    expect(animationPane.className).toContain("text-foreground");

    fireEvent.mouseEnter(killButton);
    expect(animationPane.className).toContain("text-red-600");

    fireEvent.mouseLeave(killButton);
    expect(animationPane.className).toContain("text-foreground");
  });
});
