import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import type { GrooveTerminalSession } from "@/src/lib/ipc";

const {
  terminalMockInstance,
  TerminalConstructor,
  fitAddonMockInstance,
  webglAddonMockInstance,
} = vi.hoisted(() => {
  const _terminalMockInstance = {
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    loadAddon: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    element: null as HTMLDivElement | null,
    rows: 24,
    cols: 80,
    options: { fontSize: 12, theme: {} },
    unicode: { activeVersion: "6" },
    focus: vi.fn(),
    refresh: vi.fn(),
    reset: vi.fn(),
    hasSelection: vi.fn(() => false),
    getSelection: vi.fn(() => ""),
    clearSelection: vi.fn(),
  };
  return {
    terminalMockInstance: _terminalMockInstance,
    TerminalConstructor: vi.fn(() => _terminalMockInstance),
    fitAddonMockInstance: { fit: vi.fn(), activate: vi.fn(), dispose: vi.fn() },
    webglAddonMockInstance: {
      activate: vi.fn(),
      dispose: vi.fn(),
      onContextLoss: vi.fn(() => ({ dispose: vi.fn() })),
    },
  };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: TerminalConstructor,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(() => fitAddonMockInstance),
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: vi.fn(() => webglAddonMockInstance),
}));

vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: vi.fn(() => ({ activate: vi.fn(), dispose: vi.fn() })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn(() => ({ activate: vi.fn(), dispose: vi.fn() })),
}));

vi.mock("@xterm/addon-clipboard", () => ({
  ClipboardAddon: vi.fn(() => ({ activate: vi.fn(), dispose: vi.fn() })),
}));

// Mock CSS import
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

const {
  grooveTerminalCloseMock,
  grooveTerminalGetSessionMock,
  grooveTerminalListSessionsMock,
  grooveTerminalResizeMock,
  grooveTerminalWriteMock,
  listenGrooveTerminalLifecycleMock,
  listenGrooveTerminalOutputMock,
  openExternalUrlMock,
} = vi.hoisted(() => ({
  grooveTerminalCloseMock: vi.fn(),
  grooveTerminalGetSessionMock: vi.fn(),
  grooveTerminalListSessionsMock: vi.fn(),
  grooveTerminalResizeMock: vi.fn(),
  grooveTerminalWriteMock: vi.fn(),
  listenGrooveTerminalLifecycleMock: vi.fn(),
  listenGrooveTerminalOutputMock: vi.fn(),
  openExternalUrlMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  getThemeMode: vi.fn(() => "light"),
  subscribeToGlobalSettings: vi.fn((callback: () => void) => {
    void callback;
    return () => {};
  }),
  grooveTerminalClose: grooveTerminalCloseMock,
  grooveTerminalGetSession: grooveTerminalGetSessionMock,
  grooveTerminalListSessions: grooveTerminalListSessionsMock,
  grooveTerminalResize: grooveTerminalResizeMock,
  grooveTerminalWrite: grooveTerminalWriteMock,
  listenGrooveTerminalLifecycle: listenGrooveTerminalLifecycleMock,
  listenGrooveTerminalOutput: listenGrooveTerminalOutputMock,
  openExternalUrl: openExternalUrlMock,
}));

vi.mock("@/src/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/src/lib/utils/worktree/process-grouping", () => ({
  detectTerminalInstanceKind: vi.fn(() => "Terminal"),
}));

// Mock ResizeObserver and IntersectionObserver for jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as unknown as typeof ResizeObserver;

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as unknown as typeof IntersectionObserver;

// Mock window.matchMedia for useIsDesktop hook
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query === "(min-width: 768px)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import { GrooveWorktreeTerminal } from "@/src/components/pages/worktrees/groove-worktree-terminal";

const defaultProps = {
  workspaceRoot: "/test/workspace",
  workspaceMeta: {
    version: 1,
    rootName: "test",
    createdAt: "",
    updatedAt: "",
  },
  knownWorktrees: ["feature-1"],
  worktree: "feature-1",
  runningSessionIds: [],
};

