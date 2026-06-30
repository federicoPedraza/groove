"use client";

import { Check, Copy, GitBranch } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BarracksModals } from "@/src/components/pages/barracks/barracks-modals";
import { CommentViewerModal } from "@/src/components/pages/barracks/comment-viewer-modal";
import { CommitCommentsHistoryModal } from "@/src/components/pages/worktrees/commit-comments-history-modal";
import { useBarracksState } from "@/src/components/pages/barracks/hooks/use-barracks-state";
import type { WorktreeRow } from "@/src/components/pages/barracks/types";
import { SummaryViewerModal } from "@/src/components/pages/barracks/summary-viewer-modal";
import { WorktreeRowActions } from "@/src/components/pages/barracks/worktree-row-actions";
import { PageHeader } from "@/src/components/pages/page-header";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import { GrooveWorktreeTerminal } from "@/src/components/pages/worktrees/groove-worktree-terminal";
import { PrInspectorPane } from "@/src/components/pages/worktrees/pr-inspector-pane";
import { ProfiledRegion } from "@/src/lib/profiled-region";
import {
  WorktreeInspectorPanel,
  type InspectorSection,
} from "@/src/components/pages/worktrees/worktree-inspector-panel";
import { Card, CardContent } from "@/src/components/ui/card";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import type {
  CommentRecord,
  PullRequestRecord,
  SummaryRecord,
  WorkspaceMeta,
} from "@/src/lib/ipc";
import {
  gitAdd,
  gitCommit,
  grooveComment,
  grooveCommentMarkCommitted,
  grooveSummary,
  grooveTerminalListSessions,
  grooveTerminalOpen,
  grooveTerminalWrite,
} from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";
import { playGrooveHookSound } from "@/src/lib/groove-sound-system";
import { cn } from "@/src/lib/utils";
import { detectTerminalInstanceKind } from "@/src/lib/utils/worktree/process-grouping";
import {
  deriveWorktreeStatus,
  getActiveWorktreeRows,
} from "@/src/lib/utils/worktree/status";

