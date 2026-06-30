"use client";

import { useMemo, useState } from "react";
import { Check, Copy, History } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import type { CommentRecord } from "@/src/lib/ipc";

type CommitCommentsHistoryModalProps = {
  comments: CommentRecord[];
  open: boolean;
  onClose: () => void;
};

function CopyInlineButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
          }, 2000);
        });
      }}
      aria-label="Copy commit message"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3 text-emerald-700" />
      ) : (
        <Copy aria-hidden="true" className="size-3" />
      )}
    </Button>
  );
}

export function CommitCommentsHistoryModal({
  comments,
  open,
  onClose,
}: CommitCommentsHistoryModalProps) {
  // Newest first.
  const ordered = useMemo(
    () =>
      [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [comments],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4" />
            Previous commit comments
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No committed comments yet.
            </p>
          ) : (
            ordered.map((comment) => (
              <div
                key={comment.createdAt}
                className="space-y-1.5 rounded-md border bg-muted/40 p-3"
              >
                <p className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                <div className="flex items-start gap-1.5 font-mono text-sm leading-relaxed">
                  <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {comment.message}
                  </div>
                  <CopyInlineButton text={comment.message} />
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
