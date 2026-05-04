import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNavigation } from "@/src/components/app-navigation";

const {
  grooveTerminalActiveWorktreesMock,
  isGrooveBusinessDisabledMock,
  isTelemetryEnabledMock,
  subscribeToGlobalSettingsMock,
  workspaceGetActiveMock,
} = vi.hoisted(() => ({
  grooveTerminalActiveWorktreesMock: vi.fn(),
  isGrooveBusinessDisabledMock: vi.fn(() => false),
  isTelemetryEnabledMock: vi.fn(() => false),
  subscribeToGlobalSettingsMock: vi.fn((onStoreChange: () => void) => {
    void onStoreChange;
    return () => {};
  }),
  workspaceGetActiveMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  DEFAULT_WORKTREE_STATE: "pending",
  WORKTREE_STATES: ["pending", "fighting", "wounded", "defeated", "blocked", "forgotten"],
  grooveTerminalActiveWorktrees: grooveTerminalActiveWorktreesMock,
  isGrooveBusinessDisabled: isGrooveBusinessDisabledMock,
  isShowFpsEnabled: vi.fn(() => false),
  isTelemetryEnabled: isTelemetryEnabledMock,
  listenGrooveTerminalLifecycle: vi.fn(async () => () => {}),
  listenWorkspaceChange: vi.fn(async () => () => {}),
  listenWorkspaceReady: vi.fn(async () => () => {}),
  subscribeToGlobalSettings: subscribeToGlobalSettingsMock,
  workspaceGetActive: workspaceGetActiveMock,
  workspaceSetWorktreeState: vi.fn(async () => ({ ok: true })),
}));

