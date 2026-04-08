import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardState } from "@/src/components/pages/dashboard/hooks/use-dashboard-state";
import type { WorktreeRow } from "@/src/components/pages/dashboard/types";
import type { WorkspaceContextResponse } from "@/src/lib/ipc";

const {
  workspaceGetActiveMock,
  grooveListMock,
  grooveTerminalCloseMock,
  grooveTerminalListSessionsMock,
  grooveStopMock,
  listenGrooveTerminalLifecycleMock,
  grooveTerminalLifecycleHandlerRef,
  workspacePickAndOpenMock,
  workspaceOpenMock,
  grooveRestoreMock,
  grooveNewMock,
  grooveRmMock,
  workspaceClearActiveMock,
  workspaceOpenTerminalMock,
  workspaceOpenWorkspaceTerminalMock,
  workspaceEventsMock,
  listenWorkspaceChangeMock,
  listenWorkspaceReadyMock,
  listenGrooveNotificationMock,
  workspaceGitignoreSanityCheckMock,
  workspaceGitignoreSanityApplyMock,
} = vi.hoisted(() => ({
  workspaceGetActiveMock: vi.fn<() => Promise<WorkspaceContextResponse>>(),
  grooveListMock: vi.fn(),
  grooveTerminalCloseMock: vi.fn(),
  grooveTerminalListSessionsMock: vi.fn(),
  grooveStopMock: vi.fn(),
  listenGrooveTerminalLifecycleMock: vi.fn(),
  grooveTerminalLifecycleHandlerRef: {
    current: null as null | ((event: { workspaceRoot: string; worktree: string; sessionId: string; kind: "started" | "closed" | "error" }) => void),
  },
  workspacePickAndOpenMock: vi.fn(),
  workspaceOpenMock: vi.fn(),
  grooveRestoreMock: vi.fn(),
  grooveNewMock: vi.fn(),
  grooveRmMock: vi.fn(),
  workspaceClearActiveMock: vi.fn(),
  workspaceOpenTerminalMock: vi.fn(),
  workspaceOpenWorkspaceTerminalMock: vi.fn(),
  workspaceEventsMock: vi.fn(),
  listenWorkspaceChangeMock: vi.fn(),
  listenWorkspaceReadyMock: vi.fn(),
  listenGrooveNotificationMock: vi.fn(),
  workspaceGitignoreSanityCheckMock: vi.fn(),
  workspaceGitignoreSanityApplyMock: vi.fn(),
}));

vi.mock("@/src/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/src/lib/utils/sound", () => ({ playNotificationSound: vi.fn() }));

vi.mock("@/src/lib/ipc", () => ({
  GROOVE_PLAY_COMMAND_SENTINEL: "__groove_terminal__",
  isTelemetryEnabled: vi.fn(() => false),
  grooveList: grooveListMock,
  grooveNew: grooveNewMock,
  grooveRestore: grooveRestoreMock,
  grooveRm: grooveRmMock,
  grooveStop: grooveStopMock,
  grooveTerminalClose: grooveTerminalCloseMock,
  grooveTerminalListSessions: grooveTerminalListSessionsMock,
  listenGrooveTerminalLifecycle: listenGrooveTerminalLifecycleMock,
  listenGrooveNotification: listenGrooveNotificationMock,
  listenWorkspaceChange: listenWorkspaceChangeMock,
  listenWorkspaceReady: listenWorkspaceReadyMock,
  workspaceClearActive: workspaceClearActiveMock,
  workspaceEvents: workspaceEventsMock,
  workspaceGetActive: workspaceGetActiveMock,
  workspaceGitignoreSanityApply: workspaceGitignoreSanityApplyMock,
  workspaceGitignoreSanityCheck: workspaceGitignoreSanityCheckMock,
  workspaceOpen: workspaceOpenMock,
  workspaceOpenTerminal: workspaceOpenTerminalMock,
  workspaceOpenWorkspaceTerminal: workspaceOpenWorkspaceTerminalMock,
  workspacePickAndOpen: workspacePickAndOpenMock,
}));

