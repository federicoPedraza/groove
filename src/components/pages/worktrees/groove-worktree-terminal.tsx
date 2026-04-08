import "@xterm/xterm/css/xterm.css";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import type { IDisposable, ITerminalOptions } from "@xterm/xterm";

import { Button } from "@/src/components/ui/button";
import { toast } from "@/src/lib/toast";
import { detectTerminalInstanceKind } from "@/src/lib/utils/worktree/process-grouping";
import type { ThemeMode } from "@/src/lib/theme-constants";
import {
  getThemeMode,
  grooveTerminalClose,
  openExternalUrl,
  grooveTerminalGetSession,
  grooveTerminalListSessions,
  grooveTerminalResize,
  grooveTerminalWrite,
  listenGrooveTerminalLifecycle,
  listenGrooveTerminalOutput,
  subscribeToGlobalSettings,
  type GrooveTerminalSession,
  type WorkspaceMeta,
} from "@/src/lib/ipc";
const DARK_THEME_MODES: ReadonlySet<ThemeMode> = new Set(["lava", "earth", "dark", "dark-groove"]);

function getThemeModeSnapshot(): ThemeMode {
  return getThemeMode();
}

function getXtermTheme(mode: ThemeMode): NonNullable<ITerminalOptions["theme"]> {
  const fallbackTheme: NonNullable<ITerminalOptions["theme"]> = DARK_THEME_MODES.has(mode)
    ? {
        background: "#0f172a",
        foreground: "#f8fafc",
        cursor: "#84cc16",
        cursorAccent: "#0f172a",
        selectionBackground: "#334155",
      }
    : {
        background: "#f8fafc",
        foreground: "#0f172a",
        cursor: "#4d7c0f",
        cursorAccent: "#f8fafc",
        selectionBackground: "#dbeafe",
      };

  if (typeof document === "undefined") {
    return fallbackTheme;
  }

  const rootStyles = window.getComputedStyle(document.documentElement);
  return {
    background: rootStyles.getPropertyValue("--card").trim() || fallbackTheme.background,
    foreground: rootStyles.getPropertyValue("--card-foreground").trim() || fallbackTheme.foreground,
    cursor: rootStyles.getPropertyValue("--primary").trim() || fallbackTheme.cursor,
    cursorAccent: rootStyles.getPropertyValue("--card").trim() || fallbackTheme.cursorAccent,
    selectionBackground: rootStyles.getPropertyValue("--accent").trim() || fallbackTheme.selectionBackground,
  };
}

type GrooveWorktreeTerminalProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  runningSessionIds?: string[];
};

type GrooveTerminalPaneProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  sessionId: string;
  themeMode: ThemeMode;
  autoFocus?: boolean;
};

type SplitTerminalPaneProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  session: GrooveTerminalSession;
  instanceLabel: string;
  themeMode: ThemeMode;
  isClosing: boolean;
  onClose: (sessionId: string) => void;
  autoFocus?: boolean;
};

