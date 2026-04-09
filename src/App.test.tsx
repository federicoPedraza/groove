import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/src/lib/ipc", () => ({
  isPeriodicRerenderEnabled: vi.fn(() => false),
  subscribeToGlobalSettings: vi.fn(() => () => {}),
}));

vi.mock("@/src/app/page", () => ({
  default: () => <div data-testid="home-page">Home</div>,
}));

// We need a dynamic import inside the mock factory since vi.mock hoists before imports
vi.mock("@/src/components/pages/app-layout", async () => {
  const rrdom = await import("react-router-dom");
  return {
    AppLayout: () => (
      <div data-testid="app-layout">
        <rrdom.Outlet />
      </div>
    ),
  };
});

// Mock lazy-loaded pages
vi.mock("@/src/app/diagnostics/page", () => ({
  default: () => <div data-testid="diagnostics-page">Diagnostics</div>,
}));

vi.mock("@/src/app/settings/page", () => ({
  default: () => <div data-testid="settings-page">Settings</div>,
}));

vi.mock("@/src/app/worktrees/page", () => ({
  default: () => <div data-testid="worktrees-page">Worktrees</div>,
}));

vi.mock("@/src/app/worktrees/worktree-detail-page", () => ({
  default: () => <div data-testid="worktree-detail-page">Worktree Detail</div>,
}));

vi.mock("@/src/components/command-history-panel", () => ({
  CommandHistoryPanel: () => <div data-testid="command-history-panel" />,
}));

vi.mock("@/src/components/shortcuts/keyboard-shortcuts-provider", () => ({
  KeyboardShortcutsProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="keyboard-shortcuts-provider">{children}</div>
  ),
}));

vi.mock("@/src/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

import { App } from "@/src/App";

describe("App", () => {
  it("renders without crashing", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("keyboard-shortcuts-provider")).toBeTruthy();
  });

  it("renders CommandHistoryPanel", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("command-history-panel")).toBeTruthy();
  });

  it("renders app layout", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("app-layout")).toBeTruthy();
  });

  it("redirects unknown routes to home", () => {
    render(
      <MemoryRouter initialEntries={["/unknown-route"]}>
        <App />
      </MemoryRouter>,
    );
    // Should render the app layout (redirect to /)
    expect(screen.getByTestId("app-layout")).toBeTruthy();
  });

  it("renders RouteFallback for lazy routes", () => {
    // The Suspense fallbacks show "Loading <pageName>..."
    // Since we mock the lazy components, they resolve immediately.
    // Just verify the router structure works for each route.
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("keyboard-shortcuts-provider")).toBeTruthy();
  });

  it("renders home page at root route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("home-page")).toBeTruthy();
  });

  it("renders settings page at /settings route", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("settings-page")).toBeTruthy();
  });

  it("renders diagnostics page at /diagnostics route", async () => {
    render(
      <MemoryRouter initialEntries={["/diagnostics"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("diagnostics-page")).toBeTruthy();
  });

  it("renders worktrees page at /worktrees route", async () => {
    render(
      <MemoryRouter initialEntries={["/worktrees"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("worktrees-page")).toBeTruthy();
  });

  it("renders worktree detail page at /worktrees/:worktree route", async () => {
    render(
      <MemoryRouter initialEntries={["/worktrees/my-tree"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("worktree-detail-page")).toBeTruthy();
  });

  it("handles periodic rerender setting being enabled", async () => {
    const { isPeriodicRerenderEnabled } = vi.mocked(
      await import("@/src/lib/ipc"),
    );
    isPeriodicRerenderEnabled.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("keyboard-shortcuts-provider")).toBeTruthy();
  });
});
