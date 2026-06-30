"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BarracksHeader } from "@/src/components/pages/barracks/barracks-header";
import { BarracksModals } from "@/src/components/pages/barracks/barracks-modals";
import {
  LootingModal,
  type LootingSnapshot,
} from "@/src/components/pages/barracks/looting-modal";
import { SummaryViewerModal } from "@/src/components/pages/barracks/summary-viewer-modal";
import { WorktreesTable } from "@/src/components/pages/barracks/worktrees-table";
import { useBarracksState } from "@/src/components/pages/barracks/hooks/use-barracks-state";
import { useShortcutRegistration } from "@/src/components/shortcuts/use-shortcut-registration";
import type { ActionLauncherItem } from "@/src/components/shortcuts/action-launcher";
import type { WorktreeRow } from "@/src/components/pages/barracks/types";
import {
  DEFAULT_WORKTREE_STATE,
  grooveDiscoverWorktreeUnit,
  grooveSummary,
  workspaceClaimWorktreeReward,
  workspaceLootWorktree,
  workspaceSetWorktreeState,
} from "@/src/lib/ipc";
import type {
  SummaryRecord,
  WorktreeState,
  WorktreeUnit,
} from "@/src/lib/ipc";
import { applyOptimisticWorktreeState } from "@/src/lib/workspace-store";
import { toast } from "@/src/lib/toast";
import { playGrooveHookSound } from "@/src/lib/groove-sound-system";
import { useAppLayout } from "@/src/components/pages/use-app-layout";

// eslint-disable-next-line react-refresh/only-export-components
export function buildBarracksWorktreeDetailShortcutActionables(
  activeRows: WorktreeRow[],
  navigate: (path: string) => void,
  runPlayGrooveAction: (row: WorktreeRow) => Promise<void>,
): ActionLauncherItem[] {
  return activeRows.map((row) => ({
    id: `barracks.worktree-details.${row.worktree}`,
    type: "dropdown",
    label: row.worktree,
    description: row.branchGuess,
    items: [
      {
        id: `barracks.worktree-details.${row.worktree}.open`,
        type: "button",
        label: "Open details",
        description: "Open the worktree details view.",
        run: () => {
          navigate(`/worktrees/${encodeURIComponent(row.worktree)}`);
        },
      },
      {
        id: `barracks.worktree-details.${row.worktree}.play`,
        type: "button",
        label: "Play Groove",
        description: "Start Groove for this worktree.",
        run: () => {
          void runPlayGrooveAction(row);
        },
      },
    ],
  }));
}