type DecoratedSession = {
  session: GrooveTerminalSession;
  instanceLabel: string;
};

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 768px)";
const MIN_TERMINAL_HEIGHT_PX = 320;

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const updateMatch = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateMatch);

    return () => {
      mediaQuery.removeEventListener("change", updateMatch);
    };
  }, []);

  return isDesktop;
}

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
  themeMode,
  autoFocus = false,
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
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: getXtermTheme(getThemeMode()),
    });
    const clipboardAddon = new ClipboardAddon();
    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    terminal.loadAddon(clipboardAddon);
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = "11";
    terminalRef.current = terminal;
    clipboardAddonRef.current = clipboardAddon;
    fitAddonRef.current = fitAddon;

    let webglAddon: WebglAddon | null = null;
    let webglContextLossDisposable: IDisposable | null = null;
    const disposeWebglAddon = () => {
      if (webglContextLossDisposable) {
        webglContextLossDisposable.dispose();
        webglContextLossDisposable = null;
      }

      if (webglAddon) {
        webglAddon.dispose();
        webglAddon = null;
      }
    };

    const container = containerRef.current;
    if (container) {
      terminal.open(container);

      try {
        webglAddon = new WebglAddon();
        webglContextLossDisposable = webglAddon.onContextLoss(() => {
          disposeWebglAddon();
        });
        terminal.loadAddon(webglAddon);
      } catch (error) {
        disposeWebglAddon();
        console.warn("Failed to initialize xterm WebGL addon; falling back to default renderer.", error);
      }

      fitAddon.fit();
      terminal.refresh(0, terminal.rows - 1);
      if (autoFocus) {
        terminal.focus();
      }
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      const isModified = event.ctrlKey || event.metaKey;
      if (!isModified) {
        return true;
      }

      if ((event.key === "=" || event.key === "+") && !event.shiftKey) {
        const nextSize = Math.min((terminal.options.fontSize ?? 12) + 1, 28);
        terminal.options.fontSize = nextSize;
        fitAddon.fit();
        return false;
      }

      if (event.key === "-" && !event.shiftKey) {
        const nextSize = Math.max((terminal.options.fontSize ?? 12) - 1, 6);
        terminal.options.fontSize = nextSize;
        fitAddon.fit();
        return false;
      }

      if (event.key === "0" && !event.shiftKey) {
        terminal.options.fontSize = 12;
        fitAddon.fit();
        return false;
      }

      if (event.key.toLowerCase() === "c" && !event.shiftKey && terminal.hasSelection()) {
        const selectedText = terminal.getSelection();
        if (typeof navigator.clipboard?.writeText !== "function") {
          console.warn("Clipboard API unavailable; terminal selection was not copied");
          return false;
        }

        void navigator.clipboard.writeText(selectedText).then(() => {
          terminal.clearSelection();
        }).catch((error: unknown) => {
          console.warn("Failed to copy terminal selection", { error });
        });
        return false;
      }

      return true;
    });

    terminal.loadAddon(new WebLinksAddon((_event, url) => {
      const normalizedUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
      void openExternalUrl(normalizedUrl)
        .then((response) => {
          if (!response.ok) {
            console.warn("Failed to open terminal URL", { url: normalizedUrl, error: response.error });
          }
        })
        .catch((error: unknown) => {
          console.warn("Failed to open terminal URL", { url: normalizedUrl, error });
        });
    }));

    return () => {
      clearBufferedOutput();
      terminalRef.current = null;
      clipboardAddonRef.current = null;
      fitAddonRef.current = null;
      disposeWebglAddon();
      terminal.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- autoFocus is only applied on initial mount
  }, [clearBufferedOutput]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = getXtermTheme(themeMode);
    terminal.refresh(0, terminal.rows - 1);
  }, [themeMode]);

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

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            terminal.refresh(0, terminal.rows - 1);
            fitAddon.fit();
          }
        }
      },
      { threshold: 0.1 },
    );
    visibilityObserver.observe(container);

    const onFocus = () => {
      terminal.refresh(0, terminal.rows - 1);
      fitAddon.fit();
    };
    container.addEventListener("focusin", onFocus);

    return () => {
      observer.disconnect();
      visibilityObserver.disconnect();
      container.removeEventListener("focusin", onFocus);
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
    let disposed = false;
    let outputUnlisten: (() => void) | null = null;
    let lifecycleUnlisten: (() => void) | null = null;

    const cleanupOutputListener = () => {
      if (!outputUnlisten) {
        return;
      }

      const unlisten = outputUnlisten;
      outputUnlisten = null;
      unlisten();
    };

    const cleanupLifecycleListener = () => {
      if (!lifecycleUnlisten) {
        return;
      }

      const unlisten = lifecycleUnlisten;
      lifecycleUnlisten = null;
      unlisten();
    };

    void (async () => {
      const nextOutputUnlisten = await listenGrooveTerminalOutput((event) => {
        if (disposed || event.workspaceRoot !== workspaceRoot || event.worktree !== worktree || event.sessionId !== sessionId) {
          return;
        }
        hasReceivedLiveOutputRef.current = true;
        queueOutputChunk(event.chunk);
      });

      if (disposed) {
        nextOutputUnlisten();
        return;
      }

      outputUnlisten = nextOutputUnlisten;

      const nextLifecycleUnlisten = await listenGrooveTerminalLifecycle((event) => {
        if (disposed || event.workspaceRoot !== workspaceRoot || event.worktree !== worktree || event.sessionId !== sessionId) {
          return;
        }

        if (event.kind === "started") {
          hasReceivedLiveOutputRef.current = false;
          clearBufferedOutput();
          terminalRef.current?.reset();
        }
      });

      if (disposed) {
        nextLifecycleUnlisten();
        return;
      }

      lifecycleUnlisten = nextLifecycleUnlisten;
    })();

    return () => {
      disposed = true;
      cleanupOutputListener();
      cleanupLifecycleListener();
      clearBufferedOutput();
    };
  }, [clearBufferedOutput, queueOutputChunk, sessionId, workspaceRoot, worktree]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

function SplitTerminalPane({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  session,
  instanceLabel,
  themeMode,
  isClosing,
  onClose,
  autoFocus = false,
}: SplitTerminalPaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
        <span className="truncate">{instanceLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => {
            onClose(session.sessionId);
          }}
          disabled={isClosing}
          aria-label={`Close session ${session.sessionId}`}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <GrooveTerminalPane
          workspaceRoot={workspaceRoot}
          workspaceMeta={workspaceMeta}
          knownWorktrees={knownWorktrees}
          worktree={worktree}
          sessionId={session.sessionId}
          themeMode={themeMode}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}

