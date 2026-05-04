import { useState } from "react";

import { Check, Copy, GitCommit, Loader2, Sword } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useGrooveBusiness } from "@/src/lib/groove-business";
import type { CommentRecord } from "@/src/lib/ipc";

type CommentViewerModalProps = {
  comment: CommentRecord | null;
  open: boolean;
  onClose: () => void;
  onAttack?: () => void;
  onAttackAll?: () => void;
  isAttackPending?: boolean;
  isAttackAllPending?: boolean;
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

export function CommentViewerModal({
  comment,
  open,
  onClose,
  onAttack,
  onAttackAll,
  isAttackPending = false,
  isAttackAllPending = false,
}: CommentViewerModalProps) {
  const grooveBusiness = useGrooveBusiness();
  const ActionIcon = grooveBusiness.isBusiness ? GitCommit : Sword;
  const singleLabel = grooveBusiness.isBusiness ? "Commit" : "Attack";
  const singlePendingLabel = grooveBusiness.isBusiness
    ? "Committing..."
    : "Attacking...";
  const allLabel = grooveBusiness.isBusiness ? "Commit all" : "Attack all";
  const allPendingLabel = grooveBusiness.isBusiness
    ? "Committing all..."
    : "Attacking all...";

  const dateLabel = comment
    ? new Date(comment.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
  const isCommitted = comment?.state === "committed";
  const message = comment?.message ?? "";
  const anyPending = isAttackPending || isAttackAllPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="mb-1">Commit comment</DialogTitle>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
            <span
              className={
                isCommitted
                  ? "rounded-sm border border-emerald-700/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                  : "rounded-sm border border-amber-600/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              }
            >
              {isCommitted ? "committed" : "uncommitted"}
            </span>
          </div>
        </DialogHeader>

        <div className="flex items-start gap-1.5 rounded-md border bg-muted/40 p-3 font-mono text-sm leading-relaxed">
          {message ? (
            <>
              <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {message}
              </div>
              <CopyInlineButton text={message} />
            </>
          ) : (
            <span className="min-w-0 flex-1 italic text-muted-foreground">
              No commit message available.
            </span>
          )}
        </div>

        {!isCommitted && (onAttack || onAttackAll) ? (
          <div className="flex justify-end gap-2">
            {onAttack ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={onAttack}
                disabled={anyPending}
              >
                {isAttackPending ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <ActionIcon aria-hidden="true" className="size-3.5" />
                )}
                {isAttackPending ? singlePendingLabel : singleLabel}
              </Button>
            ) : null}
            {onAttackAll ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 gap-1.5"
                onClick={onAttackAll}
                disabled={anyPending}
              >
                {isAttackAllPending ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <ActionIcon aria-hidden="true" className="size-3.5" />
                )}
                {isAttackAllPending ? allPendingLabel : allLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