export default function WorktreeDetailPage() {
  const { worktree: worktreeParam } = useParams();
  const navigate = useNavigate();
  const {
    activeWorkspace,
    worktreeRows,
    hasWorktreesDirectory,
    statusMessage,
    errorMessage,
    isBusy,
    isWorkspaceHydrating,
    pendingRestoreActions,
    pendingCutGrooveActions,
    pendingStopActions,
    pendingPlayActions,
    copiedBranchPath,
    isCloseWorkspaceConfirmOpen,
    cutConfirmRow,
    forceCutConfirmRow,
    activeTerminalWorktrees,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceRoot,
    recentDirectories,
    forceCutConfirmLoading,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setIsCreateModalOpen,
    setCreateBranch,
    setCreateBase,
    pickDirectory,
    openRecentDirectory,
    runRestoreAction,
    runCutGrooveAction,
    runStopAction,
    runPlayGrooveAction,
    runCreateWorktreeAction,
    copyBranchName,
    closeCurrentWorkspace,
    workspaceMeta,
    mutedWorktrees,
    toggleWorktreeMute,
  } = useBarracksState(worktreeParam);

  const ipcWorkspaceMeta = activeWorkspace?.workspaceMeta as
    | WorkspaceMeta
    | undefined;

  const [summarizingWorktreeIds, setSummarizingWorktreeIds] = useState<
    Set<string>
  >(new Set());
  const [viewingSummaryState, setViewingSummaryState] = useState<{
    summaries: SummaryRecord[];
    initialIndex: number;
    worktreeIds: string[];
  } | null>(null);
  const [commentingWorktrees, setCommentingWorktrees] = useState<Set<string>>(
    new Set(),
  );
  const [viewingComment, setViewingComment] = useState<{
    worktree: string;
    comment: CommentRecord;
  } | null>(null);
  const [attackPendingFor, setAttackPendingFor] = useState<
    "single" | "all" | null
  >(null);
  const [isCommitHistoryOpen, setIsCommitHistoryOpen] = useState(false);
  const [inspector, setInspector] = useState<{
    expanded: boolean;
    section: InspectorSection;
  }>({ expanded: false, section: "changes" });

  const toggleInspectorExpanded = useCallback(() => {
    setInspector((prev) => ({ ...prev, expanded: !prev.expanded }));
  }, []);

  const selectInspectorSection = useCallback((section: InspectorSection) => {
    setInspector((prev) =>
      prev.expanded && prev.section === section
        ? { ...prev, expanded: false }
        : { expanded: true, section },
    );
  }, []);

  // PR inspector "fake terminal" panes, shown in the terminal column. Ephemeral
  // and reset when the worktree changes (see the effect below).
  const [openPrPanes, setOpenPrPanes] = useState<PullRequestRecord[]>([]);
  const [minimizedPrPanes, setMinimizedPrPanes] = useState<Set<string>>(
    new Set(),
  );

  const openPrInspector = useCallback((record: PullRequestRecord) => {
    setOpenPrPanes((prev) =>
      prev.some((pane) => pane.url === record.url) ? prev : [...prev, record],
    );
    setMinimizedPrPanes((prev) => {
      if (!prev.has(record.url)) return prev;
      const next = new Set(prev);
      next.delete(record.url);
      return next;
    });
  }, []);

  const closePrPane = useCallback((url: string) => {
    setOpenPrPanes((prev) => prev.filter((pane) => pane.url !== url));
    setMinimizedPrPanes((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);

  const toggleMinimizePrPane = useCallback((url: string) => {
    setMinimizedPrPanes((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const worktreeSummaries = useMemo(() => {
    const records = ipcWorkspaceMeta?.worktreeRecords;
    if (!records) return {};
    const result: Record<string, SummaryRecord[]> = {};
    for (const [, record] of Object.entries(records)) {
      if (record.summaries && record.summaries.length > 0) {
        result[record.id] = record.summaries;
      }
    }
    return result;
  }, [ipcWorkspaceMeta?.worktreeRecords]);

  const summarizePendingBaselineRef = useRef<Map<string, number>>(new Map());

  const clearSummarizePending = useCallback((sessionId: string) => {
    summarizePendingBaselineRef.current.delete(sessionId);
    setSummarizingWorktreeIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (summarizingWorktreeIds.size === 0) return;
    const idsToClear: string[] = [];
    for (const sessionId of summarizingWorktreeIds) {
      const baseline = summarizePendingBaselineRef.current.get(sessionId);
      if (baseline === undefined) continue;
      const currentCount = worktreeSummaries[sessionId]?.length ?? 0;
      if (currentCount > baseline) {
        idsToClear.push(sessionId);
      }
    }
    if (idsToClear.length === 0) return;
    for (const id of idsToClear) {
      summarizePendingBaselineRef.current.delete(id);
    }
    setSummarizingWorktreeIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToClear) next.delete(id);
      return next;
    });
  }, [summarizingWorktreeIds, worktreeSummaries]);

  const worktreeComments = useMemo(() => {
    const records = ipcWorkspaceMeta?.worktreeRecords;
    if (!records) return {};
    const result: Record<string, CommentRecord[]> = {};
    for (const [worktreeName, record] of Object.entries(records)) {
      if (record.comments && record.comments.length > 0) {
        result[worktreeName] = record.comments;
      }
    }
    return result;
  }, [ipcWorkspaceMeta?.worktreeRecords]);

  const commentPendingBaselineRef = useRef<Map<string, number>>(new Map());

  const clearCommentPending = useCallback((worktree: string) => {
    commentPendingBaselineRef.current.delete(worktree);
    setCommentingWorktrees((prev) => {
      if (!prev.has(worktree)) return prev;
      const next = new Set(prev);
      next.delete(worktree);
      return next;
    });
  }, []);

  useEffect(() => {
    if (commentingWorktrees.size === 0) return;
    const toClear: string[] = [];
    for (const worktree of commentingWorktrees) {
      const baseline = commentPendingBaselineRef.current.get(worktree);
      if (baseline === undefined) continue;
      const currentCount = worktreeComments[worktree]?.length ?? 0;
      if (currentCount > baseline) {
        toClear.push(worktree);
      }
    }
    if (toClear.length === 0) return;
    for (const w of toClear) commentPendingBaselineRef.current.delete(w);
    setCommentingWorktrees((prev) => {
      const next = new Set(prev);
      for (const w of toClear) next.delete(w);
      return next;
    });
  }, [commentingWorktrees, worktreeComments]);

  const handleCommentWorktree = useCallback(
    (worktree: string) => {
      if (!workspaceRoot || commentingWorktrees.has(worktree)) return;
      commentPendingBaselineRef.current.set(
        worktree,
        worktreeComments[worktree]?.length ?? 0,
      );
      setCommentingWorktrees((prev) => new Set(prev).add(worktree));

      void grooveComment({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows
          .filter((r) => r.status !== "deleted")
          .map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        worktree,
      })
        .then((response) => {
          if (!response.ok || !response.comment) {
            toast.error(response.error ?? "Commit comment failed.");
            clearCommentPending(worktree);
          }
        })
        .catch(() => {
          toast.error("Commit comment request failed.");
          clearCommentPending(worktree);
        });
    },
    [
      clearCommentPending,
      commentingWorktrees,
      ipcWorkspaceMeta,
      worktreeComments,
      worktreeRows,
      workspaceRoot,
    ],
  );

  // Changes-panel variant: draft from the diff AND the Claude conversation since
  // the last commit, then open the viewer so the user can review and commit.
  const handleDraftCommitCommentFromSession = useCallback(
    (worktree: string) => {
      if (!workspaceRoot || commentingWorktrees.has(worktree)) return;
      commentPendingBaselineRef.current.set(
        worktree,
        worktreeComments[worktree]?.length ?? 0,
      );
      setCommentingWorktrees((prev) => new Set(prev).add(worktree));

      void grooveComment({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows
          .filter((r) => r.status !== "deleted")
          .map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        worktree,
        includeSession: true,
      })
        .then((response) => {
          if (!response.ok || !response.comment) {
            toast.error(response.error ?? "Commit comment failed.");
            clearCommentPending(worktree);
            return;
          }
          setViewingComment({ worktree, comment: response.comment });
        })
        .catch(() => {
          toast.error("Commit comment request failed.");
          clearCommentPending(worktree);
        });
    },
    [
      clearCommentPending,
      commentingWorktrees,
      ipcWorkspaceMeta,
      worktreeComments,
      worktreeRows,
      workspaceRoot,
    ],
  );

  const runAttack = useCallback(
    async (mode: "single" | "all") => {
      if (!viewingComment || attackPendingFor !== null) return;
      const targetRow = worktreeRows.find(
        (r) => r.worktree === viewingComment.worktree,
      );
      if (!targetRow) {
        toast.error("Worktree not found.");
        return;
      }
      const message = viewingComment.comment.message;
      const createdAt = viewingComment.comment.createdAt;
      const knownWorktrees = worktreeRows
        .filter((r) => r.status !== "deleted")
        .map((r) => r.worktree);

      setAttackPendingFor(mode);
      try {
        if (mode === "all") {
          const addResp = await gitAdd({ path: targetRow.path });
          if (!addResp.ok) {
            toast.error(addResp.error ?? "git add failed.");
            return;
          }
        }
        const commitResp = await gitCommit({
          path: targetRow.path,
          message,
        });
        if (!commitResp.ok) {
          toast.error(commitResp.error ?? "git commit failed.");
          return;
        }
        const markResp = await grooveCommentMarkCommitted({
          rootName: ipcWorkspaceMeta?.rootName ?? "",
          knownWorktrees,
          workspaceMeta: ipcWorkspaceMeta,
          worktree: viewingComment.worktree,
          createdAt,
        });
        if (!markResp.ok || !markResp.comment) {
          toast.warning(
            markResp.error ?? "Commit succeeded but persisting state failed.",
          );
          return;
        }
        toast.success("Committed.");
        setViewingComment({
          worktree: viewingComment.worktree,
          comment: markResp.comment,
        });
      } catch {
        toast.error("Commit request failed.");
      } finally {
        setAttackPendingFor(null);
      }
    },
    [attackPendingFor, ipcWorkspaceMeta, viewingComment, worktreeRows],
  );

  const handleSummarizeWorktree = useCallback(
    (sessionId: string) => {
      if (!workspaceRoot || summarizingWorktreeIds.has(sessionId)) return;
      summarizePendingBaselineRef.current.set(
        sessionId,
        worktreeSummaries[sessionId]?.length ?? 0,
      );
      setSummarizingWorktreeIds((prev) => new Set(prev).add(sessionId));
      playGrooveHookSound("summaryStart");

      void grooveSummary({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows
          .filter((r) => r.status !== "deleted")
          .map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        sessionIds: [sessionId],
      })
        .then((response) => {
          playGrooveHookSound("summaryEnd");
          if (!response.ok) {
            toast.error(response.error ?? "Summary failed.");
            clearSummarizePending(sessionId);
            return;
          }
          const successEntry = response.summaries.find((s) => s.ok);
          if (!successEntry?.summary) {
            const errorDetail = response.summaries.find((s) => !s.ok)?.error;
            toast.warning(
              errorDetail
                ? `Summary unavailable: ${errorDetail}`
                : "Session summary unavailable.",
            );
            clearSummarizePending(sessionId);
          }
        })
        .catch(() => {
          toast.error("Summary request failed.");
          clearSummarizePending(sessionId);
        });
    },
    [
      clearSummarizePending,
      ipcWorkspaceMeta,
      summarizingWorktreeIds,
      worktreeRows,
      worktreeSummaries,
      workspaceRoot,
    ],
  );

  const selectedWorktreeName = useMemo(() => {
    if (!worktreeParam) {
      return "";
    }

    try {
      return decodeURIComponent(worktreeParam);
    } catch {
      return worktreeParam;
    }
  }, [worktreeParam]);

  // PR inspector panes are scoped to a worktree; clear them when it changes.
  useEffect(() => {
    setOpenPrPanes([]);
    setMinimizedPrPanes(new Set());
  }, [selectedWorktreeName]);

  const row = worktreeRows.find(
    (candidateRow) => candidateRow.worktree === selectedWorktreeName,
  );
  const hasActiveTerminal = row
    ? activeTerminalWorktrees.has(row.worktree)
    : false;
  const status = row
    ? deriveWorktreeStatus(row.status, hasActiveTerminal)
    : null;
  const restoreActionKey = row ? `${row.path}:restore` : "";
  const cutActionKey = row ? `${row.path}:cut` : "";
  const stopActionKey = row ? `${row.path}:stop` : "";
  const playActionKey = row ? `${row.path}:play` : "";
  const restorePending = pendingRestoreActions.includes(restoreActionKey);
  const cutPending = pendingCutGrooveActions.includes(cutActionKey);
  const stopPending = pendingStopActions.includes(stopActionKey);
  const playPending = pendingPlayActions.includes(playActionKey);
  const rowPending = restorePending || cutPending || stopPending || playPending;
  const selectedWorktreeInspectionLabel = selectedWorktreeName ?? "Worktree";
  const knownWorktrees = useMemo(
    () =>
      worktreeRows
        .filter((candidateRow) => candidateRow.status !== "deleted")
        .map((candidateRow) => candidateRow.worktree),
    [worktreeRows],
  );
  const branchCopied = row ? copiedBranchPath === row.path : false;
  const selectedCommittedComments = useMemo(
    () =>
      row
        ? (worktreeComments[row.worktree] ?? []).filter(
            (comment) => comment.state === "committed",
          )
        : [],
    [row, worktreeComments],
  );
  const emptyPageSidebar = useCallback(() => null, []);
  useAppLayout({
    pageSidebar: emptyPageSidebar,
    noDirectoryOpenState: {
      isVisible: !isWorkspaceHydrating && !activeWorkspace,
      isBusy,
      statusMessage,
      errorMessage,
      onSelectDirectory: pickDirectory,
      onOpenRecentDirectory: openRecentDirectory,
    },
  });

  const handleOpenInAppTerminal = useCallback(
    async (worktree: string): Promise<void> => {
      if (!workspaceMeta) {
        toast.error("Select a workspace before opening a terminal.");
        return;
      }

      try {
        const result = await grooveTerminalOpen({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree,
          openMode: "plain",
          openNew: true,
        });

        if (result.ok) {
          toast.success("Opened in-app terminal.", {
            command: "groove_restore",
          });
          return;
        }

        toast.error(
          result.error
            ? `Failed to open in-app terminal: ${result.error}`
            : "Failed to open in-app terminal.",
          { command: "groove_restore" },
        );
      } catch {
        toast.error("In-app terminal open request failed.", {
          command: "groove_restore",
        });
      }
    },
    [knownWorktrees, workspaceMeta],
  );

  // Append a PR comment to the oldest open Claude session for the worktree.
  const sendCommentToClaude = useCallback(
    async (worktree: string, text: string): Promise<void> => {
      if (!workspaceMeta) {
        toast.error("Select a workspace before sending to Claude.");
        return;
      }
      const content = text.trim();
      if (!content) {
        return;
      }
      const context = {
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
        worktree,
      };
      try {
        const listed = await grooveTerminalListSessions(context);
        if (!listed.ok) {
          toast.error(listed.error ?? "Failed to list terminal sessions.");
          return;
        }
        const oldestClaude = listed.sessions
          .filter((session) => session.worktree === worktree)
          .filter(
            (session) =>
              detectTerminalInstanceKind(session.command) === "Claude",
          )
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
        if (!oldestClaude) {
          toast.error("No open Claude session in this worktree.");
          return;
        }
        const result = await grooveTerminalWrite({
          ...context,
          sessionId: oldestClaude.sessionId,
          input: content,
        });
        if (result.ok) {
          toast.success("Sent to Claude.");
        } else {
          toast.error(result.error ?? "Failed to send to Claude.");
        }
      } catch {
        toast.error("Send to Claude request failed.");
      }
    },
    [knownWorktrees, workspaceMeta],
  );

  // Pause Groove for a worktree, then leave its detail view: jump to the next
  // (or previous) still-open worktree, falling back to the dashboard when none
  // remain open.
  const handlePauseGroove = useCallback(
    async (targetRow: WorktreeRow): Promise<void> => {
      const openRows = getActiveWorktreeRows(
        worktreeRows,
        activeTerminalWorktrees,
      );
      const currentIndex = openRows.findIndex(
        (candidate) => candidate.worktree === targetRow.worktree,
      );
      const nextOpenRow =
        currentIndex >= 0
          ? (openRows[currentIndex + 1] ?? openRows[currentIndex - 1] ?? null)
          : (openRows.find(
              (candidate) => candidate.worktree !== targetRow.worktree,
            ) ?? null);

      const paused = await runStopAction(targetRow);
      if (!paused) {
        return;
      }

      if (nextOpenRow) {
        navigate(`/worktrees/${encodeURIComponent(nextOpenRow.worktree)}`);
      } else {
        navigate("/");
      }
    },
    [activeTerminalWorktrees, navigate, runStopAction, worktreeRows],
  );

  return (
    <>
      {!activeWorkspace ? null : (
        <div className="space-y-3">
          <PageHeader
            title={`Worktree: ${selectedWorktreeInspectionLabel}`}
            description={
              row ? (
                <div className="group flex min-w-0 items-center gap-2 text-sm">
                  <GitBranch
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 truncate select-text">
                    {row.branchGuess}
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
                    onClick={() => {
                      void copyBranchName(row);
                    }}
                    aria-label={`Copy branch name ${row.branchGuess}`}
                  >
                    {branchCopied ? (
                      <Check
                        aria-hidden="true"
                        className="size-3.5 text-emerald-700"
                      />
                    ) : (
                      <Copy aria-hidden="true" className="size-3.5" />
                    )}
                  </button>
                </div>
              ) : undefined
            }
            actions={
              row && status ? (
                <TooltipProvider>
                <WorktreeRowActions
                  row={row}
                  status={status}
                  rowPending={rowPending}
                  restorePending={restorePending}
                  cutPending={cutPending}
                  stopPending={stopPending}
                  playPending={playPending}
                  onRepair={(targetRow) => {
                    void runRestoreAction(targetRow);
                  }}
                  onPlay={(targetRow) => {
                    void runPlayGrooveAction(targetRow);
                  }}
                  onStop={(targetRow) => {
                    void handlePauseGroove(targetRow);
                  }}
                  onCutConfirm={setCutConfirmRow}
                  variant="worktree-detail"
                  onOpenTerminal={(worktree) => {
                    void handleOpenInAppTerminal(worktree);
                  }}
                  closeWorktreePending={false}
                  isNotificationMuted={mutedWorktrees.has(row.worktree)}
                  onToggleMute={() => {
                    toggleWorktreeMute(row.worktree);
                  }}
                  onSummarize={handleSummarizeWorktree}
                  isSummarizePending={
                    row.worktreeId
                      ? summarizingWorktreeIds.has(row.worktreeId)
                      : false
                  }
                  onViewSummary={(summary) => {
                    const worktreeId = summary.worktreeIds[0];
                    const allWorktreeSummaries = worktreeId
                      ? (worktreeSummaries[worktreeId] ?? [summary])
                      : [summary];
                    const idx = allWorktreeSummaries.findIndex(
                      (s) => s.createdAt === summary.createdAt,
                    );
                    setViewingSummaryState({
                      summaries: allWorktreeSummaries,
                      initialIndex:
                        idx >= 0 ? idx : allWorktreeSummaries.length - 1,
                      worktreeIds: summary.worktreeIds,
                    });
                  }}
                  latestSummary={
                    row.worktreeId
                      ? (worktreeSummaries[row.worktreeId]?.at(-1) ?? null)
                      : null
                  }
                  onComment={handleCommentWorktree}
                  isCommentPending={commentingWorktrees.has(row.worktree)}
                  onViewComment={(comment) => {
                    setViewingComment({
                      worktree: row.worktree,
                      comment,
                    });
                  }}
                  latestComment={
                    worktreeComments[row.worktree]?.at(-1) ?? null
                  }
                />
              </TooltipProvider>
              ) : null
            }
          />

          {!hasWorktreesDirectory ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No <code>.worktrees</code> directory found under{" "}
                {activeWorkspace?.workspaceMeta?.rootDirectory ? (
                  <>
                    the scope directory{" "}
                    <code>{activeWorkspace.workspaceMeta.rootDirectory}</code>
                  </>
                ) : (
                  "this workspace root"
                )}
                {" "}yet.
              </CardContent>
            </Card>
          ) : null}

          {row && status ? (
            workspaceRoot && workspaceMeta ? (
              <div className="flex min-h-0 flex-col gap-3 lg:flex-row lg:items-stretch">
                <div className="min-w-0 flex-1 space-y-3">
                  {/* PR inspector "fake terminals" stack above the real ones. */}
                  {/*
                    Key on the worktree so navigating between two worktree detail
                    views cleanly unmounts the previous terminals and mounts fresh
                    ones. Without a key, the same instance is reused and every
                    still-mounted pane re-runs its payload-keyed effects (snapshot
                    re-fetch, observer rebuild, resize IPC) with the new worktree
                    before unmounting — a burst of wasted work that janks the
                    transition.
                  */}
                  <ProfiledRegion id="worktree-terminal">
                    <GrooveWorktreeTerminal
                      key={`${workspaceRoot}:${row.worktree}`}
                      workspaceRoot={workspaceRoot}
                      workspaceMeta={workspaceMeta}
                      knownWorktrees={knownWorktrees}
                      worktree={row.worktree}
                      runningSessionIds={[]}
                      onPauseWorktree={() => {
                        void handlePauseGroove(row);
                      }}
                    />
                  </ProfiledRegion>
                  {/* PR inspector "fake terminals" append below the real ones,
                      like pressing "new terminal". */}
                  {openPrPanes.map((pane) => {
                    const isMinimized = minimizedPrPanes.has(pane.url);
                    return (
                      <div
                        key={pane.url}
                        style={
                          isMinimized
                            ? undefined
                            : { height: "60vh", minHeight: "280px" }
                        }
                      >
                        <PrInspectorPane
                          worktreePath={row.path}
                          record={pane}
                          minimized={isMinimized}
                          onToggleMinimize={() => {
                            toggleMinimizePrPane(pane.url);
                          }}
                          onClose={() => {
                            closePrPane(pane.url);
                          }}
                          onSendCommentToClaude={(text) => {
                            void sendCommentToClaude(row.worktree, text);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div
                  className={cn(
                    "flex shrink-0",
                    inspector.expanded
                      ? "w-full lg:w-80 xl:w-96"
                      : "w-full lg:w-9",
                  )}
                >
                  <WorktreeInspectorPanel
                    worktreePath={row.path}
                    worktree={row.worktree}
                    rootName={ipcWorkspaceMeta?.rootName ?? ""}
                    knownWorktrees={knownWorktrees}
                    workspaceMeta={ipcWorkspaceMeta}
                    pullRequests={
                      ipcWorkspaceMeta?.worktreeRecords?.[row.worktree]
                        ?.pullRequests ?? []
                    }
                    expanded={inspector.expanded}
                    activeSection={inspector.section}
                    onToggleExpanded={toggleInspectorExpanded}
                    onSelectSection={selectInspectorSection}
                    onDraftCommitComment={() => {
                      handleDraftCommitCommentFromSession(row.worktree);
                    }}
                    isDraftPending={commentingWorktrees.has(row.worktree)}
                    onViewCommitComments={() => {
                      setIsCommitHistoryOpen(true);
                    }}
                    committedCommentCount={selectedCommittedComments.length}
                    onOpenPrInspector={openPrInspector}
                  />
                </div>
              </div>
            ) : null
          ) : (
            <Card>
              <CardContent className="space-y-2 py-6">
                <p className="text-sm text-muted-foreground">
                  Worktree <code>{selectedWorktreeName || "(empty)"}</code> is
                  not available in the active workspace.
                </p>
                {recentDirectories.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Tip: switch to the correct workspace from Barracks if this
                    worktree exists elsewhere.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {statusMessage ? (
            <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              {statusMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <SummaryViewerModal
            summaries={viewingSummaryState?.summaries ?? []}
            initialIndex={viewingSummaryState?.initialIndex ?? 0}
            open={viewingSummaryState !== null}
            onClose={() => {
              setViewingSummaryState(null);
            }}
            onCreateNewSummary={
              viewingSummaryState?.worktreeIds.length === 1
                ? () => {
                    handleSummarizeWorktree(viewingSummaryState.worktreeIds[0]);
                  }
                : undefined
            }
            isCreatePending={summarizingWorktreeIds.size > 0}
          />

          <CommentViewerModal
            comment={viewingComment?.comment ?? null}
            open={viewingComment !== null}
            onClose={() => {
              setViewingComment(null);
            }}
            onAttack={() => {
              void runAttack("single");
            }}
            onAttackAll={() => {
              void runAttack("all");
            }}
            isAttackPending={attackPendingFor === "single"}
            isAttackAllPending={attackPendingFor === "all"}
          />

          <CommitCommentsHistoryModal
            comments={selectedCommittedComments}
            open={isCommitHistoryOpen}
            onClose={() => {
              setIsCommitHistoryOpen(false);
            }}
          />

          <BarracksModals
            workspaceRoot={workspaceRoot}
            cutConfirmRow={cutConfirmRow}
            setCutConfirmRow={setCutConfirmRow}
            forceCutConfirmRow={forceCutConfirmRow}
            setForceCutConfirmRow={setForceCutConfirmRow}
            forceCutConfirmLoading={forceCutConfirmLoading}
            isCloseWorkspaceConfirmOpen={isCloseWorkspaceConfirmOpen}
            setIsCloseWorkspaceConfirmOpen={setIsCloseWorkspaceConfirmOpen}
            isBusy={isBusy}
            isCreateModalOpen={isCreateModalOpen}
            setIsCreateModalOpen={setIsCreateModalOpen}
            createBranch={createBranch}
            createBase={createBase}
            isCreatePending={isCreatePending}
            setCreateBranch={setCreateBranch}
            setCreateBase={setCreateBase}
            onRunCutGrooveAction={(targetRow, force) => {
              void runCutGrooveAction(targetRow, force);
            }}
            onCloseCurrentWorkspace={() => {
              void closeCurrentWorkspace();
            }}
            onRunCreateWorktreeAction={(options) => {
              void runCreateWorktreeAction(options);
            }}
          />
        </div>
      )}
    </>
  );
}
