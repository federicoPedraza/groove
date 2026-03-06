import "@xterm/xterm/css/xterm.css";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import type { ILink, ILinkProvider, IDisposable, ITerminalOptions } from "@xterm/xterm";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { detectTerminalInstanceKind } from "@/lib/utils/worktree/process-grouping";
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
const TERMINAL_LINK_MATCHER = /(?:https?:\/\/|www\.)[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+/g;
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
};

type DecoratedSession = {
  session: GrooveTerminalSession;
  instanceLabel: string;
};

const DESKTOP_BREAKPOINT_QUERY = "(min-width: 768px)";
const HORIZONTAL_HANDLE_SIZE = 10;
const MIN_COLUMN_WIDTH_PX = 240;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
}: GrooveTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const clipboardAddonRef = useRef<ClipboardAddon | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputBufferRef = useRef("");
  const flushFrameRef = useRef<number | null>(null);
  const linkProviderDisposableRef = useRef<IDisposable | null>(null);
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
    terminal.unicode.activeVersion = "11";
    terminalRef.current = terminal;
    clipboardAddonRef.current = clipboardAddon;
    fitAddonRef.current = fitAddon;

    const container = containerRef.current;
    if (container) {
      terminal.open(container);
      fitAddon.fit();
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c" || event.shiftKey) {
        return true;
      }

      if (!terminal.hasSelection()) {
        return true;
      }

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
    });

    const openTerminalUrl = (url: string) => {
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
    };

    const linkProvider: ILinkProvider = {
      provideLinks(bufferLineNumber, callback) {
        const line = terminal.buffer.active.getLine(bufferLineNumber);
        if (!line) {
          callback(undefined);
          return;
        }

        const text = line.translateToString(false, 0, terminal.cols);
        const links: ILink[] = [];
        const regex = new RegExp(TERMINAL_LINK_MATCHER);

        let match: RegExpMatchArray | null = null;
        while ((match = regex.exec(text)) !== null) {
          const matchedUrl = match[0];
          const startColumn = match.index;
          if (startColumn === undefined) {
            continue;
          }
          const endColumn = startColumn + matchedUrl.length;

          links.push({
            range: {
              start: {
                x: startColumn + 1,
                y: bufferLineNumber + 1,
              },
              end: {
                x: endColumn,
                y: bufferLineNumber + 1,
              },
            },
            text: matchedUrl,
            activate: (_event: MouseEvent, text: string) => {
              openTerminalUrl(text);
            },
          });
        }

        callback(links.length > 0 ? links : undefined);
      },
    };

    linkProviderDisposableRef.current = terminal.registerLinkProvider(linkProvider);

    return () => {
      clearBufferedOutput();
      if (linkProviderDisposableRef.current !== null) {
        linkProviderDisposableRef.current.dispose();
        linkProviderDisposableRef.current = null;
      }
      terminalRef.current = null;
      clipboardAddonRef.current = null;
      fitAddonRef.current = null;
      disposeWebglAddon();
      terminal.dispose();
    };
  }, [clearBufferedOutput]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = getXtermTheme(themeMode);
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
  const [horizontalRatiosByRow, setHorizontalRatiosByRow] = useState<Record<string, number>>({});
  const stableKnownWorktreesRef = useRef<string[]>(knownWorktrees);
  const splitRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
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

  const sessionRows = useMemo(() => {
    const rows: { key: string; sessions: DecoratedSession[] }[] = [];
    for (let index = 0; index < decoratedSessions.length; index += 2) {
      const rowSessions = decoratedSessions.slice(index, index + 2);
      const key = rowSessions.map((entry) => entry.session.sessionId).join("|");
      rows.push({
        key,
        sessions: rowSessions,
      });
    }
    return rows;
  }, [decoratedSessions]);

  useEffect(() => {
    setHorizontalRatiosByRow((previous) => {
      const next: Record<string, number> = {};
      let changed = false;

      for (const row of sessionRows) {
        if (row.sessions.length !== 2) {
          continue;
        }
        const existingRatio = previous[row.key];
        next[row.key] = existingRatio ?? 0.5;
        if (existingRatio === undefined) {
          changed = true;
        }
      }

      if (!changed) {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(next);
        if (previousKeys.length !== nextKeys.length) {
          changed = true;
        } else {
          for (const key of nextKeys) {
            if (previous[key] !== next[key]) {
              changed = true;
              break;
            }
          }
        }
      }

      return changed ? next : previous;
    });
  }, [sessionRows]);

  const handleHorizontalResizeStart = useCallback(
    (rowKey: string, event: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitRowRefs.current[rowKey];
      if (!container) {
        return;
      }

      const availableWidth = container.clientWidth - HORIZONTAL_HANDLE_SIZE;
      if (availableWidth <= 0) {
        return;
      }

      const minRatio = clamp(MIN_COLUMN_WIDTH_PX / availableWidth, 0.1, 0.45);
      const maxRatio = 1 - minRatio;
      const startX = event.clientX;
      const startRatio = horizontalRatiosByRow[rowKey] ?? 0.5;
      const pointerId = event.pointerId;

      const onPointerMove = (pointerEvent: PointerEvent) => {
        const deltaRatio = (pointerEvent.clientX - startX) / availableWidth;
        const nextRatio = clamp(startRatio + deltaRatio, minRatio, maxRatio);
        setHorizontalRatiosByRow((previous) => {
          if (previous[rowKey] === nextRatio) {
            return previous;
          }
          return {
            ...previous,
            [rowKey]: nextRatio,
          };
        });
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };

      event.currentTarget.setPointerCapture(pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      window.addEventListener("pointercancel", onPointerUp, { once: true });
    },
    [horizontalRatiosByRow],
  );

  return (
    <div className="groove-worktree-terminal space-y-2">
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No active in-app sessions for this worktree.</div>
      ) : !isDesktop ? (
        <div className="space-y-3">
          {decoratedSessions.map((entry) => (
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
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-[75vh] min-h-[320px] min-w-0 flex-col gap-2">
          {sessionRows.map((row) => {
            if (row.sessions.length === 1) {
              const onlySession = row.sessions[0];
              return (
                <div key={row.key} className="min-h-0 min-w-0 flex-1">
                  <SplitTerminalPane
                    workspaceRoot={workspaceRoot}
                    workspaceMeta={workspaceMeta}
                    knownWorktrees={stableKnownWorktrees}
                    worktree={worktree}
                    session={onlySession.session}
                    instanceLabel={onlySession.instanceLabel}
                    themeMode={themeMode}
                    isClosing={closingSessionIds.includes(onlySession.session.sessionId)}
                    onClose={(sessionId) => {
                      void handleCloseSplit(sessionId);
                    }}
                  />
                </div>
              );
            }

            const leftSession = row.sessions[0];
            const rightSession = row.sessions[1];
            const horizontalRatio = horizontalRatiosByRow[row.key] ?? 0.5;
            const leftColumnBasis = `calc((100% - ${HORIZONTAL_HANDLE_SIZE}px) * ${horizontalRatio})`;
            const rightColumnBasis = `calc((100% - ${HORIZONTAL_HANDLE_SIZE}px) * ${1 - horizontalRatio})`;

            return (
              <div
                key={row.key}
                ref={(element) => {
                  if (element) {
                    splitRowRefs.current[row.key] = element;
                    return;
                  }
                  delete splitRowRefs.current[row.key];
                }}
                className="flex min-h-0 min-w-0 flex-1"
              >
                <div className="min-h-0 min-w-0" style={{ flexBasis: leftColumnBasis }}>
                  <SplitTerminalPane
                    workspaceRoot={workspaceRoot}
                    workspaceMeta={workspaceMeta}
                    knownWorktrees={stableKnownWorktrees}
                    worktree={worktree}
                    session={leftSession.session}
                    instanceLabel={leftSession.instanceLabel}
                    themeMode={themeMode}
                    isClosing={closingSessionIds.includes(leftSession.session.sessionId)}
                    onClose={(sessionId) => {
                      void handleCloseSplit(sessionId);
                    }}
                  />
                </div>
                <div
                  className="group relative shrink-0 cursor-col-resize touch-none py-1"
                  style={{ width: `${HORIZONTAL_HANDLE_SIZE}px` }}
                  onPointerDown={(event) => {
                    handleHorizontalResizeStart(row.key, event);
                  }}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize terminal columns"
                >
                  <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/50" />
                </div>
                <div className="min-h-0 min-w-0" style={{ flexBasis: rightColumnBasis }}>
                  <SplitTerminalPane
                    workspaceRoot={workspaceRoot}
                    workspaceMeta={workspaceMeta}
                    knownWorktrees={stableKnownWorktrees}
                    worktree={worktree}
                    session={rightSession.session}
                    instanceLabel={rightSession.instanceLabel}
                    themeMode={themeMode}
                    isClosing={closingSessionIds.includes(rightSession.session.sessionId)}
                    onClose={(sessionId) => {
                      void handleCloseSplit(sessionId);
                    }}
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
