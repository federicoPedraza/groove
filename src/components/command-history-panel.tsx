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
  labelClassName: string;
  iconClassName: string;
  containerClassName: string;
  dotColor: string;
};

const STATE_PRESENTATION: Record<
  CommandExecutionEntry["state"],
  StatePresentation
> = {
  running: {
    labelClassName: "text-sky-400",
    iconClassName: "text-sky-400",
    containerClassName: "border-sky-500/20 bg-sky-500/5",
    dotColor: "bg-sky-400",
  },
  success: {
    labelClassName: "text-emerald-400",
    iconClassName: "text-emerald-400",
    containerClassName: "border-emerald-500/15 bg-emerald-500/5",
    dotColor: "bg-emerald-400",
  },
  error: {
    labelClassName: "text-rose-400",
    iconClassName: "text-rose-400",
    containerClassName: "border-rose-500/20 bg-rose-500/5",
    dotColor: "bg-rose-400",
  },
};

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
  const displaySublabel = mode === "friendly" ? metadata.description : null;

  return (
    <div
      className={cn(
        "group rounded-md border px-3 py-2 transition-colors duration-150",
        presentation.containerClassName,
      )}
    >
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
                "truncate text-xs text-foreground/90",
                mode === "angry" ? "font-mono" : "font-medium",
              )}
            >
              {displayLabel}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-[10px]",
                presentation.labelClassName,
              )}
            >
              {relativeTime}
            </span>
          </div>
          {displaySublabel ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
              {displaySublabel}
            </p>
          ) : null}
        </div>
      </div>
      {entry.state === "error" && entry.failureDetail ? (
        <p className="ml-4 mt-1.5 whitespace-pre-wrap break-words rounded border border-rose-500/20 bg-rose-500/8 px-2 py-1 font-mono text-[10px] leading-relaxed text-rose-300/90">
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
    <div ref={containerRef} className="fixed bottom-3 right-5 z-40">
      {isOpen ? (
        <section
          role="dialog"
          aria-label="Command history"
          className={cn(
            "absolute bottom-9 right-0 w-[26rem] max-w-[calc(100vw-1.5rem)]",
            "rounded-lg border border-border/60 bg-background/97 shadow-2xl backdrop-blur-xl",
            "supports-[backdrop-filter]:bg-background/90",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearCommandHistory}
                disabled={!hasEntries}
                className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label="Clear history"
                title="Clear history"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMode("friendly")}
                className={cn(
                  "text-[11px] font-medium transition-colors",
                  mode === "friendly"
                    ? "text-foreground"
                    : "text-muted-foreground/60 hover:text-muted-foreground",
                )}
              >
                Friendly
              </button>
              <span className="text-muted-foreground/30">|</span>
              <button
                type="button"
                onClick={() => setMode("angry")}
                className={cn(
                  "font-mono text-[11px] font-medium transition-colors",
                  mode === "angry"
                    ? "text-foreground"
                    : "text-muted-foreground/60 hover:text-muted-foreground",
                )}
              >
                Raw
              </button>
            </div>
            {runningCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-sky-400">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-sky-400" />
                </span>
                {runningCount} running
              </span>
            ) : null}
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
                  className="mb-2 size-5 text-muted-foreground/30"
                  aria-hidden="true"
                />
                <p className="text-[11px] text-muted-foreground/50">
                  No commands yet
                </p>
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
      <div className="flex flex-col items-end gap-1.5">
        <CollapsedToast />
        <div className="flex items-center gap-1.5">
          <span className="select-none text-[11px] tabular-nums text-muted-foreground/50">
            v{APP_VERSION}
          </span>
          {isDev ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="rounded-md p-1 text-muted-foreground/50"
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
            aria-label="Command history"
            title="Command history"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            className={cn(
              "relative rounded-md p-1 transition-colors",
              "text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
              isOpen && "bg-muted text-muted-foreground",
            )}
          >
            <SquareTerminal className="size-3.5" aria-hidden="true" />
            {runningCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-sky-400" />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
