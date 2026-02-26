"use client";

import { FolderClock, FolderOpen, Terminal, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardHeader } from "@/components/pages/dashboard/dashboard-header";
import { DashboardModals } from "@/components/pages/dashboard/dashboard-modals";
import { WorktreesTable } from "@/components/pages/dashboard/worktrees-table";
import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import { useAppLayout } from "@/components/pages/use-app-layout";

export default function Home() {
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
    runStopAction,
    runPlayGrooveAction,
    onSelectTestingTarget,
    runOpenWorkspaceTerminalAction,
    closeCurrentWorkspace,
  } = useDashboardState();

  const hasDirectory = Boolean(activeWorkspace);
  const workspaceDisplayName = activeWorkspace?.workspaceMeta.rootName ?? "No directory selected";
  const pauseConfirmActionKey = pauseConfirmRow ? `${pauseConfirmRow.path}:stop` : null;
  const pauseConfirmLoading = pauseConfirmActionKey !== null && pendingStopActions.includes(pauseConfirmActionKey);

  useAppLayout({
    noDirectoryOpenState: {
      isVisible: !isWorkspaceHydrating && !activeWorkspace,
      isBusy,
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

          <Card>
            <CardContent className="space-y-3">
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
                  onSetTestingTargetAction={(row) => {
                    onSelectTestingTarget(row);
                  }}
                />
              )}

              {statusMessage && (
                <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
              )}
              {errorMessage && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
              )}
            </CardContent>
          </Card>
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
    </>
  );
}
