import "@xterm/xterm/css/xterm.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Minus, Plus, RefreshCw, X } from "lucide-react";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import type { IDisposable, ITerminalOptions } from "@xterm/xterm";

import { Button } from "@/src/components/ui/button";
import { toast } from "@/src/lib/toast";
import { getContrastColor } from "@/src/lib/utils/get-contrast-color";
import { detectTerminalInstanceKind } from "@/src/lib/utils/worktree/process-grouping";
import type { ThemeMode } from "@/src/lib/theme-constants";
import {
  getThemeMode,
  grooveTerminalClose,
  grooveTerminalCheckActivity,
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
const DARK_THEME_MODES: ReadonlySet<ThemeMode> = new Set([
  "lava",
  "earth",
  "dark",
  "dark-groove",
]);

function getThemeModeSnapshot(): ThemeMode {
  return getThemeMode();
}

function getXtermTheme(
  mode: ThemeMode,
): NonNullable<ITerminalOptions["theme"]> {
  const fallbackTheme: NonNullable<ITerminalOptions["theme"]> =
    DARK_THEME_MODES.has(mode)
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
    background:
      rootStyles.getPropertyValue("--card").trim() || fallbackTheme.background,
    foreground:
      rootStyles.getPropertyValue("--card-foreground").trim() ||
      fallbackTheme.foreground,
    cursor:
      rootStyles.getPropertyValue("--primary").trim() || fallbackTheme.cursor,
    cursorAccent:
      rootStyles.getPropertyValue("--card").trim() ||
      fallbackTheme.cursorAccent,
    selectionBackground:
      rootStyles.getPropertyValue("--accent").trim() ||
      fallbackTheme.selectionBackground,
  };
}

type GrooveWorktreeTerminalProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  runningSessionIds?: string[];
  colorBorderClass?: string;
  colorHex?: string;
  terminalFontSize?: number;
  compactMode?: boolean;
};

type GrooveTerminalPaneProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  sessionId: string;
  themeMode: ThemeMode;
  autoFocus?: boolean;
  terminalFontSize?: number;
};

type SplitTerminalPaneProps = {
  workspaceRoot: string;
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
  worktree: string;
  session: GrooveTerminalSession;
  instancePrefix: string;
  instanceSuffix: string;
  themeMode: ThemeMode;
  isClosing: boolean;
  hasActivity: boolean;
  minimized: boolean;
  onToggleMinimize: () => void;
  onClose: (sessionId: string) => void;
  autoFocus?: boolean;
  colorBorderClass?: string;
  colorHex?: string;
  terminalFontSize?: number;
  noBorder?: boolean;
};

type DecoratedSession = {
  session: GrooveTerminalSession;
  instancePrefix: string;
  instanceSuffix: string;
};

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 768px)";
const ACTIVITY_POLL_INTERVAL_MS = 2000;
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

const ACTIVITY_FRAMES = ["●∙∙", "∙●∙", "∙∙●", "∙●∙"] as const;

function ActivityIndicator() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % ACTIVITY_FRAMES.length);
    }, 350);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return <span className="font-mono">{ACTIVITY_FRAMES[frame]}</span>;
}

function getValidSize(terminal: Terminal): { cols: number; rows: number } {
  const cols =
    Number.isFinite(terminal.cols) && terminal.cols > 0 ? terminal.cols : 120;
  const rows =
    Number.isFinite(terminal.rows) && terminal.rows > 0 ? terminal.rows : 34;
  return { cols, rows };
}

const DEFAULT_TERMINAL_FONT_SIZE = 12;

