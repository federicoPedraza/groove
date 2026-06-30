"use client";

import {
  ChevronDown,
  ChevronRight,
  FileDiff,
  FileMinus,
  FilePlus,
  FilePlus2,
  FileQuestion,
  History,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { gitDiff } from "@/src/lib/ipc";
import type {
  GitDiffFile,
  GitDiffFileStatus,
  GitDiffHunk,
  GitDiffLine,
} from "@/src/lib/ipc";
import { cn } from "@/src/lib/utils";

type GitChangesSectionProps = {
  worktreePath: string | null | undefined;
  /** Whether the section is currently visible; drives the polling loop. */
  active: boolean;
  /** Draft a commit comment from the diff + the Claude session since last commit. */
  onDraftCommitComment?: () => void;
  isDraftPending?: boolean;
  /** Open the history of committed commit comments for this worktree. */
  onViewCommitComments?: () => void;
  committedCommentCount?: number;
};

const REFRESH_INTERVAL_MS = 4000;

const STATUS_META: Record<
  GitDiffFileStatus,
  { label: string; tone: string; icon: typeof FilePlus }
> = {
  added: {
    label: "A",
    tone: "text-emerald-600 dark:text-emerald-400",
    icon: FilePlus,
  },
  modified: {
    label: "M",
    tone: "text-amber-600 dark:text-amber-400",
    icon: FileDiff,
  },
  deleted: {
    label: "D",
    tone: "text-rose-600 dark:text-rose-400",
    icon: FileMinus,
  },
  renamed: {
    label: "R",
    tone: "text-sky-600 dark:text-sky-400",
    icon: FileDiff,
  },
  untracked: {
    label: "U",
    tone: "text-emerald-600 dark:text-emerald-400",
    icon: FilePlus2,
  },
};

function getDisplayPath(file: GitDiffFile): string {
  if (file.status === "renamed" && file.oldPath) {
    return `${file.oldPath} → ${file.filePath}`;
  }
  return file.filePath;
}

function getBasename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

function getDirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function DiffHunkBlock({ hunk }: { hunk: GitDiffHunk }) {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;

  return (
    <div className="border-t border-border/60 first:border-t-0">
      <div className="bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
        {hunk.header}
      </div>
      <div>
        {hunk.lines.map((line: GitDiffLine, idx) => {
          const isAdd = line.kind === "add";
          const isRemove = line.kind === "remove";
          const displayOld = isAdd ? "" : String(oldLine);
          const displayNew = isRemove ? "" : String(newLine);
          if (!isAdd) oldLine += 1;
          if (!isRemove) newLine += 1;

          return (
            <div
              key={idx}
              className={cn(
                "flex font-mono text-[11px] leading-[1.35]",
                isAdd && "bg-emerald-500/10",
                isRemove && "bg-rose-500/10",
              )}
            >
              <span className="w-8 shrink-0 select-none px-1 text-right text-[10px] text-muted-foreground/70">
                {displayOld}
              </span>
              <span className="w-8 shrink-0 select-none px-1 text-right text-[10px] text-muted-foreground/70">
                {displayNew}
              </span>
              <span
                className={cn(
                  "w-4 shrink-0 select-none text-center",
                  isAdd && "text-emerald-600 dark:text-emerald-400",
                  isRemove && "text-rose-600 dark:text-rose-400",
                  !isAdd && !isRemove && "text-muted-foreground/50",
                )}
              >
                {isAdd ? "+" : isRemove ? "-" : " "}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 whitespace-pre-wrap break-all pr-2",
                  isAdd && "text-emerald-700 dark:text-emerald-300",
                  isRemove && "text-rose-700 dark:text-rose-300",
                )}
              >
                {line.content || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffFileItem({ file }: { file: GitDiffFile }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[file.status] ?? STATUS_META.modified;
  const StatusIcon = meta.icon;
  const displayPath = getDisplayPath(file);
  const basename = getBasename(displayPath);
  const dirname = getDirname(displayPath);

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown
            aria-hidden="true"
            className="size-3 shrink-0 text-muted-foreground"
          />
        ) : (
          <ChevronRight
            aria-hidden="true"
            className="size-3 shrink-0 text-muted-foreground"
          />
        )}
        <StatusIcon
          aria-hidden="true"
          className={cn("size-3.5 shrink-0", meta.tone)}
        />
        <span className="min-w-0 flex-1 truncate text-xs" title={displayPath}>
          <span className="font-medium">{basename}</span>
          {dirname ? (
            <span className="ml-1 text-muted-foreground/80">{dirname}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums">
          {file.additions > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              +{file.additions}
            </span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="text-rose-600 dark:text-rose-400">
              −{file.deletions}
            </span>
          ) : null}
          <span className={cn("font-mono", meta.tone)}>{meta.label}</span>
        </span>
      </button>
      {open ? (
        <div className="border-t border-border/60 bg-background/60">
          {file.binary ? (
            <div className="px-2 py-2 text-[11px] italic text-muted-foreground">
              Binary file — diff not shown.
            </div>
          ) : file.hunks.length === 0 ? (
            <div className="px-2 py-2 text-[11px] italic text-muted-foreground">
              No textual changes to display.
            </div>
          ) : (
            file.hunks.map((hunk, idx) => (
              <DiffHunkBlock key={idx} hunk={hunk} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function GitChangesSection({
  worktreePath,
  active,
  onDraftCommitComment,
  isDraftPending = false,
  onViewCommitComments,
  committedCommentCount = 0,
}: GitChangesSectionProps) {
  const [files, setFiles] = useState<GitDiffFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const inflightRef = useRef(false);

  const fetchDiff = useCallback(async () => {
    if (!worktreePath || inflightRef.current) return;
    inflightRef.current = true;
    setIsLoading(true);
    try {
      const response = await gitDiff({ path: worktreePath });
      if (response.ok) {
        setFiles(response.files);
        setError(null);
      } else {
        setError(response.error ?? "Failed to read git diff.");
      }
    } catch {
      setError("Failed to read git diff.");
    } finally {
      inflightRef.current = false;
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [worktreePath]);

  useEffect(() => {
    setFiles([]);
    setError(null);
    setHasLoadedOnce(false);
  }, [worktreePath]);

  useEffect(() => {
    if (!active || !worktreePath) return;
    void fetchDiff();
    const interval = window.setInterval(() => {
      void fetchDiff();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [active, fetchDiff, worktreePath]);

  const totals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const file of files) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { additions, deletions };
  }, [files]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Changes
          </h2>
          {files.length > 0 ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {files.length}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[10px] tabular-nums">
          {totals.additions > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              +{totals.additions}
            </span>
          ) : null}
          {totals.deletions > 0 ? (
            <span className="text-rose-600 dark:text-rose-400">
              −{totals.deletions}
            </span>
          ) : null}
          {onDraftCommitComment ? (
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0"
              onClick={onDraftCommitComment}
              disabled={isDraftPending || files.length === 0 || !worktreePath}
              aria-label="Draft commit comment from changes and session"
              title="Draft commit comment (changes + Claude session)"
            >
              {isDraftPending ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          ) : null}
          {onViewCommitComments ? (
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0"
              onClick={onViewCommitComments}
              disabled={committedCommentCount === 0}
              aria-label="View previous commit comments"
              title="View previous commit comments"
            >
              <History aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={() => {
              void fetchDiff();
            }}
            disabled={isLoading || !worktreePath}
            aria-label="Refresh changes"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-3.5", isLoading && "animate-spin")}
            />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-1 px-3 py-6 text-center text-xs text-destructive">
            <span>{error}</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-3 py-6 text-center text-xs text-muted-foreground">
            <FileQuestion aria-hidden="true" className="size-5 opacity-60" />
            <span>{hasLoadedOnce ? "No changes" : "Loading changes…"}</span>
          </div>
        ) : (
          <ul className="text-foreground">
            {files.map((file) => (
              <li key={`${file.status}:${file.filePath}`}>
                <DiffFileItem file={file} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
