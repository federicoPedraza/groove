import type { LucideIcon } from "lucide-react";
import { CheckCircle2, History, LoaderCircle, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  formatCommandRelativeTime,
  clearCommandHistory,
  getCommandHistorySnapshot,
  subscribeToCommandHistory,
  type CommandExecutionEntry,
} from "@/lib/command-history";
import { setIsCommandHistoryPanelOpen } from "@/lib/command-history-panel-state";
import { getCommandMetadata } from "@/lib/command-metadata";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatePresentation = {
  labelClassName: string;
  iconClassName: string;
  containerClassName: string;
  indicatorIcon: LucideIcon;
};

const STATE_PRESENTATION: Record<CommandExecutionEntry["state"], StatePresentation> = {
  running: {
    labelClassName: "text-sky-700",
    iconClassName: "text-sky-700",
    containerClassName: "border-sky-200/70 bg-sky-50/45 dark:border-sky-500/30 dark:bg-sky-500/8",
    indicatorIcon: LoaderCircle,
  },
  success: {
    labelClassName: "text-emerald-700",
    iconClassName: "text-emerald-700",
    containerClassName: "border-emerald-200/70 bg-emerald-50/35 dark:border-emerald-500/30 dark:bg-emerald-500/8",
    indicatorIcon: CheckCircle2,
  },
  error: {
    labelClassName: "text-rose-700",
    iconClassName: "text-rose-700",
    containerClassName: "border-rose-200/75 bg-rose-50/40 dark:border-rose-500/35 dark:bg-rose-500/10",
    indicatorIcon: XCircle,
  },
};

function CommandHistoryRow({ entry, now }: { entry: CommandExecutionEntry; now: number }) {
  const metadata = getCommandMetadata(entry.command);
  const relativeTime = formatCommandRelativeTime(entry, now);
  const presentation = STATE_PRESENTATION[entry.state];
  const IndicatorIcon = presentation.indicatorIcon;
  const CommandIcon = metadata.icon;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/65",
        presentation.containerClassName,
      )}
    >
      <div className="flex items-start gap-2">
        <CommandIcon className={cn("mt-0.5 size-3.5 shrink-0", presentation.iconClassName)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground/90">{metadata.title}</div>
          <div className="line-clamp-2 text-[11px] text-muted-foreground">{metadata.description}</div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <code className="truncate text-[11px] text-muted-foreground">{entry.command}</code>
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px] font-medium", presentation.labelClassName)}>
          <IndicatorIcon className={cn("size-3", entry.state === "running" ? "animate-spin" : "")} aria-hidden="true" />
          {relativeTime}
        </span>
      </div>
      {entry.state === "error" && entry.failureDetail ? (
        <p className="mt-1.5 whitespace-pre-wrap break-words rounded-sm border border-rose-200/60 bg-rose-100/45 px-2 py-1 text-[11px] text-rose-900/90 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-100/90">
          {entry.failureDetail}
        </p>
      ) : null}
    </div>
  );
}

export function CommandHistoryPanel() {
  const entries = useSyncExternalStore(subscribeToCommandHistory, getCommandHistorySnapshot, getCommandHistorySnapshot);
  const [now, setNow] = useState<number>(() => Date.now());
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const historyListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsCommandHistoryPanelOpen(isOpen);

    return () => {
      setIsCommandHistoryPanelOpen(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!historyListRef.current) {
      return;
    }

    historyListRef.current.scrollTop = historyListRef.current.scrollHeight;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const completedEntries = useMemo(
    () => entries.filter((entry) => entry.completedAt !== null).slice(0, 20).reverse(),
    [entries],
  );

  return (
    <div ref={containerRef} className="fixed bottom-4 left-4 z-40">
      {isOpen ? (
        <section
          role="dialog"
          aria-label="Command history"
          className={cn(
            "absolute bottom-14 left-0 w-[24rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border/80 bg-background/95 p-2 shadow-xl backdrop-blur",
            "supports-[backdrop-filter]:bg-background/80",
          )}
        >
          <div className="px-1 pb-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Command history</p>
              <Button
                type="button"
                variant="ghost"
                aria-label="Clear all command history"
                title="Clear all command history"
                className="h-7 w-7 p-0"
                onClick={clearCommandHistory}
                disabled={entries.length === 0}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Last 20 completed commands</p>
          </div>
          <div ref={historyListRef} className="max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
            {completedEntries.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/80 px-3 py-4 text-xs text-muted-foreground">
                No completed commands yet.
              </p>
            ) : (
              completedEntries.map((entry) => <CommandHistoryRow key={entry.id} entry={entry} now={now} />)
            )}
          </div>
        </section>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        aria-label="Command history"
        title="Command history"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        className="h-11 w-11 rounded-full border border-border/70 bg-background/90 px-0 shadow-lg"
      >
        <History className="size-5" aria-hidden="true" />
      </Button>
      {completedEntries.length > 0 ? (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {Math.min(20, completedEntries.length)}
        </span>
      ) : null}
    </div>
  );
}
