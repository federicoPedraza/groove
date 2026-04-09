import {
  CheckCircle2,
  Info,
  LoaderCircle,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { getCommandMetadata } from "@/src/lib/command-metadata";
import {
  subscribeToToastStore,
  getToastStoreSnapshot,
  pauseToast,
  resumeToast,
  type ToastEntry,
  type ToastType,
} from "@/src/lib/toast-store";
import { cn } from "@/src/lib/utils";

type ToastPresentation = {
  fallbackIcon: LucideIcon;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
};

const TOAST_PRESENTATION: Record<ToastType, ToastPresentation> = {
  success: {
    fallbackIcon: CheckCircle2,
    iconColor: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-300",
  },
  error: {
    fallbackIcon: XCircle,
    iconColor: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-300",
  },
  info: {
    fallbackIcon: Info,
    iconColor: "text-sky-400",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    textColor: "text-sky-300",
  },
  warning: {
    fallbackIcon: TriangleAlert,
    iconColor: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-300",
  },
  loading: {
    fallbackIcon: LoaderCircle,
    iconColor: "text-sky-400",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    textColor: "text-sky-300",
  },
  default: {
    fallbackIcon: Info,
    iconColor: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border/60",
    textColor: "text-foreground/80",
  },
};

function resolveIcon(entry: ToastEntry): LucideIcon {
  if (entry.command) {
    return getCommandMetadata(entry.command).icon;
  }
  return TOAST_PRESENTATION[entry.type].fallbackIcon;
}

function CollapsedToastItem({ entry }: { entry: ToastEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const presentation = TOAST_PRESENTATION[entry.type];
  const Icon = resolveIcon(entry);
  const isLoading = entry.type === "loading";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {isExpanded ? (
        <div
          className={cn(
            "rounded-md border px-2.5 py-1",
            "animate-in fade-in-0 slide-in-from-right-2 duration-150",
            presentation.bgColor,
            presentation.borderColor,
          )}
        >
          <p className={cn("text-xs font-medium", presentation.textColor)}>
            {entry.message}
          </p>
          {entry.description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              {entry.description}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-label={entry.message}
        title={entry.message}
        onClick={() => {
          setIsExpanded((prev) => {
            if (!prev) {
              pauseToast(entry.id);
            } else {
              resumeToast(entry.id);
            }
            return !prev;
          });
        }}
        className={cn(
          "relative rounded-md p-1 transition-colors",
          presentation.iconColor,
          "hover:bg-muted",
        )}
      >
        <Icon
          className={cn("size-3.5", isLoading && "animate-spin")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export function CollapsedToast() {
  const entries = useSyncExternalStore(
    subscribeToToastStore,
    getToastStoreSnapshot,
    getToastStoreSnapshot,
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {entries.map((entry) => (
        <CollapsedToastItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
