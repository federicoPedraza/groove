import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardHeader } from "@/src/components/pages/dashboard/dashboard-header";

function renderHeader(
  overrides: Partial<Parameters<typeof DashboardHeader>[0]> = {},
) {
  const props = {
    isBusy: false,
    isCreatePending: false,
    onCreate: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<DashboardHeader {...props} />);
  return props;
}

describe("DashboardHeader", () => {
  it("renders the heading and description", () => {
    renderHeader();
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(
      screen.getByText("Manage worktrees and runtime state."),
    ).toBeTruthy();
  });

  it("renders create worktree button", () => {
    renderHeader();
    expect(screen.getByText("Create worktree")).toBeTruthy();
  });

  it("renders refresh button with aria-label", () => {
    renderHeader();
    expect(screen.getByLabelText("Refresh")).toBeTruthy();
  });

  it("calls onCreate when create button is clicked", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByText("Create worktree"));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it("calls onRefresh when refresh button is clicked", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByLabelText("Refresh"));
    expect(props.onRefresh).toHaveBeenCalledOnce();
  });

  it("disables create button when isBusy is true", () => {
    renderHeader({ isBusy: true });
    const button = screen.getByText("Create worktree").closest("button");
    expect(button?.disabled).toBe(true);
  });

  it("disables create button when isCreatePending is true", () => {
    renderHeader({ isCreatePending: true });
    const button = screen.getByText("Create worktree").closest("button");
    expect(button?.disabled).toBe(true);
  });

  it("disables refresh button when isBusy is true", () => {
    renderHeader({ isBusy: true });
    const button = screen.getByLabelText("Refresh");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows spinner icon when isBusy is true", () => {
    const { container } = render(
      <DashboardHeader
        isBusy={true}
        isCreatePending={false}
        onCreate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("does not show spinner when isBusy is false", () => {
    const { container } = render(
      <DashboardHeader
        isBusy={false}
        isCreatePending={false}
        onCreate={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
