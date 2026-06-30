"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Minus, Plus, RefreshCw, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ghPrView } from "@/src/lib/ipc";
import type {
  GhPrComment,
  GhPrDetail,
  PullRequestRecord,
} from "@/src/lib/ipc";
import type { PrStatusKey } from "@/src/lib/groove-business";
import { cn } from "@/src/lib/utils";

type PrInspectorPaneProps = {
  worktreePath: string;
  record: PullRequestRecord;
  minimized: boolean;
  onToggleMinimize: () => void;
  onClose: () => void;
  /** Append a comment's text to the oldest open Claude session for this worktree. */
  onSendCommentToClaude: (text: string) => void;
};

// Comments longer than this are clipped behind a "See more" toggle.
const COMMENT_TRUNCATE = 280;

// Strip HTML tags (and comments) out of a PR comment body, collapsing the
// blank lines the removed markup tends to leave behind.
function stripHtml(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type LoadState = {
  loading: boolean;
  pr?: GhPrDetail;
  error?: string;
};

// A highlighter "marker": a background that hugs the text and adds no padding
// or width of its own (like a marker swipe on paper). Default is the neutral
// label highlight; pass `className` to override the color (e.g. for STATE).
function Marker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("bg-muted text-foreground", className)}>{children}</span>
  );
}

const LABEL_COLUMN = 9;

// Inline row: highlighted label, then unhighlighted spaces to keep the
// monospace column aligned, then the value.
function Field({ label, children }: { label: string; children: ReactNode }) {
  const pad = " ".repeat(Math.max(1, LABEL_COLUMN - label.length));
  return (
    <div className="break-words">
      <Marker>{label}</Marker>
      {pad}
      {children}
    </div>
  );
}

const STATE_VALUE_CLASS: Record<PrStatusKey, string> = {
  open: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  merged: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  closed: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  draft: "bg-muted text-muted-foreground",
};

function statusKey(pr: GhPrDetail): PrStatusKey {
  const state = pr.state.toUpperCase();
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  if (pr.isDraft) return "draft";
  return "open";
}

function stateLine(pr: GhPrDetail): string {
  const parts = [pr.state.toLowerCase()];
  if (pr.isDraft) parts.push("draft");
  switch ((pr.reviewDecision ?? "").toUpperCase()) {
    case "APPROVED":
      parts.push("approved");
      break;
    case "CHANGES_REQUESTED":
      parts.push("changes requested");
      break;
    case "REVIEW_REQUIRED":
      parts.push("review required");
      break;
    default:
      break;
  }
  return parts.join(" · ");
}

// One PR comment: highlighted author + "Enviar a Claude" action, with a
// truncated body that expands via a blue "See more" marker.
function CommentItem({
  comment,
  onSend,
}: {
  comment: GhPrComment;
  onSend: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = stripHtml(comment.body ?? "");
  const isLong = body.length > COMMENT_TRUNCATE;
  const shown =
    expanded || !isLong ? body : body.slice(0, COMMENT_TRUNCATE).trimEnd();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <Marker className="bg-purple-500/15 text-purple-700 dark:text-purple-300">
          {comment.author ?? "unknown"}
        </Marker>
        <button
          type="button"
          onClick={() => {
            onSend(body);
          }}
          className="cursor-pointer bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 dark:text-orange-300"
        >
          enviar a claude
        </button>
        {comment.createdAt ? <span>· {comment.createdAt.slice(0, 10)}</span> : null}
      </div>
      <p className="break-words text-foreground/90">
        {shown}
        {isLong ? (
          <>
            {expanded ? " " : "… "}
            <button
              type="button"
              onClick={() => {
                setExpanded((value) => !value);
              }}
              className="cursor-pointer bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 dark:text-blue-300"
            >
              {expanded ? "See less" : "See more"}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function PrInspectorPane({
  worktreePath,
  record,
  minimized,
  onToggleMinimize,
  onClose,
  onSendCommentToClaude,
}: PrInspectorPaneProps) {
  const [state, setState] = useState<LoadState>({ loading: true });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await ghPrView({ worktreePath, selector: record.url });
      if (result.ok && result.pr) {
        setState({ loading: false, pr: result.pr });
      } else {
        setState({ loading: false, error: result.error ?? "Failed to load PR." });
      }
    } catch (caught) {
      setState({
        loading: false,
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }, [record.url, worktreePath]);

  useEffect(() => {
    void load();
  }, [load]);

  const pr = state.pr;
  const title = pr?.title ?? record.title ?? "Pull request";

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg border ${
        minimized ? "h-auto" : "h-full"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 flex-1 items-center gap-1 font-mono">
          <span className="shrink-0 text-foreground">[#{record.number}]</span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="max-w-[45%] shrink-0 truncate text-muted-foreground/70">
            {record.url}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              void load();
            }}
            disabled={state.loading}
            aria-label={`Refresh PR #${record.number}`}
          >
            <RefreshCw
              className={state.loading ? "size-3.5 animate-spin" : "size-3.5"}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggleMinimize}
            aria-label={
              minimized
                ? `Maximize PR #${record.number}`
                : `Minimize PR #${record.number}`
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
            onClick={onClose}
            aria-label={`Close PR #${record.number}`}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-card p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {state.error ? (
            <p className="text-destructive">{state.error}</p>
          ) : !pr ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-0.5">
                <Field label="TITLE">{pr.title}</Field>
                <Field label="STATE">
                  <Marker className={STATE_VALUE_CLASS[statusKey(pr)]}>
                    {stateLine(pr)}
                  </Marker>
                </Field>
                {pr.author ? <Field label="AUTHOR">{pr.author}</Field> : null}
                {pr.baseRefName && pr.headRefName ? (
                  <Field label="BRANCH">
                    {`${pr.baseRefName} ← ${pr.headRefName}`}
                  </Field>
                ) : null}
                {pr.labels.length > 0 ? (
                  <Field label="LABELS">{pr.labels.join(", ")}</Field>
                ) : null}
                {pr.additions != null || pr.deletions != null ? (
                  <Field label="DIFF">
                    {`+${pr.additions ?? 0} −${pr.deletions ?? 0}`}
                  </Field>
                ) : null}
                {pr.updatedAt ? (
                  <Field label="UPDATED">{pr.updatedAt.slice(0, 10)}</Field>
                ) : null}
              </div>

              <div>
                <p>
                  <Marker>DESCRIPTION</Marker>
                </p>
                <p className="mt-1 break-words text-foreground/90">
                  {pr.body?.trim() ? pr.body.trim() : "—"}
                </p>
              </div>

              <div>
                <p>
                  <Marker>COMMENTS</Marker>{" "}
                  <span className="text-muted-foreground">
                    ({pr.comments.length})
                  </span>
                </p>
                {pr.comments.length === 0 ? (
                  <p className="mt-1 text-foreground/90">—</p>
                ) : (
                  <div className="mt-1 space-y-2">
                    {pr.comments.map((comment, idx) => (
                      <CommentItem
                        key={idx}
                        comment={comment}
                        onSend={onSendCommentToClaude}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
