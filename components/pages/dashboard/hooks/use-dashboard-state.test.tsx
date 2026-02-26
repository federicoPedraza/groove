import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import type { WorkspaceContextResponse } from "@/src/lib/ipc";

const {
  workspaceGetActiveMock,
  testingEnvironmentGetStatusMock,
  grooveListMock,
  grooveTerminalCloseMock,
  grooveTerminalListSessionsMock,
  grooveStopMock,
  listenGrooveTerminalLifecycleMock,
  grooveTerminalLifecycleHandlerRef,
} = vi.hoisted(() => ({
  workspaceGetActiveMock: vi.fn<() => Promise<WorkspaceContextResponse>>(),
  testingEnvironmentGetStatusMock: vi.fn(),
  grooveListMock: vi.fn(),
  grooveTerminalCloseMock: vi.fn(),
  grooveTerminalListSessionsMock: vi.fn(),
  grooveStopMock: vi.fn(),
  listenGrooveTerminalLifecycleMock: vi.fn(),
  grooveTerminalLifecycleHandlerRef: {
    current: null as null | ((event: { workspaceRoot: string; worktree: string; sessionId: string; kind: "started" | "closed" | "error" }) => void),
  },
}));

vi.mock("@/src/lib/ipc", () => ({
  GROOVE_PLAY_COMMAND_SENTINEL: "__groove_terminal__",
  isTelemetryEnabled: vi.fn(() => false),
  grooveList: grooveListMock,
  grooveNew: vi.fn(async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" })),
  grooveRestore: vi.fn(async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" })),
  grooveRm: vi.fn(async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" })),
  grooveStop: grooveStopMock,
  grooveTerminalClose: grooveTerminalCloseMock,
  grooveTerminalListSessions: grooveTerminalListSessionsMock,
  listenGrooveTerminalLifecycle: listenGrooveTerminalLifecycleMock,
  listenWorkspaceChange: vi.fn(async () => () => {}),
  listenWorkspaceReady: vi.fn(async () => () => {}),
  testingEnvironmentGetStatus: testingEnvironmentGetStatusMock,
  testingEnvironmentSetTarget: vi.fn(async () => ({ ok: true, environments: [], status: "none" })),
  testingEnvironmentStart: vi.fn(async () => ({ ok: true, environments: [], status: "none" })),
  testingEnvironmentStartSeparateTerminal: vi.fn(async () => ({ ok: true, environments: [], status: "none" })),
  testingEnvironmentStop: vi.fn(async () => ({ ok: true, environments: [], status: "none" })),
  workspaceClearActive: vi.fn(async () => ({ ok: true })),
  workspaceEvents: vi.fn(async () => ({ ok: true })),
  workspaceGetActive: workspaceGetActiveMock,
  workspaceGitignoreSanityApply: vi.fn(async () => ({
    ok: true,
    isApplicable: true,
    hasGrooveEntry: true,
    hasWorkspaceEntry: true,
    missingEntries: [],
    patched: false,
  })),
  workspaceGitignoreSanityCheck: vi.fn(async () => ({
    ok: true,
    isApplicable: true,
    hasGrooveEntry: true,
    hasWorkspaceEntry: true,
    missingEntries: [],
  })),
  workspaceOpen: vi.fn(async () => ({ ok: true, rows: [] })),
  workspaceOpenTerminal: vi.fn(async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" })),
  workspaceOpenWorkspaceTerminal: vi.fn(async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" })),
  workspacePickAndOpen: vi.fn(async () => ({ cancelled: true, ok: false, rows: [] })),
}));

describe("useDashboardState", () => {
  beforeEach(() => {
    window.localStorage.clear();
    workspaceGetActiveMock.mockReset();
    testingEnvironmentGetStatusMock.mockReset();
    grooveListMock.mockReset();
    grooveTerminalCloseMock.mockReset();
    grooveTerminalListSessionsMock.mockReset();
    grooveStopMock.mockReset();
    listenGrooveTerminalLifecycleMock.mockReset();
    grooveTerminalLifecycleHandlerRef.current = null;
    testingEnvironmentGetStatusMock.mockResolvedValue({
      ok: true,
      environments: [],
      status: "none",
    });
    grooveListMock.mockResolvedValue({ ok: true, rows: {}, stdout: "", stderr: "" });
    grooveTerminalCloseMock.mockResolvedValue({ ok: true });
    grooveTerminalListSessionsMock.mockResolvedValue({ ok: true, sessions: [] });
    grooveStopMock.mockResolvedValue({ ok: true });
    listenGrooveTerminalLifecycleMock.mockImplementation(async (handler) => {
      grooveTerminalLifecycleHandlerRef.current = handler;
      return () => {
        if (grooveTerminalLifecycleHandlerRef.current === handler) {
          grooveTerminalLifecycleHandlerRef.current = null;
        }
      };
    });
  });

  it("hydrates active workspace state and recent directories from IPC response", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: "/repo/groove",
      repositoryRemoteUrl: "https://example.com/repo.git",
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        playGrooveCommand: "__groove_terminal__",
      },
      hasWorktreesDirectory: true,
      rows: [],
    });

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.isWorkspaceHydrating).toBe(false);
    });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.activeWorkspace?.workspaceRoot).toBe("/repo/groove");
    expect(result.current.recentDirectories).toEqual(["/repo/groove"]);
    expect(testingEnvironmentGetStatusMock).toHaveBeenCalledWith({
      rootName: "groove",
      knownWorktrees: [],
      workspaceMeta: expect.objectContaining({ rootName: "groove" }),
    });
  });

  it("refreshes runtime rows after terminal lifecycle close events", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: "/repo/groove",
      repositoryRemoteUrl: "https://example.com/repo.git",
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        playGrooveCommand: "__groove_terminal__",
      },
      hasWorktreesDirectory: true,
      rows: [
        {
          worktree: "feature-alpha",
          branchGuess: "feature/alpha",
          path: "/repo/groove/.worktrees/feature-alpha",
          status: "paused",
        },
      ],
    });
    grooveListMock
      .mockResolvedValueOnce({
        ok: true,
        rows: {
          "feature-alpha": {
            branch: "feature/alpha",
            worktree: "feature-alpha",
            opencodeState: "running",
            logState: "latest",
            opencodeActivityState: "idle",
          },
        },
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        ok: true,
        rows: {
          "feature-alpha": {
            branch: "feature/alpha",
            worktree: "feature-alpha",
            opencodeState: "not-running",
            logState: "latest",
            opencodeActivityState: "idle",
          },
        },
        stdout: "",
        stderr: "",
      });

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.runtimeStateByWorktree["feature-alpha"]?.opencodeState).toBe("running");
    });

    await waitFor(() => {
      expect(listenGrooveTerminalLifecycleMock).toHaveBeenCalled();
    });

    act(() => {
      grooveTerminalLifecycleHandlerRef.current?.({
        workspaceRoot: "/repo/groove",
        worktree: "feature-alpha",
        sessionId: "session-1",
        kind: "closed",
      });
    });

    await waitFor(() => {
      expect(result.current.runtimeStateByWorktree["feature-alpha"]?.opencodeState).toBe("not-running");
    });
  });

  it("ignores terminal lifecycle refresh events while a stop action is closing sessions", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: "/repo/groove",
      repositoryRemoteUrl: "https://example.com/repo.git",
      workspaceMeta: {
        version: 1,
        rootName: "groove",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        playGrooveCommand: "__groove_terminal__",
      },
      hasWorktreesDirectory: true,
      rows: [
        {
          worktree: "feature-alpha",
          branchGuess: "feature/alpha",
          path: "/repo/groove/.worktrees/feature-alpha",
          status: "paused",
        },
      ],
    });
    grooveListMock.mockResolvedValue({
      ok: true,
      rows: {
        "feature-alpha": {
          branch: "feature/alpha",
          worktree: "feature-alpha",
          opencodeState: "running",
          logState: "latest",
          opencodeActivityState: "idle",
        },
      },
      stdout: "",
      stderr: "",
    });
    grooveTerminalListSessionsMock
      .mockResolvedValueOnce({ ok: true, sessions: [{ sessionId: "session-1", workspaceRoot: "/repo/groove", worktree: "feature-alpha" }] })
      .mockResolvedValueOnce({ ok: true, sessions: [] });
    grooveTerminalCloseMock.mockImplementation(async () => {
      grooveTerminalLifecycleHandlerRef.current?.({
        workspaceRoot: "/repo/groove",
        worktree: "feature-alpha",
        sessionId: "session-1",
        kind: "closed",
      });
      return { ok: true };
    });
    grooveStopMock.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.runtimeStateByWorktree["feature-alpha"]?.opencodeState).toBe("running");
    });

    const row = result.current.worktreeRows[0];
    expect(row).toBeDefined();
    const runtimeRow = result.current.runtimeStateByWorktree["feature-alpha"];
    const callsBeforeStop = grooveListMock.mock.calls.length;

    await act(async () => {
      await result.current.runStopAction(row!, runtimeRow);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(grooveListMock.mock.calls.length).toBe(callsBeforeStop);
  });
});
