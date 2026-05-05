import { useState, useEffect } from "react";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Scroll,
} from "lucide-react";
import Markdown from "react-markdown";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import type { SummaryRecord } from "@/src/lib/ipc";

type SummaryViewerModalProps = {
  summaries: SummaryRecord[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onCreateNewSummary?: () => void;
  isCreatePending?: boolean;
};

function CopyInlineButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3 text-emerald-700" />
      ) : (
        <Copy aria-hidden="true" className="size-3" />
      )}
    </Button>
  );
}

export function SummaryViewerModal({
  summaries,
  initialIndex,
  open,
  onClose,
  onCreateNewSummary,
  isCreatePending = false,
}: SummaryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [contentExpanded, setContentExpanded] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setContentExpanded(false);
  }, [currentIndex]);

  const summary = summaries[currentIndex] ?? null;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < summaries.length - 1;

  const dateLabel = summary
    ? new Date(summary.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="mb-1">Summary</DialogTitle>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
            {summaries.length > 1 ? (
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  disabled={!hasPrevious}
                  onClick={() => {
                    setCurrentIndex((i) => i - 1);
                  }}
                  aria-label="Previous summary"
                >
                  <ChevronLeft aria-hidden="true" className="size-3" />
                </Button>
                <span className="min-w-[3ch] text-center text-[10px] text-muted-foreground">
                  {currentIndex + 1}/{summaries.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  disabled={!hasNext}
                  onClick={() => {
                    setCurrentIndex((i) => i + 1);
                  }}
                  aria-label="Next summary"
                >
                  <ChevronRight aria-hidden="true" className="size-3" />
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex items-start gap-1.5 rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed">
          {summary?.oneLiner ? (
            <>
              <span className="min-w-0 flex-1">{summary.oneLiner}</span>
              <CopyInlineButton text={summary.oneLiner} />
            </>
          ) : (
            <span className="min-w-0 flex-1 italic text-muted-foreground">
              No one liner provided.
            </span>
          )}
        </div>

        <div>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setContentExpanded((v) => !v);
            }}
          >
            <ChevronDown
              aria-hidden="true"
              className={`size-3 transition-transform duration-200 ${contentExpanded ? "rotate-0" : "-rotate-90"}`}
            />
            Content
          </button>
          {contentExpanded ? (
            <div className="mt-2 max-h-[40vh] overflow-y-auto rounded-md border bg-muted/40 p-4 font-mono text-sm leading-relaxed">
              <div className="flex justify-end mb-1">
                <CopyInlineButton text={summary?.summary ?? ""} />
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                <Markdown>{summary?.summary ?? ""}</Markdown>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-1">
          {onCreateNewSummary ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onCreateNewSummary}
              disabled={isCreatePending}
            >
              <Scroll aria-hidden="true" className="size-3" />
              {isCreatePending ? "Summarizing..." : "Create new summary"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
