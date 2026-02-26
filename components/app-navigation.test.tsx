import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNavigation } from "@/components/app-navigation";

const {
  grooveListMock,
  subscribeToGlobalSettingsMock,
  testingEnvironmentGetStatusMock,
  workspaceGetActiveMock,
} = vi.hoisted(() => ({
  grooveListMock: vi.fn(),
  subscribeToGlobalSettingsMock: vi.fn((onStoreChange: () => void) => {
    void onStoreChange;
    return () => {};
  }),
  testingEnvironmentGetStatusMock: vi.fn(),
  workspaceGetActiveMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  grooveList: grooveListMock,
  isGrooveLoadingSectionDisabled: vi.fn(() => false),
  isShowFpsEnabled: vi.fn(() => false),
  isTelemetryEnabled: vi.fn(() => false),
  listenGrooveTerminalLifecycle: vi.fn(async () => () => {}),
  listenWorkspaceChange: vi.fn(async () => () => {}),
  listenWorkspaceReady: vi.fn(async () => () => {}),
  subscribeToGlobalSettings: subscribeToGlobalSettingsMock,
  testingEnvironmentGetStatus: testingEnvironmentGetStatusMock,
  workspaceGetActive: workspaceGetActiveMock,
}));

describe("AppNavigation", () => {
  beforeEach(() => {
    grooveListMock.mockReset();
    subscribeToGlobalSettingsMock.mockClear();
    testingEnvironmentGetStatusMock.mockReset();
    workspaceGetActiveMock.mockReset();

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
      rows: {},
      stdout: "",
      stderr: "",
    });
    testingEnvironmentGetStatusMock.mockResolvedValue({
      ok: true,
      environments: [],
      status: "none",
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
});
