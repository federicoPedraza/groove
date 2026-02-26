"use client";

import { Check, Copy, GitBranch } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { DashboardModals } from "@/components/pages/dashboard/dashboard-modals";
import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import { WorktreeRowActions } from "@/components/pages/dashboard/worktree-row-actions";
import { PageShell } from "@/components/pages/page-shell";
import { GrooveWorktreeTerminal } from "@/components/pages/worktrees/groove-worktree-terminal";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/lib/toast";
import { deriveWorktreeStatus } from "@/lib/utils/worktree/status";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import {
  GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL,
  GROOVE_PLAY_COMMAND_SENTINEL,
  grooveTerminalClose,
  grooveTerminalListSessions,
  grooveTerminalOpen,
} from "@/src/lib/ipc";

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
    runtimeStateByWorktree,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceMeta,
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
    runStartTestingInstanceSeparateTerminalAction,
    runOpenTestingTerminalAction,
    isTestingInstancePending,
    closeCurrentWorkspace,
  } = useDashboardState();
  const [isClosingWorktree, setIsClosingWorktree] = useState(false);
  const [isStartingInAppTerminal, setIsStartingInAppTerminal] = useState(false);
  const [runningTerminalSessionIds, setRunningTerminalSessionIds] = useState<string[]>([]);

  const selectedWorktreeName = (() => {
    if (!worktreeParam) {
      return "";
    }

    try {
      return decodeURIComponent(worktreeParam);
    } catch {
      return worktreeParam;
    }
  })();
  const row = worktreeRows.find((candidateRow) => candidateRow.worktree === selectedWorktreeName);
  const runtimeRow = row ? runtimeStateByWorktree[row.worktree] : undefined;
  const status = row ? deriveWorktreeStatus(row.status, runtimeRow) : null;
  const restoreActionKey = row ? `${row.path}:restore` : "";
  const cutActionKey = row ? `${row.path}:cut` : "";
  const stopActionKey = row ? `${row.path}:stop` : "";
  const playActionKey = row ? `${row.path}:play` : "";
  const restorePending = pendingRestoreActions.includes(restoreActionKey);
  const cutPending = pendingCutGrooveActions.includes(cutActionKey);
  const stopPending = pendingStopActions.includes(stopActionKey);
  const playPending = pendingPlayActions.includes(playActionKey);
  const rowPending = restorePending || cutPending || stopPending || playPending;
  const hasConnectedRepository = Boolean(activeWorkspace?.workspaceRoot);
  const knownWorktrees = worktreeRows.filter((candidateRow) => candidateRow.status !== "deleted").map((candidateRow) => candidateRow.worktree);
  const isGrooveMode =
    workspaceMeta?.playGrooveCommand?.trim() === GROOVE_PLAY_COMMAND_SENTINEL ||
    workspaceMeta?.openTerminalAtWorktreeCommand?.trim() === GROOVE_OPEN_TERMINAL_COMMAND_SENTINEL;
  const branchCopied = row ? copiedBranchPath === row.path : false;

  const handleCloseWorktree = useCallback(
    async (targetRow: WorktreeRow): Promise<void> => {
      if (!workspaceMeta || isClosingWorktree) {
        return;
      }

      const payloadBase = {
        rootName: workspaceMeta.rootName,
        knownWorktrees,
        workspaceMeta,
        worktree: targetRow.worktree,
      };

      setIsClosingWorktree(true);
      try {
        const listResult = await grooveTerminalListSessions(payloadBase);
        if (!listResult.ok) {
          toast.error(listResult.error ?? "Failed to list in-app terminal sessions.");
          return;
        }

        if (listResult.sessions.length === 0) {
          toast.info("No in-app terminal sessions to close.");
          return;
        }

        const closeResults = await Promise.allSettled(
          listResult.sessions.map((session) => grooveTerminalClose({ ...payloadBase, sessionId: session.sessionId })),
        );

        let closedCount = 0;
        let failedCount = 0;
        closeResults.forEach((result) => {
          if (result.status === "fulfilled" && result.value.ok) {
            closedCount += 1;
            return;
          }
          failedCount += 1;
        });

        if (failedCount === 0) {
          setRunningTerminalSessionIds([]);
          toast.success(`Closed ${String(closedCount)} in-app terminal session${closedCount === 1 ? "" : "s"}.`);
          return;
        }

        toast.error(`Closed ${String(closedCount)} session${closedCount === 1 ? "" : "s"}; ${String(failedCount)} failed.`);
      } catch {
        toast.error("Failed to close in-app terminal sessions.");
      } finally {
        setIsClosingWorktree(false);
      }
    },
    [isClosingWorktree, knownWorktrees, workspaceMeta],
  );

  const handleOpenInAppSplit = useCallback(
    async (worktree: string, openMode: "opencode" | "runLocal", shouldMarkAsRunningTerminal: boolean): Promise<void> => {
      if (!workspaceMeta || !row) {
        toast.error("Open a workspace and worktree before starting a terminal.");
        return;
      }

      setIsStartingInAppTerminal(true);
      try {
        const result = await grooveTerminalOpen({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree,
          target: row.branchGuess,
          openMode,
          forceRestart: false,
          openNew: true,
        });

        if (!result.ok || !result.session) {
          toast.error(result.error ?? "Failed to open in-app terminal split.");
          return;
        }

        const sessionId = result.session.sessionId;

        if (shouldMarkAsRunningTerminal) {
          setRunningTerminalSessionIds((previous) => {
            if (previous.includes(sessionId)) {
              return previous;
            }
            return [...previous, sessionId];
          });
          toast.success("Opened running terminal split.");
          return;
        }

        toast.success("Opened in-app terminal split.");
      } catch {
        toast.error("Failed to open in-app terminal split.");
      } finally {
        setIsStartingInAppTerminal(false);
      }
    },
    [knownWorktrees, row, workspaceMeta],
  );

  return (
    <PageShell
      noDirectoryOpenState={{
        isVisible: !isWorkspaceHydrating && !activeWorkspace,
        isBusy,
        statusMessage,
        errorMessage,
        onSelectDirectory: pickDirectory,
        onOpenRecentDirectory: openRecentDirectory,
      }}
    >
      {!activeWorkspace ? null : (
        <div className="space-y-3">
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
            <h1 className="text-xl font-semibold tracking-tight">Worktree: {selectedWorktreeName || "Worktree"}</h1>
            <Link to="/worktrees" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Back to Worktrees
            </Link>
          </header>

          {!hasWorktreesDirectory ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">No <code>.worktrees</code> directory found under this workspace root yet.</CardContent>
            </Card>
          ) : null}

          {row && status ? (
            <>
              <div className="grid gap-2 rounded-lg border px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3">
                <div className="group flex min-w-0 items-center gap-2 px-2 py-1 text-sm">
                  <GitBranch aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate select-text">{row.branchGuess}</span>
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
                    onClick={() => {
                      void copyBranchName(row);
                    }}
                    aria-label={`Copy branch name ${row.branchGuess}`}
                  >
                    {branchCopied ? <Check aria-hidden="true" className="size-3.5 text-emerald-700" /> : <Copy aria-hidden="true" className="size-3.5" />}
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
                    runtimeRow={runtimeRow}
                    hasConnectedRepository={hasConnectedRepository}
                    repositoryRemoteUrl={activeWorkspace?.repositoryRemoteUrl}
                    onRepair={(targetRow) => {
                      void runRestoreAction(targetRow);
                    }}
                    onPlay={(targetRow) => {
                      void runPlayGrooveAction(targetRow);
                    }}
                    onStop={(targetRow, targetRuntimeRow) => {
                      void runStopAction(targetRow, targetRuntimeRow);
                    }}
                    onCutConfirm={setCutConfirmRow}
                    variant="worktree-detail"
                    isTestingInstancePending={isTestingInstancePending || isStartingInAppTerminal}
                    onRunLocal={(worktree) => {
                      if (isGrooveMode) {
                        void handleOpenInAppSplit(worktree, "runLocal", true);
                        return;
                      }

                      void runStartTestingInstanceSeparateTerminalAction(worktree);
                    }}
                    onOpenTerminal={(worktree) => {
                      void runOpenTestingTerminalAction(worktree);
                    }}
                    onCloseWorktree={(targetRow) => {
                      void handleCloseWorktree(targetRow);
                    }}
                    closeWorktreePending={isClosingWorktree}
                  />
                </TooltipProvider>
              </div>

              {isGrooveMode ? (
                workspaceRoot && workspaceMeta ? (
                  <GrooveWorktreeTerminal
                    workspaceRoot={workspaceRoot}
                    workspaceMeta={workspaceMeta}
                    knownWorktrees={knownWorktrees}
                    worktree={row.worktree}
                    target={row.branchGuess}
                    runningSessionIds={runningTerminalSessionIds}
                  />
                ) : null
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent className="space-y-2 py-6">
                <p className="text-sm text-muted-foreground">
                  Worktree <code>{selectedWorktreeName || "(empty)"}</code> is not available in the active workspace.
                </p>
                {recentDirectories.length > 0 ? (
                  <p className="text-xs text-muted-foreground">Tip: switch to the correct workspace from Dashboard if this worktree exists elsewhere.</p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {statusMessage ? (
            <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
          ) : null}
          {errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
          ) : null}

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
    </PageShell>
  );
}