describe("useDashboardState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    workspaceGetActiveMock.mockReset();
    grooveListMock.mockReset();
    grooveTerminalCloseMock.mockReset();
    grooveTerminalListSessionsMock.mockReset();
    grooveStopMock.mockReset();
    listenGrooveTerminalLifecycleMock.mockReset();
    grooveTerminalLifecycleHandlerRef.current = null;
    workspacePickAndOpenMock.mockReset();
    workspaceOpenMock.mockReset();
    grooveRestoreMock.mockReset();
    grooveNewMock.mockReset();
    grooveRmMock.mockReset();
    workspaceClearActiveMock.mockReset();
    workspaceOpenTerminalMock.mockReset();
    workspaceOpenWorkspaceTerminalMock.mockReset();
    workspaceEventsMock.mockReset();
    listenWorkspaceChangeMock.mockReset();
    listenWorkspaceReadyMock.mockReset();
    listenGrooveNotificationMock.mockReset();
    workspaceGitignoreSanityCheckMock.mockReset();
    workspaceGitignoreSanityApplyMock.mockReset();

    // Set defaults
    grooveListMock.mockResolvedValue({ ok: true, rows: {}, stdout: "", stderr: "" });
    grooveTerminalCloseMock.mockResolvedValue({ ok: true });
    grooveTerminalListSessionsMock.mockResolvedValue({ ok: true, sessions: [] });
    grooveStopMock.mockResolvedValue({ ok: true });
    workspacePickAndOpenMock.mockResolvedValue({ cancelled: true, ok: false, rows: [] });
    workspaceOpenMock.mockResolvedValue({ ok: true, rows: [] });
    grooveRestoreMock.mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    grooveNewMock.mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    grooveRmMock.mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    workspaceClearActiveMock.mockResolvedValue({ ok: true });
    workspaceOpenTerminalMock.mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    workspaceOpenWorkspaceTerminalMock.mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });
    workspaceEventsMock.mockResolvedValue({ ok: true });
    listenWorkspaceChangeMock.mockResolvedValue(() => {});
    listenWorkspaceReadyMock.mockResolvedValue(() => {});
    listenGrooveNotificationMock.mockResolvedValue(() => {});
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
    });
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
      patched: false,
    });
    listenGrooveTerminalLifecycleMock.mockImplementation(async (handler) => {
      grooveTerminalLifecycleHandlerRef.current = handler;
      return () => {
        if (grooveTerminalLifecycleHandlerRef.current === handler) {
          grooveTerminalLifecycleHandlerRef.current = null;
        }
      };
    });

    // Default clipboard mock
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
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

  // ---- Helper ----
  const WORKSPACE_META = {
    version: 1,
    rootName: "groove",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    playGrooveCommand: "__groove_terminal__",
  };

  const ACTIVE_RESPONSE: WorkspaceContextResponse = {
    ok: true,
    workspaceRoot: "/repo/groove",
    repositoryRemoteUrl: "https://example.com/repo.git",
    workspaceMeta: WORKSPACE_META,
    hasWorktreesDirectory: true,
    rows: [
      {
        worktree: "feature-alpha",
        branchGuess: "feature/alpha",
        path: "/repo/groove/.worktrees/feature-alpha",
        status: "paused",
      },
    ],
  };

  function setupActiveWorkspace(overrides?: Partial<WorkspaceContextResponse>) {
    const response = { ...ACTIVE_RESPONSE, ...overrides };
    workspaceGetActiveMock.mockResolvedValue(response);
    // workspaceOpen is used by rescan; return same shape
    workspaceOpenMock.mockResolvedValue(response);
    grooveListMock.mockResolvedValue({ ok: true, rows: {}, stdout: "", stderr: "" });
  }

  it("closes all terminal sessions when running stop action", async () => {
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
    grooveTerminalListSessionsMock.mockResolvedValueOnce({
      ok: true,
      sessions: [
        { sessionId: "session-1", workspaceRoot: "/repo/groove", worktree: "feature-alpha" },
        { sessionId: "session-2", workspaceRoot: "/repo/groove", worktree: "feature-alpha" },
      ],
    });
    grooveTerminalCloseMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.runtimeStateByWorktree["feature-alpha"]?.opencodeState).toBe("running");
    });

    const row = result.current.worktreeRows[0];
    expect(row).toBeDefined();

    let stopResult: boolean | undefined;
    await act(async () => {
      stopResult = await result.current.runStopAction(row!);
    });

    expect(stopResult).toBe(true);
    expect(grooveTerminalCloseMock).toHaveBeenCalledTimes(2);
    expect(grooveTerminalCloseMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1" }),
    );
    expect(grooveTerminalCloseMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-2" }),
    );
  });

  // ======================================================
  // workspaceGetActive error paths
  // ======================================================

  it("sets errorMessage when workspaceGetActive returns ok: false", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: false,
      error: "Something broke",
      rows: [],
    } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.isWorkspaceHydrating).toBe(false);
    });

    expect(result.current.errorMessage).toBe("Something broke");
  });

  it("sets errorMessage when workspaceGetActive throws", async () => {
    workspaceGetActiveMock.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.isWorkspaceHydrating).toBe(false);
    });

    expect(result.current.errorMessage).toBe("Failed to restore active workspace.");
  });

  it("clears workspace state when workspaceGetActive returns ok without workspaceRoot", async () => {
    workspaceGetActiveMock.mockResolvedValue({
      ok: true,
      workspaceRoot: null,
      rows: [],
    } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.isWorkspaceHydrating).toBe(false);
    });

    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.worktreeRows).toEqual([]);
  });

  // ======================================================
  // pickDirectory / workspacePickAndOpen flow
  // ======================================================

  it("pickDirectory applies workspace context on successful pick", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const pickedResponse: WorkspaceContextResponse = {
      ok: true,
      workspaceRoot: "/repo/picked",
      repositoryRemoteUrl: "https://example.com/picked.git",
      workspaceMeta: { ...WORKSPACE_META, rootName: "picked" },
      hasWorktreesDirectory: true,
      rows: [],
    };
    workspacePickAndOpenMock.mockResolvedValue(pickedResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.pickDirectory();
    });

    expect(result.current.activeWorkspace?.workspaceRoot).toBe("/repo/picked");
    expect(result.current.statusMessage).toContain("picked");
    expect(result.current.recentDirectories).toContain("/repo/picked");
  });

  it("pickDirectory does nothing when user cancels", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);
    workspacePickAndOpenMock.mockResolvedValue({ cancelled: true, ok: false, rows: [] });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.pickDirectory();
    });

    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it("pickDirectory sets error when result is not ok and not cancelled", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);
    workspacePickAndOpenMock.mockResolvedValue({ cancelled: false, ok: false, error: "bad dir", rows: [] });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.pickDirectory();
    });

    expect(result.current.errorMessage).toBe("bad dir");
  });

  it("pickDirectory sets error when workspacePickAndOpen throws", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);
    workspacePickAndOpenMock.mockRejectedValue(new Error("fs error"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.pickDirectory();
    });

    expect(result.current.errorMessage).toBe("Unable to pick workspace directory.");
  });

  // ======================================================
  // openRecentDirectory / workspaceOpen flow
  // ======================================================

  it("openRecentDirectory applies workspace context on success", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const openedResponse: WorkspaceContextResponse = {
      ok: true,
      workspaceRoot: "/repo/recent",
      repositoryRemoteUrl: "https://example.com/recent.git",
      workspaceMeta: { ...WORKSPACE_META, rootName: "recent" },
      hasWorktreesDirectory: true,
      rows: [],
    };
    workspaceOpenMock.mockResolvedValue(openedResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.openRecentDirectory("/repo/recent");
    });

    expect(result.current.activeWorkspace?.workspaceRoot).toBe("/repo/recent");
    expect(result.current.statusMessage).toContain("recent");
  });

  it("openRecentDirectory sets error when result is not ok", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);
    workspaceOpenMock.mockResolvedValue({ ok: false, error: "not found", rows: [] });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.openRecentDirectory("/repo/missing");
    });

    expect(result.current.errorMessage).toBe("not found");
  });

  it("openRecentDirectory sets error on exception", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);
    workspaceOpenMock.mockRejectedValue(new Error("crash"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.openRecentDirectory("/repo/bad");
    });

    expect(result.current.errorMessage).toBe("Unable to open selected recent directory.");
  });

  it("openRecentDirectory does nothing for empty string", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.openRecentDirectory("   ");
    });

    // workspaceOpen may have been called during hydration; but not for the empty path
    const calls = workspaceOpenMock.mock.calls.filter(
      (call: unknown[]) => call[0] === "   " || call[0] === "",
    );
    expect(calls).toHaveLength(0);
  });

  // ======================================================
  // runRestoreAction
  // ======================================================

  it("runRestoreAction shows success toast and rescans on success", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runRestoreAction(row);
    });

    expect(grooveRestoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ worktree: "feature-alpha" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Restore completed.");
  });

  it("runRestoreAction shows error toast on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRestoreMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "err" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runRestoreAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Restore failed.");
  });

  it("runRestoreAction shows error toast on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRestoreMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runRestoreAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Restore request failed.");
  });

  // ======================================================
  // runCreateWorktreeAction
  // ======================================================

  it("runCreateWorktreeAction creates worktree and rescans on success", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runCreateWorktreeAction({ branchOverride: "feature/new" });
    });

    expect(grooveNewMock).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "feature/new" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Worktree created.");
    expect(result.current.isCreateModalOpen).toBe(false);
  });

  it("runCreateWorktreeAction shows error when branch is empty", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.runCreateWorktreeAction({ branchOverride: "  " });
    });

    expect(grooveNewMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Branch name is required.");
  });

  it("runCreateWorktreeAction shows error toast on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveNewMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.runCreateWorktreeAction({ branchOverride: "feature/x" });
    });

    expect(toast.error).toHaveBeenCalledWith("Create worktree failed.");
  });

  it("runCreateWorktreeAction shows error toast on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveNewMock.mockRejectedValue(new Error("kaboom"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.runCreateWorktreeAction({ branchOverride: "feature/y" });
    });

    expect(toast.error).toHaveBeenCalledWith("Create worktree request failed.");
  });

  // ======================================================
  // runCutGrooveAction
  // ======================================================

  it("runCutGrooveAction shows success toast on successful cut", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runCutGrooveAction(row);
    });

    expect(grooveRmMock).toHaveBeenCalledWith(
      expect.objectContaining({ target: "feature-alpha", worktree: "feature-alpha" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Cut groove completed.");
  });

  it("runCutGrooveAction prompts force retry on modified files error", async () => {
    setupActiveWorkspace();
    grooveRmMock.mockResolvedValue({
      ok: false,
      exitCode: 1,
      stdout: "contains modified or untracked files",
      stderr: "use --force to delete it",
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runCutGrooveAction(row);
    });

    expect(result.current.forceCutConfirmRow).toEqual(row);
  });

  it("runCutGrooveAction shows force success message", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runCutGrooveAction(row, true);
    });

    expect(grooveRmMock).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
    expect(toast.success).toHaveBeenCalledWith("Cut groove completed with force deletion.");
  });

  it("runCutGrooveAction shows error toast on failure without force retry", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRmMock.mockResolvedValue({
      ok: false,
      exitCode: 1,
      stdout: "some other error",
      stderr: "",
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runCutGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Cut groove failed.");
  });

  it("runCutGrooveAction shows error toast on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRmMock.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runCutGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Cut groove request failed.");
  });

  // ======================================================
  // runForgetAllDeletedWorktreesAction
  // ======================================================

  it("runForgetAllDeletedWorktreesAction cuts all deleted rows", async () => {
    setupActiveWorkspace({
      rows: [
        { worktree: "alive", branchGuess: "main", path: "/repo/groove/.worktrees/alive", status: "paused" },
        { worktree: "gone1", branchGuess: "gone/1", path: "/repo/groove/.worktrees/gone1", status: "deleted" },
        { worktree: "gone2", branchGuess: "gone/2", path: "/repo/groove/.worktrees/gone2", status: "deleted" },
      ],
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBe(3));

    await act(async () => {
      await result.current.runForgetAllDeletedWorktreesAction();
    });

    // grooveRm called once per deleted row
    expect(grooveRmMock).toHaveBeenCalledTimes(2);
    expect(grooveRmMock).toHaveBeenCalledWith(expect.objectContaining({ target: "gone1" }));
    expect(grooveRmMock).toHaveBeenCalledWith(expect.objectContaining({ target: "gone2" }));
  });

  it("runForgetAllDeletedWorktreesAction does nothing when no deleted rows", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runForgetAllDeletedWorktreesAction();
    });

    expect(grooveRmMock).not.toHaveBeenCalled();
  });

  // ======================================================
  // runPlayGrooveAction
  // ======================================================

  it("runPlayGrooveAction sentinel mode shows in-app terminal toast on success", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(grooveRestoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "go", target: "feature/alpha" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Started Groove in-app terminal.");
  });

  it("runPlayGrooveAction custom mode shows opencode toast on success", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace({
      workspaceMeta: { ...WORKSPACE_META, playGrooveCommand: "custom-cmd" },
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.success).toHaveBeenCalledWith("Opened opencode in terminal.");
  });

  it("runPlayGrooveAction sentinel mode shows specific error on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRestoreMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "", error: "pty failed" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to start Groove in-app terminal: pty failed");
  });

  it("runPlayGrooveAction custom mode shows play groove failed on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace({
      workspaceMeta: { ...WORKSPACE_META, playGrooveCommand: "custom-cmd" },
    });
    grooveRestoreMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Play groove failed.");
  });

  it("runPlayGrooveAction shows error toast on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRestoreMock.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Groove in-app terminal start request failed.");
  });

  // ======================================================
  // runOpenWorktreeTerminalAction / runOpenWorkspaceTerminalAction
  // ======================================================

  it("runOpenWorktreeTerminalAction opens terminal for specific worktree", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runOpenWorktreeTerminalAction("feature-alpha");
    });

    expect(workspaceOpenTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({ worktree: "feature-alpha" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Opened terminal.");
  });

  it("runOpenWorktreeTerminalAction shows error when no worktree provided", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.runOpenWorktreeTerminalAction(undefined);
    });

    expect(toast.error).toHaveBeenCalledWith("Select a worktree before opening a terminal.");
  });

  it("runOpenWorktreeTerminalAction shows error on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    workspaceOpenTerminalMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runOpenWorktreeTerminalAction("feature-alpha");
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to open terminal.");
  });

  it("runOpenWorktreeTerminalAction shows error on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    workspaceOpenTerminalMock.mockRejectedValue(new Error("crash"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runOpenWorktreeTerminalAction("feature-alpha");
    });

    expect(toast.error).toHaveBeenCalledWith("Terminal open request failed.");
  });

  it("runOpenWorkspaceTerminalAction opens workspace terminal on success", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runOpenWorkspaceTerminalAction();
    });

    expect(workspaceOpenWorkspaceTerminalMock).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Opened terminal.");
  });

  it("runOpenWorkspaceTerminalAction shows error when no workspace meta", async () => {
    const { toast } = await import("@/src/lib/toast");
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    await act(async () => {
      await result.current.runOpenWorkspaceTerminalAction();
    });

    expect(toast.error).toHaveBeenCalledWith("Select a directory before opening a terminal.");
  });

  it("runOpenWorkspaceTerminalAction shows error on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    workspaceOpenWorkspaceTerminalMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runOpenWorkspaceTerminalAction();
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to open terminal.");
  });

  it("runOpenWorkspaceTerminalAction shows error on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    workspaceOpenWorkspaceTerminalMock.mockRejectedValue(new Error("crash"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.runOpenWorkspaceTerminalAction();
    });

    expect(toast.error).toHaveBeenCalledWith("Terminal open request failed.");
  });

  // ======================================================
  // closeCurrentWorkspace
  // ======================================================

  it("closeCurrentWorkspace clears active workspace and shows toast", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.closeCurrentWorkspace();
    });

    expect(workspaceClearActiveMock).toHaveBeenCalled();
    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.worktreeRows).toEqual([]);
    expect(result.current.statusMessage).toBe("Workspace closed. Select a directory to continue.");
    expect(toast.success).toHaveBeenCalledWith("Current workspace closed.");
  });

  it("closeCurrentWorkspace shows error when workspaceClearActive returns not ok", async () => {
    setupActiveWorkspace();
    workspaceClearActiveMock.mockResolvedValue({ ok: false, error: "lock conflict" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.closeCurrentWorkspace();
    });

    expect(result.current.errorMessage).toBe("lock conflict");
  });

  it("closeCurrentWorkspace shows error on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    workspaceClearActiveMock.mockRejectedValue(new Error("oops"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.closeCurrentWorkspace();
    });

    expect(result.current.errorMessage).toBe("Failed to fully clear workspace session. Try again.");
    expect(toast.error).toHaveBeenCalledWith("Failed to close current workspace.");
  });

  // ======================================================
  // copyBranchName
  // ======================================================

  it("copyBranchName writes to clipboard and sets copiedBranchPath", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.copyBranchName(row);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("feature/alpha");
    expect(result.current.copiedBranchPath).toBe(row.path);
  });

  it("copyBranchName shows error toast when clipboard fails", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.copyBranchName(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to copy branch name.");
  });

  // ======================================================
  // applyGitignoreSanityPatch
  // ======================================================

  it("applyGitignoreSanityPatch sets status when patched", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
      patched: true,
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.applyGitignoreSanityPatch();
    });

    expect(result.current.gitignoreSanityStatusMessage).toBe("Applied Groove .gitignore sanity patch.");
  });

  it("applyGitignoreSanityPatch sets status when already applied", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
      patched: false,
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.applyGitignoreSanityPatch();
    });

    expect(result.current.gitignoreSanityStatusMessage).toBe("Groove .gitignore sanity patch is already applied.");
  });

  it("applyGitignoreSanityPatch sets not applicable message", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: false,
      hasGrooveEntry: false,
      hasWorkspaceEntry: false,
      missingEntries: [],
      patched: false,
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.applyGitignoreSanityPatch();
    });

    expect(result.current.gitignoreSanityStatusMessage).toBe("No .gitignore found in the active workspace.");
  });

  it("applyGitignoreSanityPatch sets error on failure", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: false,
      error: "permission denied",
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.applyGitignoreSanityPatch();
    });

    expect(result.current.gitignoreSanityErrorMessage).toBe("permission denied");
  });

  it("applyGitignoreSanityPatch sets error on exception", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityApplyMock.mockRejectedValue(new Error("crash"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.applyGitignoreSanityPatch();
    });

    expect(result.current.gitignoreSanityErrorMessage).toBe("Failed to apply .gitignore sanity patch.");
  });

  it("applyGitignoreSanityPatch includes patchedWorktree in message when present", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityApplyMock.mockResolvedValue({
      ok: true,
      isApplicable: true,
      hasGrooveEntry: true,
      hasWorkspaceEntry: true,
      missingEntries: [],
      patched: true,
      patchedWorktree: "feature-alpha",
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await act(async () => {
      await result.current.applyGitignoreSanityPatch();
    });

    expect(result.current.gitignoreSanityStatusMessage).toContain("feature-alpha");
    expect(result.current.gitignoreSanityStatusMessage).toContain("Play Groove");
  });

  // ======================================================
  // refreshWorktrees
  // ======================================================

  it("refreshWorktrees calls rescan with force and schedules runtime fetch", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    // Clear previous calls from hydration
    workspaceOpenMock.mockClear();

    await act(async () => {
      await result.current.refreshWorktrees();
    });

    // rescanWorktrees calls workspaceOpen internally
    expect(workspaceOpenMock).toHaveBeenCalledWith("/repo/groove");
  });

  // ======================================================
  // isCreateModalOpen / createBranch / createBase state
  // ======================================================

  it("exposes setters for create modal state", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    expect(result.current.isCreateModalOpen).toBe(false);
    expect(result.current.createBranch).toBe("");
    expect(result.current.createBase).toBe("");

    act(() => {
      result.current.setIsCreateModalOpen(true);
      result.current.setCreateBranch("feature/test");
      result.current.setCreateBase("main");
    });

    expect(result.current.isCreateModalOpen).toBe(true);
    expect(result.current.createBranch).toBe("feature/test");
    expect(result.current.createBase).toBe("main");
  });

  // ======================================================
  // gitignoreSanity state management
  // ======================================================

  it("loads gitignore sanity check when workspace is active", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    // The sanity check is loaded automatically on workspace hydration
    await waitFor(() => {
      expect(workspaceGitignoreSanityCheckMock).toHaveBeenCalled();
    });

    expect(result.current.gitignoreSanity).not.toBeNull();
    expect(result.current.gitignoreSanityErrorMessage).toBeNull();
  });

  it("sets gitignore sanity error when check returns not ok", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityCheckMock.mockResolvedValue({
      ok: false,
      error: "no gitignore",
    });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await waitFor(() => {
      expect(result.current.gitignoreSanityErrorMessage).toBe("no gitignore");
    });
    expect(result.current.gitignoreSanity).toBeNull();
  });

  it("sets gitignore sanity error when check throws", async () => {
    setupActiveWorkspace();
    workspaceGitignoreSanityCheckMock.mockRejectedValue(new Error("crash"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.activeWorkspace).not.toBeNull());

    await waitFor(() => {
      expect(result.current.gitignoreSanityErrorMessage).toBe("Failed to check .gitignore sanity.");
    });
  });

  // ======================================================
  // Workspace event listeners / rescan logic
  // ======================================================

  it("sets up listenWorkspaceChange and listenWorkspaceReady when workspace active", async () => {
    setupActiveWorkspace();

    renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(listenWorkspaceReadyMock).toHaveBeenCalled();
      expect(listenWorkspaceChangeMock).toHaveBeenCalled();
      expect(workspaceEventsMock).toHaveBeenCalled();
    });
  });

  it("shows realtime unavailable message when workspaceEvents fails", async () => {
    setupActiveWorkspace();
    workspaceEventsMock.mockResolvedValue({ ok: false, error: "not supported" });

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.statusMessage).toContain("Realtime updates are unavailable");
    });
  });

  it("shows realtime unavailable message when event listener setup throws", async () => {
    setupActiveWorkspace();
    listenWorkspaceReadyMock.mockRejectedValue(new Error("listen failed"));

    const { result } = renderHook(() => useDashboardState());

    await waitFor(() => {
      expect(result.current.statusMessage).toContain("Realtime updates are unavailable");
    });
  });

  // ======================================================
  // cutConfirmRow / forceCutConfirmRow / isCloseWorkspaceConfirmOpen setters
  // ======================================================

  it("exposes setters for confirm dialogs", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;

    act(() => {
      result.current.setCutConfirmRow(row);
    });
    expect(result.current.cutConfirmRow).toEqual(row);

    act(() => {
      result.current.setForceCutConfirmRow(row);
    });
    expect(result.current.forceCutConfirmRow).toEqual(row);

    act(() => {
      result.current.setIsCloseWorkspaceConfirmOpen(true);
    });
    expect(result.current.isCloseWorkspaceConfirmOpen).toBe(true);
  });

  // ======================================================
  // forceCutConfirmLoading derived state
  // ======================================================

  it("forceCutConfirmLoading is false when no force cut pending", async () => {
    setupActiveWorkspace();

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    expect(result.current.forceCutConfirmLoading).toBe(false);
  });

  // ======================================================
  // Recent directories from localStorage
  // ======================================================

  it("reads recent directories from localStorage on mount", async () => {
    window.localStorage.setItem(
      "groove:recent-directories",
      JSON.stringify(["/prev/dir1", "/prev/dir2"]),
    );
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    expect(result.current.recentDirectories).toEqual(["/prev/dir1", "/prev/dir2"]);
  });

  it("runPlayGrooveAction does nothing when workspaceMeta is null", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    // workspaceMeta is null since workspace has no meta
    await act(async () => {
      await result.current.runPlayGrooveAction({
        worktree: "feature-alpha",
        branchGuess: "feature/alpha",
        path: "/repo/groove/.worktrees/feature-alpha",
        status: "paused",
      } as WorktreeRow);
    });

    expect(grooveRestoreMock).not.toHaveBeenCalled();
  });

  it("runPlayGrooveAction custom mode shows error with result.error on failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace({
      workspaceMeta: { ...WORKSPACE_META, playGrooveCommand: "custom-cmd" },
    });
    grooveRestoreMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "", error: "custom error" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Play groove failed: custom error");
  });

  it("runPlayGrooveAction sentinel mode shows generic error when no result.error", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveRestoreMock.mockResolvedValue({ ok: false, exitCode: 1, stdout: "", stderr: "" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to start Groove in-app terminal.");
  });

  it("runPlayGrooveAction custom mode shows error toast on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace({
      workspaceMeta: { ...WORKSPACE_META, playGrooveCommand: "custom-cmd" },
    });
    grooveRestoreMock.mockRejectedValue(new Error("net-fail"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    await act(async () => {
      await result.current.runPlayGrooveAction(row);
    });

    expect(toast.error).toHaveBeenCalledWith("Play groove request failed.");
  });

  it("runStopAction returns false when workspaceMeta is null", async () => {
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    let stopResult: boolean | undefined;
    await act(async () => {
      stopResult = await result.current.runStopAction({
        worktree: "feature-alpha",
        branchGuess: "feature/alpha",
        path: "/repo/.worktrees/feature-alpha",
        status: "paused",
      } as WorktreeRow);
    });

    expect(stopResult).toBe(false);
    expect(grooveTerminalListSessionsMock).not.toHaveBeenCalled();
  });

  it("runStopAction shows error on terminal list failure", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveTerminalListSessionsMock.mockResolvedValue({ ok: false, error: "Session list failed" });

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    let stopResult: boolean | undefined;
    await act(async () => {
      stopResult = await result.current.runStopAction(row);
    });

    expect(stopResult).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Session list failed");
  });

  it("runStopAction shows generic error toast on exception", async () => {
    const { toast } = await import("@/src/lib/toast");
    setupActiveWorkspace();
    grooveTerminalListSessionsMock.mockRejectedValue(new Error("crash"));

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.worktreeRows.length).toBeGreaterThan(0));

    const row = result.current.worktreeRows[0]!;
    let stopResult: boolean | undefined;
    await act(async () => {
      stopResult = await result.current.runStopAction(row);
    });

    expect(stopResult).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Stop request failed.");
  });

  it("handles invalid localStorage gracefully", async () => {
    window.localStorage.setItem("groove:recent-directories", "not-json!!!");
    workspaceGetActiveMock.mockResolvedValue({ ok: true, rows: [] } as unknown as WorkspaceContextResponse);

    const { result } = renderHook(() => useDashboardState());
    await waitFor(() => expect(result.current.isWorkspaceHydrating).toBe(false));

    expect(result.current.recentDirectories).toEqual([]);
  });

});
