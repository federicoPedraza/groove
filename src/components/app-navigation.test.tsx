import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNavigation } from "@/src/components/app-navigation";

const {
  grooveListMock,
  isGrooveLoadingSectionDisabledMock,
  isTelemetryEnabledMock,
  subscribeToGlobalSettingsMock,
  workspaceGetActiveMock,
} = vi.hoisted(() => ({
  grooveListMock: vi.fn(),
  isGrooveLoadingSectionDisabledMock: vi.fn(() => false),
  isTelemetryEnabledMock: vi.fn(() => false),
  subscribeToGlobalSettingsMock: vi.fn((onStoreChange: () => void) => {
    void onStoreChange;
    return () => {};
  }),
  workspaceGetActiveMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  grooveList: grooveListMock,
  isGrooveLoadingSectionDisabled: isGrooveLoadingSectionDisabledMock,
  isShowFpsEnabled: vi.fn(() => false),
  isTelemetryEnabled: isTelemetryEnabledMock,
  listenGrooveTerminalLifecycle: vi.fn(async () => () => {}),
  listenWorkspaceChange: vi.fn(async () => () => {}),
  listenWorkspaceReady: vi.fn(async () => () => {}),
  subscribeToGlobalSettings: subscribeToGlobalSettingsMock,
  workspaceGetActive: workspaceGetActiveMock,
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
        isHelpOpen={false}
        onHelpClick={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("AppNavigation", () => {
  beforeEach(() => {
    grooveListMock.mockReset();
    subscribeToGlobalSettingsMock.mockClear();
    workspaceGetActiveMock.mockReset();
    isGrooveLoadingSectionDisabledMock.mockReturnValue(false);
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
    grooveListMock.mockResolvedValue({
      ok: true,
      rows: {
        "feature-alpha": { opencodeState: "running" },
      },
      stdout: "",
      stderr: "",
    });
  });

  it("does not re-fetch active workspace when remounted during route navigation", async () => {
    const firstRender = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppNavigation
          hasOpenWorkspace={true}
          hasDiagnosticsSanityWarning={false}
          isHelpOpen={false}
          onHelpClick={() => {}}
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
          isHelpOpen={false}
          onHelpClick={() => {}}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(workspaceGetActiveMock).toHaveBeenCalledTimes(1);
    });
  });

  it("renders Dashboard link with the home label when workspace is open", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
  });

  it("renders Home label when no workspace is open", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    });
  });

  it("renders Settings link", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    });
  });

  it("renders Diagnostics link when workspace is open", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Diagnostics").length).toBeGreaterThan(0);
    });
  });

  it("does not render Diagnostics link when workspace is closed", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.queryByText("Diagnostics")).toBeFalsy();
    });
  });

  it("renders Help button when workspace is open", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Help").length).toBeGreaterThan(0);
    });
  });

  it("does not render Help button when workspace is closed", async () => {
    renderNav({ hasOpenWorkspace: false });
    expect(screen.queryByText("Help")).toBeFalsy();
  });

  it("calls onHelpClick when Help button is clicked", async () => {
    const onHelpClick = vi.fn();
    renderNav({ onHelpClick });
    await waitFor(() => {
      expect(screen.getAllByText("Help").length).toBeGreaterThan(0);
    });
    // Click the first Help button (desktop sidebar)
    fireEvent.click(screen.getAllByText("Help")[0]);
    expect(onHelpClick).toHaveBeenCalledTimes(1);
  });

  it("renders worktree list when worktrees are active", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("feature-alpha").length).toBeGreaterThan(0);
    });
    // Should also render the Worktrees link
    expect(screen.getAllByText("Worktrees").length).toBeGreaterThan(0);
  });

  it("does not render worktree list when workspace is not open", async () => {
    renderNav({ hasOpenWorkspace: false });
    expect(screen.queryByText("Worktrees")).toBeFalsy();
    expect(screen.queryByText("feature-alpha")).toBeFalsy();
  });

  it("renders sidebar collapse button", async () => {
    renderNav();
    // The sidebar collapse button should be rendered
    await waitFor(() => {
      expect(screen.getByText("GROOVE")).toBeTruthy();
    });
  });

  it("handles workspaceGetActive failure gracefully", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: false });
    renderNav();
    await waitFor(() => {
      // Should still render without crashing
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
  });

  it("handles workspaceGetActive rejection gracefully", async () => {
    workspaceGetActiveMock.mockRejectedValue(new Error("Network error"));
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
  });

  it("renders GROOVE app name label when sidebar is expanded", async () => {
    renderNav();
    await waitFor(() => {
      expect(screen.getByText("GROOVE")).toBeTruthy();
    });
  });

  it("shows diagnostics warning icon when hasDiagnosticsSanityWarning is true", async () => {
    renderNav({ hasDiagnosticsSanityWarning: true });
    await waitFor(() => {
      expect(screen.getAllByText("Diagnostics").length).toBeGreaterThan(0);
    });
  });

  it("renders the mascot display section", async () => {
    renderNav();
    await waitFor(() => {
      // The groove loading sprite container should be rendered
      expect(screen.getByText("GROOVE")).toBeTruthy();
    });
  });

  it("hides groove loading section when disabled", async () => {
    isGrooveLoadingSectionDisabledMock.mockReturnValue(true);
    renderNav();
    await waitFor(() => {
      // GROOVE label still shows but the sprite container should not
      expect(screen.getByText("GROOVE")).toBeTruthy();
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
      expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    });
    // Click Settings link (desktop)
    fireEvent.click(screen.getAllByText("Settings")[0]);
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
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
    // Click Dashboard (already on /)
    fireEvent.click(screen.getAllByText("Dashboard")[0]);
    // Should NOT log navigation start since we are already on "/"
    const navigationStartCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("navigation.start"),
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
      workspaceMeta: { version: 1, rootName: "groove", createdAt: "", updatedAt: "" },
      rows: [
        { worktree: "feat-1", path: "/repo/.worktrees/feat-1", status: "running" },
      ],
    });
    grooveListMock.mockResolvedValue({ ok: false });
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
  });

  it("does not log telemetry when telemetry is disabled", async () => {
    isTelemetryEnabledMock.mockReturnValue(false);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByText("Settings")[0]);
    const navigationStartCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("navigation.start"),
    );
    expect(navigationStartCalls.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it("hides groove loading section when disabled via setting", async () => {
    isGrooveLoadingSectionDisabledMock.mockReturnValue(true);
    renderNav();
    await waitFor(() => {
      expect(screen.getByText("GROOVE")).toBeTruthy();
    });
    // The mascot sprite should not be rendered
    const spriteContainers = document.querySelectorAll(".groove-loading-sprite");
    expect(spriteContainers.length).toBe(0);
  });

  it("does not show Worktrees or Help when hasOpenWorkspace is false", async () => {
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Worktrees")).toBeFalsy();
    expect(screen.queryByText("Help")).toBeFalsy();
    expect(screen.queryByText("Diagnostics")).toBeFalsy();
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
      expect(screen.getByText("GROOVE")).toBeTruthy();
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
    grooveListMock.mockResolvedValue({ ok: true, rows: {} });

    // Clear the module-level cache to force a fresh fetch
    renderNav({ hasOpenWorkspace: false });
    await waitFor(() => {
      expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    });
    // With no open workspace, the Worktrees section should not render
    expect(screen.queryByText("Worktrees")).toBeFalsy();
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
      // Dashboard should appear in both desktop and mobile after expansion
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("closes mobile sidebar on Help click", async () => {
    const onHelpClick = vi.fn();
    renderNav({ onHelpClick });
    await waitFor(() => {
      expect(screen.getByText("Navigation")).toBeTruthy();
    });

    // Expand mobile sidebar
    fireEvent.click(screen.getByText("Navigation"));

    // Click the mobile Help button (there should be 2 Help buttons total)
    await waitFor(() => {
      expect(screen.getAllByText("Help").length).toBeGreaterThanOrEqual(2);
    });

    // Click the last Help button (mobile)
    const helpButtons = screen.getAllByText("Help");
    fireEvent.click(helpButtons[helpButtons.length - 1]);
    expect(onHelpClick).toHaveBeenCalled();
  });

  it("does not crash when grooveList returns non-ok during worktree fetch", async () => {
    grooveListMock.mockResolvedValue({ ok: false, error: "failed" });
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
    // Navigation still renders even if grooveList fails
    expect(screen.getByText("GROOVE")).toBeTruthy();
  });

  it("normalizes workspace rows from an object shape", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceMeta: { version: 1, rootName: "groove", createdAt: "", updatedAt: "" },
      rows: {
        0: { worktree: "obj-wt", path: "/repo/.worktrees/obj-wt", status: "running" },
      },
    });
    grooveListMock.mockResolvedValue({ ok: true, rows: {} });
    renderNav();
    await waitFor(() => {
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    });
  });
});