export function GrooveWorktreeTerminal({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  runningSessionIds = [],
}: GrooveWorktreeTerminalProps) {
  const [sessions, setSessions] = useState<GrooveTerminalSession[]>([]);
  const [closingSessionIds, setClosingSessionIds] = useState<string[]>([]);
  const stableKnownWorktreesRef = useRef<string[]>(knownWorktrees);
  const knownWorktreesKey = knownWorktrees.join("\0");
  const stableKnownWorktreesKey = stableKnownWorktreesRef.current.join("\0");
  if (knownWorktreesKey !== stableKnownWorktreesKey) {
    stableKnownWorktreesRef.current = knownWorktrees;
  }
  const stableKnownWorktrees = stableKnownWorktreesRef.current;

  const terminalPayloadBase = useMemo(
    () => ({
      rootName: workspaceMeta.rootName,
      knownWorktrees: stableKnownWorktrees,
      workspaceMeta,
      worktree,
    }),
    [stableKnownWorktrees, worktree, workspaceMeta],
  );
  void runningSessionIds;
  const themeMode = useSyncExternalStore(subscribeToGlobalSettings, getThemeModeSnapshot, getThemeModeSnapshot);
  const isDesktop = useIsDesktop();

  const syncSessions = useCallback(async () => {
    const result = await grooveTerminalListSessions(terminalPayloadBase);
    if (!result.ok) {
      setSessions([]);
      return;
    }
    setSessions(result.sessions);
  }, [terminalPayloadBase]);

  useEffect(() => {
    void syncSessions();
  }, [syncSessions]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const cleanupListener = () => {
      if (!unlisten) {
        return;
      }

      const dispose = unlisten;
      unlisten = null;
      dispose();
    };

    void (async () => {
      const nextUnlisten = await listenGrooveTerminalLifecycle((event) => {
        if (disposed || event.workspaceRoot !== workspaceRoot || event.worktree !== worktree) {
          return;
        }
        void syncSessions();
      });

      if (disposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    })();

    return () => {
      disposed = true;
      cleanupListener();
    };
  }, [syncSessions, workspaceRoot, worktree]);

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

  const decoratedSessions = useMemo<DecoratedSession[]>(() => {
    const instanceCountByKind = new Map<string, number>();
    return sessions.map((session) => {
      const sessionKind = detectTerminalInstanceKind(session.command);
      const instanceIndex = (instanceCountByKind.get(sessionKind) ?? 0) + 1;
      instanceCountByKind.set(sessionKind, instanceIndex);
      const terminalName =
        sessionKind === "Terminal"
          ? "Terminal"
          : `[${String(instanceIndex)}] ${sessionKind} terminal`;
      const instanceId = session.pid ?? session.sessionId;

      return {
        session,
        instanceLabel: `${terminalName} - ${String(instanceId)}`,
      };
    });
  }, [sessions]);


  return (
    <div className="groove-worktree-terminal space-y-2">
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No active in-app sessions for this worktree.</div>
      ) : !isDesktop ? (
        <div className="space-y-3">
          {decoratedSessions.map((entry, index) => (
            <div key={entry.session.sessionId} className="h-[75vh] min-h-[280px]">
              <SplitTerminalPane
                workspaceRoot={workspaceRoot}
                workspaceMeta={workspaceMeta}
                knownWorktrees={stableKnownWorktrees}
                worktree={worktree}
                session={entry.session}
                instanceLabel={entry.instanceLabel}
                themeMode={themeMode}
                isClosing={closingSessionIds.includes(entry.session.sessionId)}
                onClose={(sessionId) => {
                  void handleCloseSplit(sessionId);
                }}
                autoFocus={index === 0}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-[75vh] space-y-2 overflow-y-auto">
          {decoratedSessions.map((entry, index) => (
            <div key={entry.session.sessionId} style={{ minHeight: `${MIN_TERMINAL_HEIGHT_PX}px`, height: "60vh" }}>
              <SplitTerminalPane
                workspaceRoot={workspaceRoot}
                workspaceMeta={workspaceMeta}
                knownWorktrees={stableKnownWorktrees}
                worktree={worktree}
                session={entry.session}
                instanceLabel={entry.instanceLabel}
                themeMode={themeMode}
                isClosing={closingSessionIds.includes(entry.session.sessionId)}
                onClose={(sessionId) => {
                  void handleCloseSplit(sessionId);
                }}
                autoFocus={index === 0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
