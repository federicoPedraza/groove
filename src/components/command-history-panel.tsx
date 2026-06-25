import { Bug, SquareTerminal, Trash2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  formatCommandRelativeTime,
  clearCommandHistory,
  getCommandHistorySnapshot,
  subscribeToCommandHistory,
  type CommandExecutionEntry,
} from "@/src/lib/command-history";
import { getCommandMetadata } from "@/src/lib/command-metadata";
import { CollapsedToast } from "@/src/components/collapsed-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

import packageJson from "../../package.json";

const APP_VERSION = packageJson.version;

type TerminalMode = "friendly" | "angry";

type StatePresentation = {
  iconClassName: string;
  timeClassName: string;
};

const STATE_PRESENTATION: Record<
  CommandExecutionEntry["state"],
  StatePresentation
> = {
  running: {
    iconClassName: "text-sky-500",
    timeClassName: "text-sky-500",
  },
  success: {
    iconClassName: "text-emerald-500",
    timeClassName: "text-faint",
  },
  error: {
    iconClassName: "text-destructive",
    timeClassName: "text-destructive",
  },
};

function formatDuration(entry: CommandExecutionEntry): string {
  if (entry.completedAt === null) {
    return "running";
  }
  const elapsedMs = Math.max(0, entry.completedAt - entry.startedAt);
  if (elapsedMs < 1_000) {
    return `${String(elapsedMs)}ms`;
  }
  return `${(elapsedMs / 1_000).toFixed(2)}s`;
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function CommandHistoryRow({
  entry,
  now,
  mode,
}: {
  entry: CommandExecutionEntry;
  now: number;
  mode: TerminalMode;
}) {
  const metadata = getCommandMetadata(entry.command);
  const relativeTime = formatCommandRelativeTime(entry, now);
  const presentation = STATE_PRESENTATION[entry.state];
  const CommandIcon = metadata.icon;

  const displayLabel = mode === "friendly" ? metadata.title : entry.command;
  // Friendly mode explains what the command does; raw mode exposes the
  // technical execution detail (state, duration, exact clock time) the
  // friendly description hides.
  const displaySublabel =
    mode === "friendly"
      ? metadata.description
      : [
          entry.state,
          formatDuration(entry),
          formatClockTime(entry.completedAt ?? entry.startedAt),
        ].join("  ·  ");

  return (
    <div className="group rounded-md border bg-card/40 px-3 py-2 transition-colors duration-150 hover:border-border-strong hover:bg-accent/50 [content-visibility:auto] [contain-intrinsic-size:auto_44px]">
      <div className="flex items-center gap-2.5">
        <CommandIcon
          className={cn(
            "size-3.5 shrink-0",
            presentation.iconClassName,
            entry.state === "running" && "animate-spin",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "truncate text-xs text-foreground",
                mode === "angry" ? "font-mono" : "font-medium",
              )}
            >
              {displayLabel}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-[10px] tabular-nums",
                presentation.timeClassName,
              )}
            >
              {relativeTime}
            </span>
          </div>
          {displaySublabel ? (
            <p
              className={cn(
                "mt-0.5 truncate text-[11px] text-faint",
                mode === "angry" && "font-mono tabular-nums",
              )}
            >
              {displaySublabel}
            </p>
          ) : null}
        </div>
      </div>
      {entry.state === "error" && entry.failureDetail ? (
        <p className="ml-6 mt-1.5 whitespace-pre-wrap break-words rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 font-mono text-[10px] leading-relaxed text-destructive">
          {entry.failureDetail}
        </p>
      ) : null}
    </div>
  );
}

export function CommandHistoryPanel() {
  const entries = useSyncExternalStore(
    subscribeToCommandHistory,
    getCommandHistorySnapshot,
    getCommandHistorySnapshot,
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<TerminalMode>("friendly");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const historyListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !historyListRef.current) return;
    historyListRef.current.scrollTop = historyListRef.current.scrollHeight;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current.contains(target)) setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const completedEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.completedAt !== null)
        .slice(0, 20)
        .reverse(),
    [entries],
  );

  const hasEntries = completedEntries.length > 0;
  const runningCount = entries.filter(
    (entry) => entry.state === "running",
  ).length;
  const isDev = import.meta.env.DEV;

  return (
    <div ref={containerRef} className="fixed bottom-3 left-5 z-40">
      {isOpen ? (
        <section
          role="dialog"
          aria-label="Terminal log"
          className={cn(
            "absolute bottom-9 left-0 w-[26rem] max-w-[calc(100vw-1.5rem)]",
            "overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-panel",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <div className="flex items-center gap-2">
              <SquareTerminal
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-foreground">
                Terminal Log
              </span>
              {hasEntries ? (
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground">
                  {completedEntries.length}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {runningCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-sky-500">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-sky-500" />
                  </span>
                  {runningCount} running
                </span>
              ) : null}
              <button
                type="button"
                onClick={clearCommandHistory}
                disabled={!hasEntries}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label="Clear history"
                title="Clear history"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="border-b px-3 py-2">
            <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setMode("friendly")}
                className={cn(
                  "rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors",
                  mode === "friendly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Friendly
              </button>
              <button
                type="button"
                onClick={() => setMode("angry")}
                className={cn(
                  "rounded-sm px-2 py-0.5 font-mono text-[11px] font-medium transition-colors",
                  mode === "angry"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Raw
              </button>
            </div>
          </div>

          {/* Command list */}
          <div
            ref={historyListRef}
            className="max-h-80 space-y-1 overflow-y-auto p-2"
            aria-live="polite"
          >
            {!hasEntries ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <SquareTerminal
                  className="mb-2 size-5 text-muted-foreground/40"
                  aria-hidden="true"
                />
                <p className="text-[11px] text-faint">No commands yet</p>
              </div>
            ) : (
              completedEntries.map((entry) => (
                <CommandHistoryRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  mode={mode}
                />
              ))
            )}
          </div>
        </section>
      ) : null}

      {/* Bottom row: toast + version + dev indicator + terminal icon */}
      <div className="flex flex-col items-start gap-1.5">
        <CollapsedToast />
        <div className="flex items-center gap-1.5">
          <span className="select-none text-[11px] tabular-nums text-faint">
            v{APP_VERSION}
          </span>
          {isDev ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="rounded-md p-1 text-faint"
                    aria-label="Development mode"
                  >
                    <Bug className="size-3.5" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Development mode</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <button
            type="button"
            aria-label="Terminal log"
            title="Terminal log"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            className={cn(
              "relative rounded-md p-1 transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              isOpen && "bg-accent text-foreground",
            )}
          >
            <SquareTerminal className="size-3.5" aria-hidden="true" />
            {runningCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