function GrooveTerminalPane({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  sessionId,
  themeMode,
  autoFocus = false,
  terminalFontSize = DEFAULT_TERMINAL_FONT_SIZE,
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
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
      fontSize: terminalFontSize,
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
        console.warn(
          "Failed to initialize xterm WebGL addon; falling back to default renderer.",
          error,
        );
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
        terminal.options.fontSize = terminalFontSize;
        fitAddon.fit();
        return false;
      }

      if (
        event.key.toLowerCase() === "c" &&
        !event.shiftKey &&
        terminal.hasSelection()
      ) {
        const selectedText = terminal.getSelection();
        if (typeof navigator.clipboard?.writeText !== "function") {
          console.warn(
            "Clipboard API unavailable; terminal selection was not copied",
          );
          return false;
        }

        void navigator.clipboard
          .writeText(selectedText)
          .then(() => {
            terminal.clearSelection();
          })
          .catch((error: unknown) => {
            console.warn("Failed to copy terminal selection", { error });
          });
        return false;
      }

      return true;
    });

    terminal.loadAddon(
      new WebLinksAddon((_event, url) => {
        const normalizedUrl =
          url.startsWith("http://") || url.startsWith("https://")
            ? url
            : `https://${url}`;
        void openExternalUrl(normalizedUrl)
          .then((response) => {
            if (!response.ok) {
              console.warn("Failed to open terminal URL", {
                url: normalizedUrl,
                error: response.error,
              });
            }
          })
          .catch((error: unknown) => {
            console.warn("Failed to open terminal URL", {
              url: normalizedUrl,
              error,
            });
          });
      }),
    );

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
      if (
        !result.ok ||
        !result.session ||
        disposed ||
        hasReceivedLiveOutputRef.current
      ) {
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
        if (
          disposed ||
          event.workspaceRoot !== workspaceRoot ||
          event.worktree !== worktree ||
          event.sessionId !== sessionId
        ) {
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

      const nextLifecycleUnlisten = await listenGrooveTerminalLifecycle(
        (event) => {
          if (
            disposed ||
            event.workspaceRoot !== workspaceRoot ||
            event.worktree !== worktree ||
            event.sessionId !== sessionId
          ) {
            return;
          }

          if (event.kind === "started") {
            hasReceivedLiveOutputRef.current = false;
            clearBufferedOutput();
            terminalRef.current?.reset();
          }
        },
      );

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
  }, [
    clearBufferedOutput,
    queueOutputChunk,
    sessionId,
    workspaceRoot,
    worktree,
  ]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

function SplitTerminalPane({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  session,
  instancePrefix,
  instanceSuffix,
  themeMode,
  isClosing,
  hasActivity,
  minimized,
  onToggleMinimize,
  onClose,
  autoFocus = false,
  colorBorderClass,
  colorHex,
  terminalFontSize,
  noBorder = false,
}: SplitTerminalPaneProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const hasColor = Boolean(colorBorderClass);
  const borderClass = noBorder ? "" : (colorBorderClass ?? "border");
  const roundingClass = hasColor || noBorder ? "" : "rounded-lg";
  const outerBorderClass = noBorder ? "" : `border ${borderClass}`;
  const headerStyle = colorHex
    ? { backgroundColor: colorHex, color: getContrastColor(colorHex) }
    : undefined;
  const headerBorderClass = noBorder ? "" : `border-b ${borderClass}`;
  const headerClassName = colorHex
    ? `flex items-center justify-between ${headerBorderClass} px-2 py-1.5 text-xs`
    : `flex items-center justify-between ${headerBorderClass} bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground`;

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden ${roundingClass} ${outerBorderClass} ${minimized ? "h-auto" : "h-full"}`}
    >
      <div className={headerClassName} style={headerStyle}>
        <span className="truncate">
          {instancePrefix}
          {!hasActivity ? (
            "[Idle] "
          ) : (
            <>
              [<ActivityIndicator />]{" "}
            </>
          )}
          {instanceSuffix}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              setRefreshKey((prev) => prev + 1);
            }}
            aria-label={`Refresh session ${session.sessionId}`}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggleMinimize}
            aria-label={
              minimized
                ? `Maximize session ${session.sessionId}`
                : `Minimize session ${session.sessionId}`
            }
          >
            {minimized ? (
              <Plus className="size-3.5" />
            ) : (
              <Minus className="size-3.5" />
            )}
          </Button>
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
      </div>
      {!minimized && (
        <div className="min-h-0 flex-1">
          <GrooveTerminalPane
            key={refreshKey}
            workspaceRoot={workspaceRoot}
            workspaceMeta={workspaceMeta}
            knownWorktrees={knownWorktrees}
            worktree={worktree}
            sessionId={session.sessionId}
            themeMode={themeMode}
            autoFocus={autoFocus}
            terminalFontSize={terminalFontSize}
          />
        </div>
      )}
    </div>
  );
}

export function GrooveWorktreeTerminal({
  workspaceRoot,
  workspaceMeta,
  knownWorktrees,
  worktree,
  runningSessionIds = [],
  colorBorderClass,
  colorHex,
  terminalFontSize,
  compactMode = false,
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
  const [activityBySession, setActivityBySession] = useState<
    Record<string, boolean>
  >({});
  const [minimizedSessions, setMinimizedSessions] = useState<Set<string>>(
    new Set(),
  );

  const toggleMinimize = useCallback((sessionId: string) => {
    setMinimizedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);
  void runningSessionIds;
  const themeMode = useSyncExternalStore(
    subscribeToGlobalSettings,
    getThemeModeSnapshot,
    getThemeModeSnapshot,
  );
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
    if (sessions.length === 0) {
      return;
    }

    let disposed = false;
    const pollActivity = async () => {
      const result = await grooveTerminalCheckActivity(terminalPayloadBase);
      if (disposed || !result.ok) {
        return;
      }

      const next: Record<string, boolean> = {};
      for (const entry of result.entries) {
        next[entry.sessionId] = entry.hasActivity;
      }
      setActivityBySession(next);
    };

    void pollActivity();
    const interval = window.setInterval(() => {
      void pollActivity();
    }, ACTIVITY_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [sessions, terminalPayloadBase]);

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
        if (
          disposed ||
          event.workspaceRoot !== workspaceRoot ||
          event.worktree !== worktree
        ) {
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
      setClosingSessionIds((previous) =>
        previous.includes(sessionId) ? previous : [...previous, sessionId],
      );
      try {
        const result = await grooveTerminalClose({
          ...terminalPayloadBase,
          sessionId,
        });

        if (!result.ok) {
          toast.error(
            result.error ?? "Failed to close split terminal session.",
          );
          return;
        }

        await syncSessions();
      } catch {
        toast.error("Failed to close split terminal session.");
      } finally {
        setClosingSessionIds((previous) =>
          previous.filter((candidate) => candidate !== sessionId),
        );
      }
    },
    [syncSessions, terminalPayloadBase],
  );

  const decoratedSessions = useMemo<DecoratedSession[]>(() => {
    return sessions.map((session, index) => {
      const sessionKind = detectTerminalInstanceKind(session.command);
      const instanceId = session.pid ?? session.sessionId;
      const suffix =
        sessionKind === "Terminal"
          ? `Terminal - ${String(instanceId)}`
          : `${sessionKind} terminal - ${String(instanceId)}`;

      return {
        session,
        instancePrefix: `[${String(index + 1)}] `,
        instanceSuffix: suffix,
      };
    });
  }, [sessions]);

  const hasColor = Boolean(colorBorderClass);
  const wrapperClass = hasColor
    ? "groove-worktree-terminal rounded-b-lg overflow-hidden"
    : "groove-worktree-terminal space-y-2";
  const emptyBorderClass = hasColor
    ? `rounded-b-lg border border-t-0 ${colorBorderClass} border-dashed`
    : "rounded-lg border border-dashed";

  const renderSplitPane = (entry: DecoratedSession, index: number) => {
    const isMinimized = minimizedSessions.has(entry.session.sessionId);
    return (
      <SplitTerminalPane
        workspaceRoot={workspaceRoot}
        workspaceMeta={workspaceMeta}
        knownWorktrees={stableKnownWorktrees}
        worktree={worktree}
        session={entry.session}
        instancePrefix={entry.instancePrefix}
        instanceSuffix={entry.instanceSuffix}
        themeMode={themeMode}
        isClosing={closingSessionIds.includes(entry.session.sessionId)}
        hasActivity={activityBySession[entry.session.sessionId] ?? false}
        minimized={isMinimized}
        onToggleMinimize={() => {
          toggleMinimize(entry.session.sessionId);
        }}
        onClose={(sessionId) => {
          void handleCloseSplit(sessionId);
        }}
        autoFocus={index === 0}
        colorBorderClass={colorBorderClass}
        colorHex={colorHex}
        terminalFontSize={terminalFontSize}
        noBorder={compactMode}
      />
    );
  };

  if (compactMode) {
    return (
      <div className="groove-worktree-terminal h-full">
        {sessions.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No active in-app sessions for this worktree.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {decoratedSessions.map((entry, index) => {
              const isMinimized = minimizedSessions.has(
                entry.session.sessionId,
              );
              return (
                <div
                  key={entry.session.sessionId}
                  className={isMinimized ? "" : "min-h-0 flex-1"}
                >
                  {renderSplitPane(entry, index)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {sessions.length === 0 ? (
        <div
          className={`${emptyBorderClass} px-3 py-6 text-center text-sm text-muted-foreground`}
        >
          No active in-app sessions for this worktree.
        </div>
      ) : !isDesktop ? (
        <div className={hasColor ? "" : "space-y-3"}>
          {decoratedSessions.map((entry, index) => {
            const isMinimized = minimizedSessions.has(entry.session.sessionId);
            return (
              <div
                key={entry.session.sessionId}
                className={isMinimized ? "" : "h-[75vh] min-h-[280px]"}
              >
                {renderSplitPane(entry, index)}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={
            hasColor
              ? "max-h-[75vh] overflow-y-auto"
              : "max-h-[75vh] space-y-2 overflow-y-auto"
          }
        >
          {decoratedSessions.map((entry, index) => {
            const isMinimized = minimizedSessions.has(entry.session.sessionId);
            return (
              <div
                key={entry.session.sessionId}
                style={
                  isMinimized
                    ? undefined
                    : {
                        minHeight: `${MIN_TERMINAL_HEIGHT_PX}px`,
                        height: "60vh",
                      }
                }
              >
                {renderSplitPane(entry, index)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