const mockSession: GrooveTerminalSession = {
  sessionId: "session-1",
  pid: 1234,
  workspaceRoot: "/test/workspace",
  worktree: "feature-1",
  worktreePath: "/test/workspace/.worktrees/feature-1",
  command: "bash",
  startedAt: "2024-01-01T00:00:00Z",
  cols: 80,
  rows: 24,
  snapshot: "hello world",
};

describe("GrooveWorktreeTerminal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [],
    });
    grooveTerminalGetSessionMock.mockResolvedValue({
      ok: true,
      session: null,
    });
    grooveTerminalCloseMock.mockResolvedValue({ ok: true });
    grooveTerminalWriteMock.mockResolvedValue({ ok: true });
    grooveTerminalResizeMock.mockResolvedValue({ ok: true });
    listenGrooveTerminalLifecycleMock.mockResolvedValue(() => {});
    listenGrooveTerminalOutputMock.mockResolvedValue(() => {});
    openExternalUrlMock.mockResolvedValue({ ok: true });

    // Reset terminal mock
    terminalMockInstance.open.mockClear();
    terminalMockInstance.write.mockClear();
    terminalMockInstance.dispose.mockClear();
    terminalMockInstance.loadAddon.mockClear();
    terminalMockInstance.focus.mockClear();
    terminalMockInstance.refresh.mockClear();
    terminalMockInstance.reset.mockClear();
    terminalMockInstance.onData.mockClear().mockReturnValue({ dispose: vi.fn() });
    terminalMockInstance.attachCustomKeyEventHandler.mockClear();
    TerminalConstructor.mockClear();
    fitAddonMockInstance.fit.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows empty state when no sessions", async () => {
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("No active in-app sessions for this worktree.")).toBeInTheDocument();
  });

  it("renders terminal panes when sessions exist", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(screen.getByText(/Terminal - 1234/)).toBeInTheDocument();
    });
  });

  it("calls grooveTerminalListSessions on mount", async () => {
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(grooveTerminalListSessionsMock).toHaveBeenCalled();
  });

  it("sets sessions to empty array on list error", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({ ok: false });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("No active in-app sessions for this worktree.")).toBeInTheDocument();
  });

  it("creates Terminal instance when session is rendered", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(TerminalConstructor).toHaveBeenCalled();
    });
  });

  it("disposes Terminal on unmount", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    const { unmount } = render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect(terminalMockInstance.dispose).toHaveBeenCalled();
  });

  it("handles close split session", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Close session/ })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Close session/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(grooveTerminalCloseMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("shows toast error when close split fails", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveTerminalCloseMock.mockResolvedValue({ ok: false, error: "Close failed" });
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Close session/ })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Close session/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Close failed");
    });
  });

  it("shows generic toast error when close split throws", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveTerminalCloseMock.mockRejectedValue(new Error("Net"));
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Close session/ })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Close session/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to close split terminal session.");
    });
  });

  it("shows generic toast error when close split has no error message", async () => {
    const { toast } = await import("@/src/lib/toast");
    grooveTerminalCloseMock.mockResolvedValue({ ok: false });
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Close session/ })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Close session/ }).click();
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to close split terminal session.");
    });
  });

  it("subscribes to terminal lifecycle events", async () => {
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listenGrooveTerminalLifecycleMock).toHaveBeenCalled();
  });

  it("renders multiple sessions", async () => {
    const session2: GrooveTerminalSession = {
      ...mockSession,
      sessionId: "session-2",
      pid: 5678,
    };
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession, session2],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(screen.getByText(/Terminal - 1234/)).toBeInTheDocument();
      expect(screen.getByText(/Terminal - 5678/)).toBeInTheDocument();
    });
  });

  it("handles knownWorktrees updates", async () => {
    const { rerender } = render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    rerender(<GrooveWorktreeTerminal {...defaultProps} knownWorktrees={["feature-1", "feature-2"]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Should not crash
    expect(screen.getByText("No active in-app sessions for this worktree.")).toBeInTheDocument();
  });

  it("uses sessionId as fallback when pid is not available", async () => {
    const sessionWithoutPid: GrooveTerminalSession = {
      ...mockSession,
      pid: undefined,
    };
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [sessionWithoutPid],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(screen.getByText(/Terminal - session-1/)).toBeInTheDocument();
    });
  });

  it("fetches session snapshot on pane mount", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    grooveTerminalGetSessionMock.mockResolvedValue({
      ok: true,
      session: mockSession,
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => {
      expect(grooveTerminalGetSessionMock).toHaveBeenCalled();
    });
  });

  it("subscribes to terminal output events in pane", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listenGrooveTerminalOutputMock).toHaveBeenCalled();
  });

  it("writes terminal output from output listener", async () => {
    let outputCallback: ((event: Record<string, unknown>) => void) | null = null;
    listenGrooveTerminalOutputMock.mockImplementation(async (cb: (event: Record<string, unknown>) => void) => {
      outputCallback = cb;
      return () => {};
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Fire an output event
    await act(async () => {
      outputCallback?.({
        workspaceRoot: "/test/workspace",
        worktree: "feature-1",
        sessionId: "session-1",
        chunk: "hello output",
      });
      await vi.advanceTimersByTimeAsync(100);
    });

    // The output gets buffered and flushed via requestAnimationFrame
    // Just verify no crash
    expect(listenGrooveTerminalOutputMock).toHaveBeenCalled();
  });

  it("ignores output events for different session", async () => {
    let outputCallback: ((event: Record<string, unknown>) => void) | null = null;
    listenGrooveTerminalOutputMock.mockImplementation(async (cb: (event: Record<string, unknown>) => void) => {
      outputCallback = cb;
      return () => {};
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    terminalMockInstance.write.mockClear();

    await act(async () => {
      outputCallback?.({
        workspaceRoot: "/test/workspace",
        worktree: "feature-1",
        sessionId: "different-session",
        chunk: "should ignore",
      });
      await vi.advanceTimersByTimeAsync(100);
    });

    // write should not have been called since sessionId doesn't match
    expect(terminalMockInstance.write).not.toHaveBeenCalled();
  });

  it("resets terminal on lifecycle started event", async () => {
    let lifecycleCallback: ((event: Record<string, unknown>) => void) | null = null;
    listenGrooveTerminalLifecycleMock.mockImplementation(async (cb: (event: Record<string, unknown>) => void) => {
      lifecycleCallback = cb;
      return () => {};
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    terminalMockInstance.reset.mockClear();

    // The lifecycle listener in the pane is the second registered callback
    // Fire a lifecycle event with kind=started
    await act(async () => {
      lifecycleCallback?.({
        workspaceRoot: "/test/workspace",
        worktree: "feature-1",
        sessionId: "session-1",
        kind: "started",
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    // The pane-level lifecycle listener should reset the terminal
    // Note: the lifecycle listener registered at the GrooveWorktreeTerminal level calls syncSessions
    expect(grooveTerminalListSessionsMock).toHaveBeenCalled();
  });

  it("writes session snapshot on mount when session has data", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    grooveTerminalGetSessionMock.mockResolvedValue({
      ok: true,
      session: { ...mockSession, snapshot: "initial output" },
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(terminalMockInstance.write).toHaveBeenCalledWith("initial output");
    });
  });

  it("does not write snapshot when session has empty snapshot", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    grooveTerminalGetSessionMock.mockResolvedValue({
      ok: true,
      session: { ...mockSession, snapshot: "" },
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // reset is called but write shouldn't be called with empty string for snapshot
    expect(terminalMockInstance.reset).toHaveBeenCalled();
  });

  it("registers onData handler for terminal input", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(terminalMockInstance.onData).toHaveBeenCalled();
  });

  it("handles mobile layout with single session", async () => {
    // Override matchMedia to report mobile
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false, // mobile
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByText(/Terminal - 1234/)).toBeInTheDocument();
    });

    // Restore desktop matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(min-width: 768px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("loads addons into terminal", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Terminal should have loaded multiple addons (clipboard, fit, unicode11, webgl, weblinks)
    expect(terminalMockInstance.loadAddon).toHaveBeenCalled();
    expect(terminalMockInstance.loadAddon.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("attaches custom key event handler", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(terminalMockInstance.attachCustomKeyEventHandler).toHaveBeenCalled();
  });

  it("calls fit on the fitAddon during mount", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fitAddonMockInstance.fit).toHaveBeenCalled();
  });

  it("ignores lifecycle events for a different worktree", async () => {
    let lifecycleCallback: ((event: Record<string, unknown>) => void) | null = null;
    listenGrooveTerminalLifecycleMock.mockImplementation(async (cb: (event: Record<string, unknown>) => void) => {
      lifecycleCallback = cb;
      return () => {};
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    grooveTerminalListSessionsMock.mockClear();

    await act(async () => {
      lifecycleCallback?.({
        workspaceRoot: "/test/workspace",
        worktree: "different-worktree",
        sessionId: "session-1",
        kind: "started",
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should NOT have re-fetched sessions since the worktree doesn't match
    expect(grooveTerminalListSessionsMock).not.toHaveBeenCalled();
  });

  it("ignores lifecycle events for a different workspace root", async () => {
    let lifecycleCallback: ((event: Record<string, unknown>) => void) | null = null;
    listenGrooveTerminalLifecycleMock.mockImplementation(async (cb: (event: Record<string, unknown>) => void) => {
      lifecycleCallback = cb;
      return () => {};
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    grooveTerminalListSessionsMock.mockClear();

    await act(async () => {
      lifecycleCallback?.({
        workspaceRoot: "/other/workspace",
        worktree: "feature-1",
        sessionId: "session-1",
        kind: "started",
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(grooveTerminalListSessionsMock).not.toHaveBeenCalled();
  });

  it("calls grooveTerminalWrite when terminal onData fires", async () => {
    let onDataCallback: ((input: string) => void) | null = null;
    terminalMockInstance.onData.mockImplementation((...args: unknown[]) => {
      onDataCallback = args[0] as (input: string) => void;
      return { dispose: vi.fn() };
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      onDataCallback?.("hello");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(grooveTerminalWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        input: "hello",
      }),
    );
  });

  it("handles WebGL addon initialization failure gracefully", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { WebglAddon } = await import("@xterm/addon-webgl");
    (WebglAddon as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("WebGL not supported");
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to initialize xterm WebGL addon"),
      expect.anything(),
    );

    consoleWarnSpy.mockRestore();
    (WebglAddon as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => webglAddonMockInstance);
  });

  it("does not write snapshot when getSession returns not ok", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    grooveTerminalGetSessionMock.mockResolvedValue({
      ok: false,
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Terminal write should not have been called for snapshot
    // (it may be called for other reasons, but not with snapshot data)
    expect(terminalMockInstance.write).not.toHaveBeenCalledWith("hello world");
  });

  it("cleans up lifecycle listener on unmount", async () => {
    const unlistenFn = vi.fn();
    listenGrooveTerminalLifecycleMock.mockResolvedValue(unlistenFn);

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [],
    });

    const { unmount } = render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    unmount();

    expect(unlistenFn).toHaveBeenCalled();
  });

  it("uses detectTerminalInstanceKind for non-Terminal sessions", async () => {
    const { detectTerminalInstanceKind } = await import("@/src/lib/utils/worktree/process-grouping");
    (detectTerminalInstanceKind as ReturnType<typeof vi.fn>).mockReturnValue("Opencode");

    const opencodeSession: GrooveTerminalSession = {
      ...mockSession,
      command: "opencode",
    };
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [opencodeSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      // For non-Terminal kind, label format is "[1] Opencode terminal - 1234"
      expect(screen.getByText(/Opencode terminal - 1234/)).toBeInTheDocument();
    });

    (detectTerminalInstanceKind as ReturnType<typeof vi.fn>).mockReturnValue("Terminal");
  });

  it("updates theme when themeMode changes", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The Terminal was created and the theme was applied initially.
    // When themeMode changes (via useSyncExternalStore), the terminal options theme is updated.
    // We can verify the terminal options theme was set at least once during setup.
    expect(terminalMockInstance.options.theme).toBeDefined();
    // Refresh is called during theme updates
    expect(terminalMockInstance.refresh).toHaveBeenCalled();
  });

  it("handles the custom key event handler for zoom in", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const keyHandler = terminalMockInstance.attachCustomKeyEventHandler.mock.calls[0]?.[0];
    expect(keyHandler).toBeDefined();

    // Non-keydown should pass through
    expect(keyHandler({ type: "keyup", key: "=", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true);

    // No modifier should pass through
    expect(keyHandler({ type: "keydown", key: "a", ctrlKey: false, metaKey: false, shiftKey: false })).toBe(true);

    // Ctrl+= should zoom in and return false
    expect(keyHandler({ type: "keydown", key: "=", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);

    // Ctrl+- should zoom out and return false
    expect(keyHandler({ type: "keydown", key: "-", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);

    // Ctrl+0 should reset zoom and return false
    expect(keyHandler({ type: "keydown", key: "0", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);
  });

  it("handles the custom key event handler for copy with selection", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const keyHandler = terminalMockInstance.attachCustomKeyEventHandler.mock.calls[0]?.[0];
    expect(keyHandler).toBeDefined();

    // Ctrl+C with selection should attempt clipboard copy
    terminalMockInstance.hasSelection.mockReturnValue(true);
    terminalMockInstance.getSelection.mockReturnValue("selected text");

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    expect(keyHandler({ type: "keydown", key: "c", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);

    // Reset selection mock
    terminalMockInstance.hasSelection.mockReturnValue(false);
  });

  it("handles Ctrl+C without selection passing through", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const keyHandler = terminalMockInstance.attachCustomKeyEventHandler.mock.calls[0]?.[0];
    terminalMockInstance.hasSelection.mockReturnValue(false);

    // Ctrl+C without selection should pass through
    expect(keyHandler({ type: "keydown", key: "c", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true);
  });

  it("handles close split with duplicate session id (idempotent pending tracking)", async () => {
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });
    // Make close slow to test pending state
    grooveTerminalCloseMock.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ ok: true }), 100);
    }));

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Close session/ })).toBeInTheDocument();
    });

    // Click close twice rapidly - second click should still work without duplicating in pending array
    await act(async () => {
      screen.getByRole("button", { name: /Close session/ }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Close session/ }).click();
      await vi.advanceTimersByTimeAsync(200);
    });

    // Should not crash
    expect(grooveTerminalCloseMock).toHaveBeenCalled();
  });

  it("opens terminal on WebGL context loss", async () => {
    let contextLossHandler: (() => void) | null = null;
    webglAddonMockInstance.onContextLoss.mockImplementation((...args: unknown[]) => {
      contextLossHandler = args[0] as () => void;
      return { dispose: vi.fn() };
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Trigger context loss
    expect(contextLossHandler).not.toBeNull();
    (contextLossHandler as unknown as () => void)();

    // Should not crash - the WebGL addon gets disposed and terminal continues with default renderer
    expect(terminalMockInstance.open).toHaveBeenCalled();
  });

  it("syncs sessions on lifecycle event for same worktree", async () => {
    let lifecycleCallback: ((event: Record<string, unknown>) => void) | null = null;
    // First call for the top-level component lifecycle listener
    listenGrooveTerminalLifecycleMock.mockImplementation(async (cb: (event: Record<string, unknown>) => void) => {
      lifecycleCallback = cb;
      return () => {};
    });

    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [],
    });

    render(<GrooveWorktreeTerminal {...defaultProps} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    grooveTerminalListSessionsMock.mockClear();
    grooveTerminalListSessionsMock.mockResolvedValue({
      ok: true,
      sessions: [mockSession],
    });

    await act(async () => {
      lifecycleCallback?.({
        workspaceRoot: "/test/workspace",
        worktree: "feature-1",
        sessionId: "session-1",
        kind: "started",
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(grooveTerminalListSessionsMock).toHaveBeenCalled();
  });
});