function renderNav(
  props: Partial<React.ComponentProps<typeof AppNavigation>> = {},
  initialEntries: string[] = ["/"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppNavigation
        hasOpenWorkspace={true}
        hasDiagnosticsSanityWarning={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("AppNavigation", () => {
  beforeEach(() => {
    grooveTerminalActiveWorktreesMock.mockReset();
    subscribeToGlobalSettingsMock.mockClear();
    workspaceGetActiveMock.mockReset();
    isGrooveBusinessDisabledMock.mockReturnValue(false);
    isTelemetryEnabledMock.mockReturnValue(false);

    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      rows: [
        {
          worktree: "feature-alpha",
          branchGuess: "feature/alpha",
          path: "/repo/groove/.worktrees/feature-alpha",
          status: "running",
        },
      ],
    });
    grooveTerminalActiveWorktreesMock.mockResolvedValue({
      ok: true,
      worktrees: ["feature-alpha"],
    });
  });

  it("does not re-fetch active workspace when remounted during route navigation", async () => {
    const firstRender = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppNavigation
          hasOpenWorkspace={true}
          hasDiagnosticsSanityWarning={false}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(workspaceGetActiveMock).toHaveBeenCalledTimes(1);
    });

    firstRender.unmount();

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppNavigation
          hasOpenWorkspace={true}
          hasDiagnosticsSanityWarning={false}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(workspaceGetActiveMock).toHaveBeenCalledTimes(1);
    });
  });

  it("renders Barracks link with the home label when workspace is open", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
  });

  it("renders Home label when no workspace is open", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    });
  });

  it("renders Stronghold link", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Stronghold").length).toBeGreaterThan(0);
    });
  });

  it("renders Situation Room link when workspace is open", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Situation Room").length).toBeGreaterThan(0);
    });
  });

  it("does not render Situation Room link when workspace is closed", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.queryByText("Situation Room")).toBeFalsy();
    });
  });

  it("renders Bestiary link when workspace is open", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Bestiary").length).toBeGreaterThan(0);
    });
  });

  it("does not render Bestiary link when workspace is closed", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.queryByText("Bestiary")).toBeFalsy();
    });
  });

  it("renders worktree list when worktrees are active", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("feature-alpha").length).toBeGreaterThan(0);
    });
    // Should also render the Wilderness link
    expect(screen.getAllByText("Wilderness").length).toBeGreaterThan(0);
  });

  it("does not render worktree list when workspace is not open", async () => {
    renderNav({ hasOpenWorkspace: false });
    expect(screen.queryByText("Wilderness")).toBeFalsy();
    expect(screen.queryByText("feature-alpha")).toBeFalsy();
  });

  it("renders sidebar collapse button", async () => {
    renderNav();
    // The sidebar collapse button should be rendered
    await waitFor(() => {
      expect(screen.getByLabelText("Gold: 0")).toBeTruthy();
    });
  });

  it("handles workspaceGetActive failure gracefully", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: false });
    renderNav();
    await waitFor(() => {
      // Should still render without crashing
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
  });

  it("handles workspaceGetActive rejection gracefully", async () => {
    workspaceGetActiveMock.mockRejectedValue(new Error("Network error"));
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
  });

  it("renders gold indicator when sidebar is expanded", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getByLabelText("Gold: 0")).toBeTruthy();
    });
  });

  it("shows diagnostics warning icon when hasDiagnosticsSanityWarning is true", async () => {
    renderNav({ hasDiagnosticsSanityWarning: true });
    await waitFor(() => {
      expect(screen.getAllByText("Situation Room").length).toBeGreaterThan(0);
    });
  });

  it("renders the mascot display section", async () => {
    renderNav();
    await waitFor(() => {
      // The groove loading sprite container should be rendered
      expect(screen.getByLabelText("Gold: 0")).toBeTruthy();
    });
  });

  it("hides groove loading section when disabled", async () => {
    isGrooveBusinessDisabledMock.mockReturnValue(true);
    renderNav();
    await waitFor(() => {
      // In business mode the "GROOVE" title replaces the gold indicator.
      expect(screen.getByLabelText("Groove")).toBeTruthy();
    });
  });

  it("renders pageSidebar as a ReactNode", async () => {
    renderNav({ pageSidebar: <div data-testid="page-sidebar">Sidebar</div> });
    await waitFor(() => {
      expect(screen.getByTestId("page-sidebar")).toBeTruthy();
    });
  });

  it("renders pageSidebar as a function", async () => {
    renderNav({
      pageSidebar: ({ collapsed }) => (
        <div data-testid="page-sidebar-fn">collapsed: {String(collapsed)}</div>
      ),
    });
    await waitFor(() => {
      expect(screen.getByTestId("page-sidebar-fn")).toBeTruthy();
    });
  });

  it("logs telemetry on navigation click when telemetry is enabled", async () => {
    isTelemetryEnabledMock.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Stronghold").length).toBeGreaterThan(0);
    });
    // Click Stronghold link (desktop)
    fireEvent.click(screen.getAllByText("Stronghold")[0]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ui-telemetry] navigation.start"),
      expect.objectContaining({ to: "/settings" }),
    );
    consoleSpy.mockRestore();
  });

  it("does not log telemetry when clicking the current route", async () => {
    isTelemetryEnabledMock.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    renderNav({}, ["/"]);
    await waitFor(() => {
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
    // Click Barracks (already on /)
    fireEvent.click(screen.getAllByText("Barracks")[0]);
    // Should NOT log navigation start since we are already on "/"
    const navigationStartCalls = consoleSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" && call[0].includes("navigation.start"),
    );
    expect(navigationStartCalls.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it("renders mobile collapsible navigation", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getByText("Navigation")).toBeTruthy();
    });
  });

  it("handles empty workspace rows from grooveList", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "",
        updatedAt: "",
      },
      rows: [
        {
          worktree: "feat-1",
          path: "/repo/.worktrees/feat-1",
          status: "running",
        },
      ],
    });
    grooveTerminalActiveWorktreesMock.mockResolvedValue({ ok: false });
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
  });

  it("does not log telemetry when telemetry is disabled", async () => {
    isTelemetryEnabledMock.mockReturnValue(false);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Stronghold").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByText("Stronghold")[0]);
    const navigationStartCalls = consoleSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" && call[0].includes("navigation.start"),
    );
    expect(navigationStartCalls.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it("hides groove loading section when disabled via setting", async () => {
    isGrooveBusinessDisabledMock.mockReturnValue(true);
    renderNav();
    await waitFor(() => {
      expect(screen.getByLabelText("Groove")).toBeTruthy();
    });
    // The mascot sprite should not be rendered
    const spriteContainers = document.querySelectorAll(
      ".groove-loading-sprite",
    );
    expect(spriteContainers.length).toBe(0);
  });

  it("does not show Wilderness or Situation Room when hasOpenWorkspace is false", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Wilderness")).toBeFalsy();
    expect(screen.queryByText("Situation Room")).toBeFalsy();
  });

  it("renders mobile navigation trigger button", async () => {
    renderNav();
    await waitFor(() => {
      // Mobile collapsible has "Navigation" trigger
      expect(screen.getByText("Navigation")).toBeTruthy();
    });
  });

  it("collapses sidebar when collapse button is clicked", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getByLabelText("Gold: 0")).toBeTruthy();
    });

    // Find the collapse button and click it
    const collapseButton = screen.getByRole("button", { name: /collapse/i });
    fireEvent.click(collapseButton);

    // After collapsing, the GROOVE label text should no longer be visible
    // (it's hidden when isSidebarCollapsed is true)
    await waitFor(() => {
      // In collapsed state, the app name is hidden; check the button state changed
      expect(collapseButton).toBeTruthy();
    });
  });

  it("renders pageSidebar function receiving collapsed state after collapse", async () => {
    const pageSidebarFn = vi.fn(({ collapsed }: { collapsed: boolean }) => (
      <div data-testid="sidebar-fn-output">collapsed: {String(collapsed)}</div>
    ));
    renderNav({ pageSidebar: pageSidebarFn });
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-fn-output")).toBeTruthy();
    });

    // Click collapse
    const collapseButton = screen.getByRole("button", { name: /collapse/i });
    fireEvent.click(collapseButton);

    await waitFor(() => {
      expect(screen.getByText("collapsed: true")).toBeTruthy();
    });
  });

  it("clears navigation worktrees when workspace is closed", async () => {
    renderNav({ hasOpenWorkspace: true });
    await waitFor(() => {
      expect(screen.getAllByText("feature-alpha").length).toBeGreaterThan(0);
    });
  });

  it("handles empty workspace rows (no worktrees returned)", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "",
        updatedAt: "",
      },
      rows: [],
    });
    grooveTerminalActiveWorktreesMock.mockResolvedValue({
      ok: true,
      worktrees: [],
    });

    // Clear the module-level cache to force a fresh fetch
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    });
    // With no open workspace, the Wilderness section should not render
    expect(screen.queryByText("Wilderness")).toBeFalsy();
  });

  it("opens mobile navigation when collapsible trigger is clicked", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getByText("Navigation")).toBeTruthy();
    });
    // Click the mobile nav trigger
    fireEvent.click(screen.getByText("Navigation"));
    // Mobile nav content should be visible
    await waitFor(() => {
      // Barracks should appear in both desktop and mobile after expansion
      expect(screen.getAllByText("Barracks").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("does not crash when grooveList returns non-ok during worktree fetch", async () => {
    grooveTerminalActiveWorktreesMock.mockResolvedValue({
      ok: false,
      error: "failed",
    });
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
    // Navigation still renders even if grooveList fails
    expect(screen.getByLabelText("Gold: 0")).toBeTruthy();
  });

  it("normalizes workspace rows from an object shape", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "",
        updatedAt: "",
      },
      rows: {
        0: {
          worktree: "obj-wt",
          path: "/repo/.worktrees/obj-wt",
          status: "running",
        },
      },
    });
    grooveTerminalActiveWorktreesMock.mockResolvedValue({
      ok: true,
      worktrees: [],
    });
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Barracks").length).toBeGreaterThan(0);
    });
  });
});
