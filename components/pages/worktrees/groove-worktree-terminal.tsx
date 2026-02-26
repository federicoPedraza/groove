import "@xterm/xterm/css/xterm.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import {
  grooveTerminalClose,
  grooveTerminalGetSession,
  grooveTerminalListSessions,
  grooveTerminalOpen,
  grooveTerminalResize,
  grooveTerminalWrite,
  listenGrooveTerminalLifecycle,
  listenGrooveTerminalOutput,
  type GrooveTerminalSession,
  type WorkspaceMeta,
} from "@/src/lib/ipc";

type GrooveWorktreeTerminalProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  target: string;
  runningSessionIds?: string[];
};

type GrooveTerminalPaneProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  sessionId: string;
};

function getValidSize(terminal: Terminal): { cols: number; rows: number } {
  const cols = Number.isFinite(terminal.cols) && terminal.cols > 0 ? terminal.cols : 120;
  const rows = Number.isFinite(terminal.rows) && terminal.rows > 0 ? terminal.rows : 34;
  return { cols, rows };
}

function GrooveTerminalPane({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  sessionId,
}: GrooveTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const clipboardAddonRef = useRef<ClipboardAddon | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputBufferRef = useRef("");
  const flushFrameRef = useRef<number | null>(null);
  const hasReceivedLiveOutputRef = useRef(false);
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const payload = useMemo(
    () => ({
      rootName: workspaceMeta.rootName,
      knownWorktrees,
      workspaceMeta,
      worktree,
      sessionId,
    }),
    [knownWorktrees, sessionId, workspaceMeta, worktree],
  );

  const flushOutputBuffer = useCallback(() => {
    flushFrameRef.current = null;
    const chunk = outputBufferRef.current;
    if (!chunk) {
      return;
    }

    outputBufferRef.current = "";
    terminalRef.current?.write(chunk);
  }, []);

  const scheduleOutputFlush = useCallback(() => {
    if (flushFrameRef.current !== null) {
      return;
    }
    flushFrameRef.current = window.requestAnimationFrame(flushOutputBuffer);
  }, [flushOutputBuffer]);

  const queueOutputChunk = useCallback(
    (chunk: string) => {
      outputBufferRef.current += chunk;
      scheduleOutputFlush();
    },
    [scheduleOutputFlush],
  );

  const clearBufferedOutput = useCallback(() => {
    outputBufferRef.current = "";
    if (flushFrameRef.current !== null) {
      window.cancelAnimationFrame(flushFrameRef.current);
      flushFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: {
        background: "#0f172a",
      },
    });
    const clipboardAddon = new ClipboardAddon();
    const fitAddon = new FitAddon();
    terminal.loadAddon(clipboardAddon);
    terminal.loadAddon(fitAddon);
    terminalRef.current = terminal;
    clipboardAddonRef.current = clipboardAddon;
    fitAddonRef.current = fitAddon;

    const container = containerRef.current;
    if (container) {
      terminal.open(container);
      fitAddon.fit();
    }

    return () => {
      clearBufferedOutput();
      terminalRef.current = null;
      clipboardAddonRef.current = null;
      fitAddonRef.current = null;
      terminal.dispose();
    };
  }, [clearBufferedOutput]);

  useEffect(() => {
    let disposed = false;
    void grooveTerminalGetSession(payload).then((result) => {
      if (!result.ok || !result.session || disposed || hasReceivedLiveOutputRef.current) {
        return;
      }

      const snapshot = result.session.snapshot ?? "";
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      clearBufferedOutput();
      terminal.reset();
      if (snapshot) {
        terminal.write(snapshot);
      }
    });

    return () => {
      disposed = true;
    };
  }, [clearBufferedOutput, payload]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    const disposable = terminal.onData((input) => {
      void grooveTerminalWrite({
        ...payload,
        input,
      });
    });

    return () => {
      disposable.dispose();
    };
  }, [payload]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const container = containerRef.current;
    if (!terminal || !fitAddon || !container) {
      return;
    }

    let resizeTimeout: number | null = null;
    let initialResizeTimeout: number | null = null;

    const applyResize = () => {
      fitAddon.fit();
      const { cols, rows } = getValidSize(terminal);
      const lastSent = lastSentSizeRef.current;
      if (lastSent && lastSent.cols === cols && lastSent.rows === rows) {
        return;
      }

      lastSentSizeRef.current = { cols, rows };
      void grooveTerminalResize({
        ...payload,
        cols,
        rows,
      });
    };

    const applyInitialResize = () => {
      if (container.clientWidth <= 0 || container.clientHeight <= 0) {
        initialResizeTimeout = window.setTimeout(applyInitialResize, 60);
        return;
      }

      applyResize();
    };

    const observer = new ResizeObserver(() => {
      if (resizeTimeout !== null) {
        window.clearTimeout(resizeTimeout);
      }
      resizeTimeout = window.setTimeout(applyResize, 40);
    });

    applyInitialResize();
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeTimeout !== null) {
        window.clearTimeout(resizeTimeout);
      }
      if (initialResizeTimeout !== null) {
        window.clearTimeout(initialResizeTimeout);
      }
      lastSentSizeRef.current = null;
    };
  }, [payload]);

  useEffect(() => {
    let mounted = true;
    let outputUnlisten: (() => void) | null = null;
    let lifecycleUnlisten: (() => void) | null = null;

    void (async () => {
      outputUnlisten = await listenGrooveTerminalOutput((event) => {
        if (!mounted || event.workspaceRoot !== workspaceRoot || event.worktree !== worktree || event.sessionId !== sessionId) {
          return;
        }
        hasReceivedLiveOutputRef.current = true;
        queueOutputChunk(event.chunk);
      });

      lifecycleUnlisten = await listenGrooveTerminalLifecycle((event) => {
        if (!mounted || event.workspaceRoot !== workspaceRoot || event.worktree !== worktree || event.sessionId !== sessionId) {
          return;
        }

        if (event.kind === "started") {
          hasReceivedLiveOutputRef.current = false;
          clearBufferedOutput();
          terminalRef.current?.reset();
        }
      });
    })();

    return () => {
      mounted = false;
      if (outputUnlisten) {
        outputUnlisten();
      }
      if (lifecycleUnlisten) {
        lifecycleUnlisten();
      }
      clearBufferedOutput();
    };
  }, [clearBufferedOutput, queueOutputChunk, sessionId, workspaceRoot, worktree]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

export function GrooveWorktreeTerminal({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  target,
  runningSessionIds = [],
}: GrooveWorktreeTerminalProps) {
  const [sessions, setSessions] = useState<GrooveTerminalSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [closingSessionIds, setClosingSessionIds] = useState<string[]>([]);

  const terminalPayloadBase = useMemo(
    () => ({
      rootName: workspaceMeta.rootName,
      knownWorktrees,
      workspaceMeta,
      worktree,
    }),
    [knownWorktrees, worktree, workspaceMeta],
  );
  const runningSessionIdSet = useMemo(() => new Set(runningSessionIds), [runningSessionIds]);

  const syncSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await grooveTerminalListSessions(terminalPayloadBase);
      if (!result.ok) {
        setSessions([]);
        return;
      }
      setSessions(result.sessions);
    } finally {
      setIsLoading(false);
    }
  }, [terminalPayloadBase]);

  useEffect(() => {
    void syncSessions();
  }, [syncSessions]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      unlisten = await listenGrooveTerminalLifecycle((event) => {
        if (!mounted || event.workspaceRoot !== workspaceRoot || event.worktree !== worktree) {
          return;
        }
        void syncSessions();
      });
    })();

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [syncSessions, workspaceRoot, worktree]);

  useEffect(() => {
    return () => {
      void (async () => {
        try {
          const result = await grooveTerminalListSessions(terminalPayloadBase);
          if (!result.ok || result.sessions.length === 0) {
            return;
          }

          await Promise.allSettled(
            result.sessions.map((session) =>
              grooveTerminalClose({
                ...terminalPayloadBase,
                sessionId: session.sessionId,
              }),
            ),
          );
        } catch {
          return;
        }
      })();
    };
  }, [terminalPayloadBase]);

  const handleNewSplit = useCallback(async () => {
    setIsStarting(true);
    try {
      const result = await grooveTerminalOpen({
        ...terminalPayloadBase,
        target,
        forceRestart: false,
        openNew: true,
      });

      if (!result.ok || !result.session) {
        toast.error(result.error ?? "Failed to start Groove terminal session.");
        return;
      }

      await syncSessions();
      toast.success("Started new split terminal session.");
    } catch {
      toast.error("Failed to start Groove terminal session.");
    } finally {
      setIsStarting(false);
    }
  }, [syncSessions, target, terminalPayloadBase]);

  const handleCloseSplit = useCallback(
    async (sessionId: string) => {
      setClosingSessionIds((previous) => (previous.includes(sessionId) ? previous : [...previous, sessionId]));
      try {
        const result = await grooveTerminalClose({
          ...terminalPayloadBase,
          sessionId,
        });

        if (!result.ok) {
          toast.error(result.error ?? "Failed to close split terminal session.");
          return;
        }

        await syncSessions();
      } catch {
        toast.error("Failed to close split terminal session.");
      } finally {
        setClosingSessionIds((previous) => previous.filter((candidate) => candidate !== sessionId));
      }
    },
    [syncSessions, terminalPayloadBase],
  );

  const hasSessions = sessions.length > 0;

  return (
    <div className="groove-worktree-terminal space-y-2">
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant={hasSessions ? "outline" : "default"} size="sm" onClick={handleNewSplit} disabled={isStarting || isLoading}>
          {hasSessions ? <Plus className="mr-1 size-4" /> : <TerminalIcon className="mr-1 size-4" />}
          {isStarting ? "Starting..." : hasSessions ? "New split" : "Start"}
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No active in-app sessions for this worktree.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map((session) => {
            const isClosing = closingSessionIds.includes(session.sessionId);
            const isRunningTerminal = runningSessionIdSet.has(session.sessionId);

            return (
              <div key={session.sessionId} className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                  <span className="truncate">
                    {isRunningTerminal ? "Running terminal" : "Terminal"} {session.sessionId.slice(0, 8)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      void handleCloseSplit(session.sessionId);
                    }}
                    disabled={isClosing}
                    aria-label={`Close session ${session.sessionId}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="h-[75vh] min-h-[280px]">
                  <GrooveTerminalPane
                    workspaceRoot={workspaceRoot}
                    workspaceMeta={workspaceMeta}
                    knownWorktrees={knownWorktrees}
                    worktree={worktree}
                    sessionId={session.sessionId}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
