"use client";

import { FolderClock, FolderOpen, Terminal, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DirectoryBehindIndicator } from "@/components/pages/dashboard/directory-behind-indicator";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { DashboardHeader } from "@/components/pages/dashboard/dashboard-header";
import { DashboardModals } from "@/components/pages/dashboard/dashboard-modals";
import { SummaryViewerModal } from "@/components/pages/dashboard/summary-viewer-modal";
import { useDirectoryBehindStatus } from "@/components/pages/dashboard/hooks/use-directory-behind-status";
import { WorktreesTable } from "@/components/pages/dashboard/worktrees-table";
import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import { useShortcutRegistration } from "@/components/shortcuts/use-shortcut-registration";
import type { ActionLauncherItem } from "@/components/shortcuts/action-launcher";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import { grooveSummary } from "@/src/lib/ipc";
import type { SummaryRecord } from "@/src/lib/ipc";
import { toast } from "@/lib/toast";
import { useAppLayout } from "@/components/pages/use-app-layout";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function buildDashboardWorktreeDetailShortcutActionables(
  activeRows: WorktreeRow[],
  navigate: (path: string) => void,
  runPlayGrooveAction: (row: WorktreeRow) => Promise<void>,
): ActionLauncherItem[] {
  return activeRows.map((row) => ({
    id: `dashboard.worktree-details.${row.worktree}`,
    type: "dropdown",
    label: row.worktree,
    description: row.branchGuess,
    items: [
      {
        id: `dashboard.worktree-details.${row.worktree}.open`,
        type: "button",
        label: "Open details",
        description: "Open the worktree details view.",
        run: () => {
          navigate(`/worktrees/${encodeURIComponent(row.worktree)}`);
        },
      },
      {
        id: `dashboard.worktree-details.${row.worktree}.play`,
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
  const [pauseConfirmRow, setPauseConfirmRow] = useState<WorktreeRow | null>(null);
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
    pendingTestActions,
    copiedBranchPath,
    isCloseWorkspaceConfirmOpen,
    cutConfirmRow,
    forceCutConfirmRow,
    runtimeStateByWorktree,
    testingTargetWorktrees,
    testingRunningWorktrees,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceRoot,
    recentDirectories,
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
    onSelectTestingTarget,
    runOpenWorkspaceTerminalAction,
    closeCurrentWorkspace,
  } = useDashboardState();

  const [summarizingSection, setSummarizingSection] = useState<string | null>(null);
  const [summarizingWorktreeId, setSummarizingWorktreeId] = useState<string | null>(null);
  const [viewingSummaryState, setViewingSummaryState] = useState<{ summaries: SummaryRecord[]; initialIndex: number; worktreeIds: string[] } | null>(null);

  const ipcWorkspaceMeta = activeWorkspace?.workspaceMeta as import("@/src/lib/ipc").WorkspaceMeta | undefined;

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
      if (!workspaceRoot || summarizingWorktreeId) return;
      setSummarizingWorktreeId(sessionId);

      void grooveSummary({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows.filter((r) => r.status !== "deleted").map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        sessionIds: [sessionId],
      })
        .then((response) => {
          if (!response.ok) {
            toast.error(response.error ?? "Summary failed.");
            return;
          }
          const successEntry = response.summaries.find((s) => s.ok);
          if (!successEntry?.summary) {
            const errorDetail = response.summaries.find((s) => !s.ok)?.error;
            toast.warning(errorDetail ? `Summary unavailable: ${errorDetail}` : "Session summary unavailable.");
          }
        })
        .catch(() => {
          toast.error("Summary request failed.");
        })
        .finally(() => {
          setSummarizingWorktreeId(null);
        });
    },
    [ipcWorkspaceMeta, summarizingWorktreeId, worktreeRows, workspaceRoot],
  );

  const handleSummarizeSection = useCallback(
    (sectionKey: string, sessionIds: string[]) => {
      if (!workspaceRoot || summarizingSection) return;
      setSummarizingSection(sectionKey);

      void grooveSummary({
        rootName: ipcWorkspaceMeta?.rootName ?? "",
        knownWorktrees: worktreeRows.filter((r) => r.status !== "deleted").map((r) => r.worktree),
        workspaceMeta: ipcWorkspaceMeta,
        sessionIds,
      })
        .then((response) => {
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
          setSummarizingSection(null);
        });
    },
    [ipcWorkspaceMeta, summarizingSection, worktreeRows, workspaceRoot],
  );

  const hasDirectory = Boolean(activeWorkspace);
  const directoryBehindStatus = useDirectoryBehindStatus(activeWorkspace?.workspaceRoot ?? null);
  const workspaceDisplayName = activeWorkspace?.workspaceMeta.rootName ?? "No directory selected";
  const pauseConfirmActionKey = pauseConfirmRow ? `${pauseConfirmRow.path}:stop` : null;
  const pauseConfirmLoading = pauseConfirmActionKey !== null && pendingStopActions.includes(pauseConfirmActionKey);
  const shortcutActionables = useMemo<ActionLauncherItem[]>(() => {
    const activeRows = worktreeRows.filter((row) => row.status !== "deleted");
    const worktreeByName = activeRows.reduce<Record<string, WorktreeRow>>((map, row) => {
      map[row.worktree] = row;
      return map;
    }, {});

    return [
      {
        id: "dashboard.refresh",
        type: "button",
        label: "Refresh worktrees",
        description: "Rescan workspace worktrees and runtime state.",
        run: () => {
          void refreshWorktrees();
        },
      },
      {
        id: "dashboard.testing-targets",
        type: "checkbox-multiple-input",
        label: "Testing targets",
        description: "Toggle which worktrees are selected as testing targets.",
        options: activeRows.map((row) => ({
          id: row.worktree,
          label: row.worktree,
          description: row.branchGuess,
          checked: testingTargetWorktrees.includes(row.worktree),
        })),
        onToggle: (worktree) => {
          const row = worktreeByName[worktree];
          if (!row) {
            return;
          }
          onSelectTestingTarget(row);
        },
      },
    ];
  }, [onSelectTestingTarget, refreshWorktrees, testingTargetWorktrees, worktreeRows]);

  const worktreeDetailShortcutActionables = useMemo<ActionLauncherItem[]>(() => {
    const activeRows = worktreeRows.filter((row) => row.status !== "deleted");
    return buildDashboardWorktreeDetailShortcutActionables(activeRows, navigate, runPlayGrooveAction);
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
    pageSidebar: ({ collapsed }: { collapsed: boolean }) => (
      <Sidebar collapsed={collapsed}>
        <SidebarHeader>
          {collapsed ? (
            <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dir</h2>
          ) : (
            <h2 className="text-sm font-semibold">Directory</h2>
          )}
        </SidebarHeader>
        <SidebarContent className="space-y-3">
          <TooltipProvider>
            <div className={collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1"}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void pickDirectory();
                    }}
                    disabled={isBusy}
                    className={collapsed ? "h-8 w-8 px-0" : "h-8 min-w-0 flex-1 justify-start"}
                    aria-label="Change directory"
                  >
                    <FolderOpen aria-hidden="true" className="size-4" />
                    {!collapsed && <span className="truncate">{workspaceDisplayName}</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Change directory</TooltipContent>
              </Tooltip>
              <DirectoryBehindIndicator collapsed={collapsed} status={directoryBehindStatus} />
              <Dropdown
                ariaLabel="Recent directories"
                options={recentDirectories.map((directoryPath) => ({
                  value: directoryPath,
                  label: directoryPath,
                }))}
                value={null}
                placeholder=""
                onValueChange={(directoryPath) => {
                  void openRecentDirectory(directoryPath);
                }}
                disabled={isBusy || recentDirectories.length === 0}
                triggerClassName="h-8 w-8 px-0"
                contentClassName="w-80 max-w-[calc(100vw-2rem)]"
                triggerIcon={<FolderClock aria-hidden="true" className="size-4" />}
                triggerTooltip="Recent directories"
                hideChevron
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCloseWorkspaceConfirmOpen(true);
                    }}
                    disabled={isBusy || !hasDirectory}
                    className="h-8 w-8 px-0"
                    aria-label="Close directory"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close directory</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void runOpenWorkspaceTerminalAction();
                    }}
                    disabled={isBusy || !hasDirectory}
                    className="h-8 w-8 px-0"
                    aria-label="Open terminal at active directory"
                  >
                    <Terminal aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open terminal</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </SidebarContent>
      </Sidebar>
    ),
  });

  return (
    <>
      {!activeWorkspace ? null : (
        <div aria-live="polite" className="space-y-3">
          <DashboardHeader
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

          <div className="space-y-3">
            {!hasWorktreesDirectory ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No <code>.worktrees</code> directory found under this workspace root yet.
              </p>
            ) : worktreeRows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <code>.worktrees</code> exists, but no worktree directories were found.
              </p>
            ) : (
              <WorktreesTable
                groupedWorktreeItems={groupedWorktreeItems}
                copiedBranchPath={copiedBranchPath}
                pendingRestoreActions={pendingRestoreActions}
                pendingCutGrooveActions={pendingCutGrooveActions}
                pendingStopActions={pendingStopActions}
                pendingPlayActions={pendingPlayActions}
                pendingTestActions={pendingTestActions}
                runtimeStateByWorktree={runtimeStateByWorktree}
                testingTargetWorktrees={testingTargetWorktrees}
                testingRunningWorktrees={testingRunningWorktrees}
                hasConnectedRepository={Boolean(activeWorkspace?.workspaceRoot)}
                repositoryRemoteUrl={activeWorkspace?.repositoryRemoteUrl}
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
                  setPauseConfirmRow(row);
                }}
                onPlayAction={(row) => {
                  void runPlayGrooveAction(row);
                }}
                onOpenTerminalAction={(worktree) => {
                  void runOpenWorktreeTerminalAction(worktree);
                }}
                onSetTestingTargetAction={(row) => {
                  onSelectTestingTarget(row);
                }}
                workspaceSummaries={ipcWorkspaceMeta?.summaries ?? []}
                worktreeSummaries={worktreeSummaries}
                onSummarizeSection={handleSummarizeSection}
                onSummarizeWorktree={handleSummarizeWorktree}
                summarizingWorktreeId={summarizingWorktreeId}
                onViewSectionSummary={(summary) => {
                  const allSectionSummaries = ipcWorkspaceMeta?.summaries ?? [];
                  const idx = allSectionSummaries.findIndex((s) => s.createdAt === summary.createdAt);
                  setViewingSummaryState({ summaries: allSectionSummaries, initialIndex: idx >= 0 ? idx : 0, worktreeIds: summary.worktreeIds });
                }}
                onViewWorktreeSummary={(summary) => {
                  const worktreeId = summary.worktreeIds[0];
                  const allWorktreeSummaries = worktreeId ? (worktreeSummaries[worktreeId] ?? [summary]) : [summary];
                  const idx = allWorktreeSummaries.findIndex((s) => s.createdAt === summary.createdAt);
                  setViewingSummaryState({ summaries: allWorktreeSummaries, initialIndex: idx >= 0 ? idx : allWorktreeSummaries.length - 1, worktreeIds: summary.worktreeIds });
                }}
                summarizingSectionKey={summarizingSection}
                onForgetAllDeletedWorktrees={() => {
                  const shouldForgetAll = window.confirm("Forget all deleted worktrees forever from Groove local state?");
                  if (!shouldForgetAll) {
                    return;
                  }
                  void runForgetAllDeletedWorktreesAction();
                }}
                isForgetAllDeletedWorktreesPending={isForgetAllDeletedWorktreesPending}
              />
            )}

            {statusMessage && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
            )}
            {errorMessage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
            )}
          </div>
        </div>
      )}

      <DashboardModals
        workspaceRoot={workspaceRoot}
        cutConfirmRow={cutConfirmRow}
        setCutConfirmRow={setCutConfirmRow}
        pauseConfirmRow={pauseConfirmRow}
        setPauseConfirmRow={setPauseConfirmRow}
        pauseConfirmLoading={pauseConfirmLoading}
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
        onRunPauseGrooveAction={(row) => {
          return runStopAction(row, runtimeStateByWorktree[row.worktree]);
        }}
        onCloseCurrentWorkspace={() => {
          void closeCurrentWorkspace();
        }}
        onRunCreateWorktreeAction={(options) => {
          void runCreateWorktreeAction(options);
        }}
      />

      <SummaryViewerModal
        summaries={viewingSummaryState?.summaries ?? []}
        initialIndex={viewingSummaryState?.initialIndex ?? 0}
        open={viewingSummaryState !== null}
        onClose={() => { setViewingSummaryState(null); }}
        onCreateNewSummary={viewingSummaryState?.worktreeIds.length === 1
          ? () => { handleSummarizeWorktree(viewingSummaryState.worktreeIds[0]); }
          : viewingSummaryState?.worktreeIds.length && viewingSummaryState.worktreeIds.length > 1
            ? () => { handleSummarizeSection("modal", viewingSummaryState.worktreeIds); }
            : undefined
        }
        isCreatePending={summarizingWorktreeId !== null || summarizingSection !== null}
      />
    </>
  );
}