export default function Home() {
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
    isForgetAllDeletedWorktreesPending,
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
    forceCutConfirmLoading,
    groupedWorktreeItems,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setIsCreateModalOpen,
    setCreateBranch,
    setCreateBase,
    pickDirectory,
    openRecentDirectory,
    refreshWorktrees,
    copyBranchName,
    runRestoreAction,
    runCreateWorktreeAction,
    runCutGrooveAction,
    runForgetAllDeletedWorktreesAction,
    runStopAction,
    runPlayGrooveAction,
    runOpenWorktreeTerminalAction,
    closeCurrentWorkspace,
  } = useBarracksState();

  const [summarizingSections, setSummarizingSections] = useState<Set<string>>(
    new Set(),
  );
  const [summarizingWorktreeIds, setSummarizingWorktreeIds] = useState<
    Set<string>
  >(new Set());
  const [discoveringWorktrees, setDiscoveringWorktrees] = useState<Set<string>>(
    new Set(),
  );
  const [newDiscoveryWorktrees, setNewDiscoveryWorktrees] = useState<
    Set<string>
  >(new Set());
  const [viewingSummaryState, setViewingSummaryState] = useState<{
    summaries: SummaryRecord[];
    initialIndex: number;
    worktreeIds: string[];
  } | null>(null);
  const ipcWorkspaceMeta = activeWorkspace?.workspaceMeta as
    | import("@/src/lib/ipc").WorkspaceMeta
    | undefined;

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

  const worktreeStates = useMemo(() => {
    const records = ipcWorkspaceMeta?.worktreeRecords;
    if (!records) return {};
    const result: Record<string, WorktreeState> = {};
    for (const [worktreeName, record] of Object.entries(records)) {
      result[worktreeName] = record.state ?? DEFAULT_WORKTREE_STATE;
    }
    return result;
  }, [ipcWorkspaceMeta?.worktreeRecords]);

  const worktreeUnits = useMemo(() => {
    const records = ipcWorkspaceMeta?.worktreeRecords;
    if (!records) return {};
    const result: Record<string, WorktreeUnit | undefined> = {};
    for (const [worktreeName, record] of Object.entries(records)) {
      result[worktreeName] = record.unit;
    }
    return result;
  }, [ipcWorkspaceMeta?.worktreeRecords]);

  const handleSetWorktreeState = useCallback(
    (worktree: string, state: WorktreeState) => {
      applyOptimisticWorktreeState(worktree, state);
      void workspaceSetWorktreeState({ worktree, state })
        .then((response) => {
          if (!response.ok) {
            toast.error(response.error ?? "Failed to update worktree state.");
            return;
          }
          void refreshWorktrees();
        })
        .catch(() => {
          toast.error("Failed to update worktree state.");
        });
    },
    [refreshWorktrees],
  );

  const handleDiscoverWorktree = useCallback(
    (worktree: string, sessionId: string) => {
      if (discoveringWorktrees.has(worktree)) return;
      setDiscoveringWorktrees((prev) => new Set(prev).add(worktree));
      void grooveDiscoverWorktreeUnit({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows
          .filter((r) => r.status !== "deleted")
          .map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        worktree,
        sessionId,
      })
        .then((response) => {
          if (!response.ok) {
            toast.error(response.error ?? "Discover failed.");
            return;
          }
          if (response.wasNewDiscovery) {
            setNewDiscoveryWorktrees((prev) => new Set(prev).add(worktree));
          }
          void refreshWorktrees();
        })
        .catch(() => {
          toast.error("Discover request failed.");
        })
        .finally(() => {
          setDiscoveringWorktrees((prev) => {
            const next = new Set(prev);
            next.delete(worktree);
            return next;
          });
        });
    },
    [
      discoveringWorktrees,
      ipcWorkspaceMeta,
      refreshWorktrees,
      worktreeRows,
    ],
  );

  const handleClaimWorktreeReward = useCallback(
    (worktree: string) => {
      void workspaceClaimWorktreeReward({ worktree })
        .then((response) => {
          if (!response.ok) {
            toast.error(response.error ?? "Failed to claim reward.");
            return;
          }
          // No modal: the sidebar gold counter rolls up to the new total and
          // surfaces a floating "+N" once the refreshed workspace lands.
          void refreshWorktrees();
        })
        .catch(() => {
          toast.error("Failed to claim reward.");
        });
    },
    [refreshWorktrees],
  );

  const [lootingSnapshot, setLootingSnapshot] =
    useState<LootingSnapshot | null>(null);

  const handleLootWorktree = useCallback(
    (worktree: string) => {
      void workspaceLootWorktree({ worktree })
        .then((response) => {
          if (!response.ok) {
            toast.error(response.error ?? "Failed to loot worktree.");
            return;
          }
          setLootingSnapshot({
            worktree,
            unitName: response.unit?.name ?? worktree,
            loot: response.loot ?? [],
          });
          void refreshWorktrees();
        })
        .catch(() => {
          toast.error("Failed to loot worktree.");
        });
    },
    [refreshWorktrees],
  );

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

  const handleSummarizeSection = useCallback(
    (sectionKey: string, sessionIds: string[]) => {
      if (!workspaceRoot || summarizingSections.has(sectionKey)) return;
      setSummarizingSections((prev) => new Set(prev).add(sectionKey));
      setSummarizingWorktreeIds((prev) => {
        const next = new Set(prev);
        for (const id of sessionIds) next.add(id);
        return next;
      });
      playGrooveHookSound("summaryStart");

      void grooveSummary({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows
          .filter((r) => r.status !== "deleted")
          .map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        sessionIds,
      })
        .then((response) => {
          playGrooveHookSound("summaryEnd");
          if (!response.ok) {
            toast.error(response.error ?? "Summary failed.");
            return;
          }

          const successful = response.summaries.filter((s) => s.ok);
          if (successful.length === 0) {
            toast.warning("No sessions had available summaries.");
          }
        })
        .catch(() => {
          toast.error("Summary request failed.");
        })
        .finally(() => {
          setSummarizingSections((prev) => {
            const next = new Set(prev);
            next.delete(sectionKey);
            return next;
          });
          setSummarizingWorktreeIds((prev) => {
            const next = new Set(prev);
            for (const id of sessionIds) next.delete(id);
            return next;
          });
        });
    },
    [ipcWorkspaceMeta, summarizingSections, worktreeRows, workspaceRoot],
  );

  const shortcutActionables = useMemo<ActionLauncherItem[]>(() => {
    return [
      {
        id: "barracks.refresh",
        type: "button",
        label: "Refresh worktrees",
        description: "Rescan workspace worktrees and runtime state.",
        run: () => {
          void refreshWorktrees();
        },
      },
    ];
  }, [refreshWorktrees]);

  const worktreeDetailShortcutActionables = useMemo<
    ActionLauncherItem[]
  >(() => {
    const activeRows = worktreeRows.filter((row) => row.status !== "deleted");
    return buildBarracksWorktreeDetailShortcutActionables(
      activeRows,
      navigate,
      runPlayGrooveAction,
    );
  }, [navigate, runPlayGrooveAction, worktreeRows]);

  useShortcutRegistration({
    actionables: shortcutActionables,
    worktreeDetailActionables: worktreeDetailShortcutActionables,
  });

  useAppLayout({
    noDirectoryOpenState: {
      isVisible: !activeWorkspace,
      isBusy: isWorkspaceHydrating || isBusy,
      statusMessage,
      errorMessage,
      onSelectDirectory: pickDirectory,
      onOpenRecentDirectory: openRecentDirectory,
    },
  });

  return (
    <>
      {!activeWorkspace ? null : (
        <div aria-live="polite" className="space-y-3">
          <BarracksHeader
            isBusy={isBusy}
            isCreatePending={isCreatePending}
            onCreate={() => {
              setCreateBranch("");
              setCreateBase("");
              setIsCreateModalOpen(true);
            }}
            onRefresh={() => {
              void refreshWorktrees();
            }}
          />

          {ipcWorkspaceMeta &&
            (!ipcWorkspaceMeta.onboardingSymlinksConfigured ||
              !ipcWorkspaceMeta.onboardingCommandsConfigured) && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                onClick={() => {
                  navigate("/diagnostics");
                }}
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="size-4 shrink-0"
                />
                <span>
                  Some workspace checks need attention. Review diagnostics
                  before creating worktrees.
                </span>
              </button>
            )}

          <div className="space-y-3">
            {isWorkspaceHydrating ? (
              <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Looking for worktrees…
              </p>
            ) : !hasWorktreesDirectory ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
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
              </p>
            ) : worktreeRows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <code>.worktrees</code> exists, but no worktree directories were
                found.
              </p>
            ) : (
              <WorktreesTable
                groupedWorktreeItems={groupedWorktreeItems}
                copiedBranchPath={copiedBranchPath}
                pendingRestoreActions={pendingRestoreActions}
                pendingCutGrooveActions={pendingCutGrooveActions}
                pendingStopActions={pendingStopActions}
                pendingPlayActions={pendingPlayActions}
                activeTerminalWorktrees={activeTerminalWorktrees}
                onCopyBranchName={(row) => {
                  void copyBranchName(row);
                }}
                onRestoreAction={(row) => {
                  void runRestoreAction(row);
                }}
                onCutConfirm={(row) => {
                  setCutConfirmRow(row);
                }}
                onStopAction={(row) => {
                  void runStopAction(row);
                }}
                onPlayAction={(row) => {
                  void runPlayGrooveAction(row);
                }}
                onOpenTerminalAction={(worktree) => {
                  void runOpenWorktreeTerminalAction(worktree);
                }}
                workspaceSummaries={ipcWorkspaceMeta?.summaries ?? []}
                worktreeSummaries={worktreeSummaries}
                onSummarizeWorktree={handleSummarizeWorktree}
                summarizingWorktreeIds={summarizingWorktreeIds}
                onViewSectionSummary={(summary) => {
                  const allSectionSummaries = ipcWorkspaceMeta?.summaries ?? [];
                  const idx = allSectionSummaries.findIndex(
                    (s) => s.createdAt === summary.createdAt,
                  );
                  setViewingSummaryState({
                    summaries: allSectionSummaries,
                    initialIndex: idx >= 0 ? idx : 0,
                    worktreeIds: summary.worktreeIds,
                  });
                }}
                onViewWorktreeSummary={(summary) => {
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
                onForgetAllDeletedWorktrees={() => {
                  const shouldForgetAll = window.confirm(
                    "Forget all deleted worktrees forever from Groove local state?",
                  );
                  if (!shouldForgetAll) {
                    return;
                  }
                  void runForgetAllDeletedWorktreesAction();
                }}
                isForgetAllDeletedWorktreesPending={
                  isForgetAllDeletedWorktreesPending
                }
                worktreeStates={worktreeStates}
                worktreeUnits={worktreeUnits}
                onSetWorktreeState={handleSetWorktreeState}
                discoveringWorktrees={discoveringWorktrees}
                newDiscoveryWorktrees={newDiscoveryWorktrees}
                onDiscoverWorktree={handleDiscoverWorktree}
                onClaimWorktreeReward={handleClaimWorktreeReward}
                onLootWorktree={handleLootWorktree}
              />
            )}

            {statusMessage && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                {statusMessage}
              </p>
            )}
            {errorMessage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      )}

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
        onRunCutGrooveAction={(row, force) => {
          void runCutGrooveAction(row, force);
        }}
        onCloseCurrentWorkspace={() => {
          void closeCurrentWorkspace();
        }}
        onRunCreateWorktreeAction={(options) => {
          void runCreateWorktreeAction(options);
        }}
        onboardingIncomplete={
          ipcWorkspaceMeta != null &&
          (!ipcWorkspaceMeta.onboardingSymlinksConfigured ||
            !ipcWorkspaceMeta.onboardingCommandsConfigured)
        }
        onNavigateToDiagnostics={() => {
          navigate("/diagnostics");
        }}
      />

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
            : viewingSummaryState?.worktreeIds.length &&
                viewingSummaryState.worktreeIds.length > 1
              ? () => {
                  handleSummarizeSection(
                    "modal",
                    viewingSummaryState.worktreeIds,
                  );
                }
              : undefined
        }
        isCreatePending={
          summarizingWorktreeIds.size > 0 || summarizingSections.size > 0
        }
      />
      <LootingModal
        snapshot={lootingSnapshot}
        onClose={() => {
          setLootingSnapshot(null);
        }}
      />
    </>
  );
}
