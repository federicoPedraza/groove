"use client";

import { Check, Copy, GitBranch } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { DashboardModals } from "@/src/components/pages/dashboard/dashboard-modals";
import { useDashboardState } from "@/src/components/pages/dashboard/hooks/use-dashboard-state";
import { SummaryViewerModal } from "@/src/components/pages/dashboard/summary-viewer-modal";
import { WorktreeRowActions } from "@/src/components/pages/dashboard/worktree-row-actions";
import { useAppLayout } from "@/src/components/pages/use-app-layout";
import { GrooveWorktreeTerminal } from "@/src/components/pages/worktrees/groove-worktree-terminal";
import { Card, CardContent } from "@/src/components/ui/card";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import type { SummaryRecord, WorkspaceMeta } from "@/src/lib/ipc";
import { grooveSummary, grooveTerminalOpen } from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";
import { playGrooveHookSound } from "@/src/lib/groove-sound-system";
import { deriveWorktreeStatus } from "@/src/lib/utils/worktree/status";

export default function WorktreeDetailPage() {
  const { worktree: worktreeParam } = useParams();
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
  } = useDashboardState(worktreeParam);

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

  const handleSummarizeWorktree = useCallback(
    (sessionId: string) => {
      if (!workspaceRoot || summarizingWorktreeIds.has(sessionId)) return;
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
          }
        })
        .catch(() => {
          toast.error("Summary request failed.");
        })
        .finally(() => {
          setSummarizingWorktreeIds((prev) => {
            const next = new Set(prev);
            next.delete(sessionId);
            return next;
          });
        });
    },
    [ipcWorkspaceMeta, summarizingWorktreeIds, worktreeRows, workspaceRoot],
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
  useAppLayout({
    pageSidebar: () => null,
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

  return (
    <>
      {!activeWorkspace ? null : (
        <div className="space-y-3">
          <header className="rounded-lg border bg-card p-4">
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
              Worktree: {selectedWorktreeInspectionLabel}
            </h1>
          </header>

          {!hasWorktreesDirectory ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No <code>.worktrees</code> directory found under this workspace
                root yet.
              </CardContent>
            </Card>
          ) : null}

          {row && status ? (
            <>
              <div className="grid gap-2 rounded-lg border bg-card px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3">
                <div className="group flex min-w-0 items-center gap-2 px-2 py-1 text-sm">
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
                      void runStopAction(targetRow);
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
                  />
                </TooltipProvider>
              </div>

              {workspaceRoot && workspaceMeta ? (
                <GrooveWorktreeTerminal
                  workspaceRoot={workspaceRoot}
                  workspaceMeta={workspaceMeta}
                  knownWorktrees={knownWorktrees}
                  worktree={row.worktree}
                  runningSessionIds={[]}
                />
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent className="space-y-2 py-6">
                <p className="text-sm text-muted-foreground">
                  Worktree <code>{selectedWorktreeName || "(empty)"}</code> is
                  not available in the active workspace.
                </p>
                {recentDirectories.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Tip: switch to the correct workspace from Dashboard if this
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

          <DashboardModals
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
