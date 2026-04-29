import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/ipc", () => ({
  diagnosticsGetSystemOverview: vi.fn().mockResolvedValue({ ok: false }),
  grooveBinRepair: vi
    .fn()
    .mockResolvedValue({ ok: true, changed: false, status: {} }),
  grooveBinStatus: vi.fn().mockResolvedValue({ ok: true, status: {} }),
  isAlwaysShowDiagnosticsSidebarEnabled: vi.fn(() => false),
  isGrooveLoadingSectionDisabled: vi.fn(() => false),
  isShowFpsEnabled: vi.fn(() => false),
  isTelemetryEnabled: vi.fn(() => false),
  listenWorkspaceChange: vi.fn(async () => () => {}),
  listenWorkspaceReady: vi.fn(async () => () => {}),
  subscribeToGlobalSettings: vi.fn(() => () => {}),
  workspaceGetActive: vi.fn().mockResolvedValue({ ok: false }),
  workspaceGitignoreSanityCheck: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("@/src/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { AppLayout } from "@/src/components/pages/app-layout";

describe("AppLayout", () => {
  it("renders the Outlet content via PageShell", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<div>Child Route Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Child Route Content")).toBeInTheDocument();
  });

  it("renders different child routes", () => {
    render(
      <MemoryRouter initialEntries={["/other"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<div>Index</div>} />
            <Route path="other" element={<div>Other Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Other Page")).toBeInTheDocument();
    expect(screen.queryByText("Index")).not.toBeInTheDocument();
  });
});
