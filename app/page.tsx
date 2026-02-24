"use client";

import { FolderOpen, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { DashboardHeader } from "@/components/pages/dashboard/dashboard-header";
import { DashboardModals } from "@/components/pages/dashboard/dashboard-modals";
import { TestingEnvironmentPanel } from "@/components/pages/dashboard/testing-environment-panel";
import { WorktreesTable } from "@/components/pages/dashboard/worktrees-table";
import { useDashboardState } from "@/components/pages/dashboard/hooks/use-dashboard-state";
import { PageShell } from "@/components/pages/page-shell";

export default function Home() {
  const {
    activeWorkspace,
    worktreeRows,
    hasWorktreesDirectory,
    statusMessage,
    errorMessage,
    isBusy,
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
    testingEnvironments,
    unsetTestingEnvironmentConfirm,
    testingEnvironmentColorByWorktree,
    testingTargetWorktrees,
    testingRunningWorktrees,
    isTestingInstancePending,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceMeta,
    workspaceRoot,
    recentDirectories,
    gitignoreSanity,
    gitignoreSanityStatusMessage,
    gitignoreSanityErrorMessage,
    isGitignoreSanityChecking,
    isGitignoreSanityApplyPending,
    forceCutConfirmLoading,
    groupedWorktreeItems,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setIsCreateModalOpen,
    setCreateBranch,
    setCreateBase,
    setUnsetTestingEnvironmentConfirm,
    pickDirectory,
    openRecentDirectory,
    applyGitignoreSanityPatch,
    refreshWorktrees,
    copyBranchName,
    runRestoreAction,
    runCreateWorktreeAction,
    runCutGrooveAction,
    runStopAction,
    runPlayGrooveAction,
    onSelectTestingTarget,
    runStartTestingInstanceAction,
    runOpenTestingTerminalAction,
    runStopTestingInstanceAction,
    runUnsetTestingTargetAction,
    closeCurrentWorkspace,
  } = useDashboardState();

  const workspaceDisplayName = workspaceMeta?.rootName ?? "No directory selected";
  const hasDirectory = Boolean(activeWorkspace);

  return (
    <PageShell
      noDirectoryOpenState={{
        isVisible: !activeWorkspace,
        isBusy,
        statusMessage,
        errorMessage,
        onSelectDirectory: pickDirectory,
        onOpenRecentDirectory: openRecentDirectory,
      }}
      pageSidebar={({ collapsed }) => (
        <Sidebar collapsed={collapsed}>
          <SidebarHeader>
            {collapsed ? (
              <h2 className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dir</h2>
            ) : (
              <h2 className="text-sm font-semibold">Directory</h2>
            )}
          </SidebarHeader>
          <SidebarContent className="space-y-3">
            {!collapsed && (
              <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Current directory</p>
                <p className="truncate text-sm font-medium" title={workspaceDisplayName}>
                  {workspaceDisplayName}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={workspaceRoot ?? undefined}>
                  {workspaceRoot ?? "No path selected"}
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void pickDirectory();
              }}
              disabled={isBusy}
              className={collapsed ? "w-full px-0" : "w-full"}
              aria-label="Change directory"
            >
              <FolderOpen aria-hidden="true" className="size-4" />
              {!collapsed && <span>Change directory</span>}
            </Button>
            {!collapsed && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || recentDirectories.length === 0}
                    className="w-full justify-between"
                    aria-label="Recent directories"
                  >
                    <span>Recent directories</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
                  {recentDirectories.map((directoryPath) => (
                    <DropdownMenuItem
                      key={directoryPath}
                      title={directoryPath}
                      onSelect={(event) => {
                        event.preventDefault();
                        void openRecentDirectory(directoryPath);
                      }}
                      className="truncate"
                    >
                      {directoryPath}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCloseWorkspaceConfirmOpen(true);
              }}
              disabled={isBusy || !hasDirectory}
              className={collapsed ? "w-full px-0" : "w-full"}
              aria-label="Close directory"
            >
              <X aria-hidden="true" className="size-4" />
              {!collapsed && <span>Close directory</span>}
            </Button>
          </SidebarContent>
        </Sidebar>
      )}
    >
      {!activeWorkspace ? null : (
        <div aria-live="polite" className="space-y-3">
          <DashboardHeader
            gitignoreSanity={gitignoreSanity}
            isGitignoreSanityChecking={isGitignoreSanityChecking}
            isGitignoreSanityApplyPending={isGitignoreSanityApplyPending}
            gitignoreSanityStatusMessage={gitignoreSanityStatusMessage}
            gitignoreSanityErrorMessage={gitignoreSanityErrorMessage}
            isBusy={isBusy}
            isCreatePending={isCreatePending}
            onCreate={() => {
              setCreateBranch("");
              setCreateBase("");
              setIsCreateModalOpen(true);
            }}
            onApplyGitignoreSanityPatch={() => {
              void applyGitignoreSanityPatch();
            }}
            onRefresh={() => {
              void refreshWorktrees();
            }}
            onPickDirectory={() => {
              void pickDirectory();
            }}
            onCloseWorkspace={() => {
              setIsCloseWorkspaceConfirmOpen(true);
            }}
          />

          <Card>
            <CardContent className="space-y-3">
              <TestingEnvironmentPanel
                environments={testingEnvironments}
                testingEnvironmentColorByWorktree={testingEnvironmentColorByWorktree}
                isTestingInstancePending={isTestingInstancePending}
                onStop={(worktree) => {
                  void runStopTestingInstanceAction(worktree);
                }}
                onRunLocal={(worktree) => {
                  void runStartTestingInstanceAction(worktree);
                }}
                onOpenTerminal={(worktree) => {
                  void runOpenTestingTerminalAction(worktree);
                }}
                onRequestUnset={(environment) => {
                  if (environment.status === "running") {
                    setUnsetTestingEnvironmentConfirm(environment);
                    return;
                  }

                  void runUnsetTestingTargetAction(environment, true);
                }}
              />

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
                  testingEnvironmentColorByWorktree={testingEnvironmentColorByWorktree}
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
                  onStopAction={(row, runtimeRow) => {
                    void runStopAction(row, runtimeRow);
                  }}
                  onPlayAction={(row) => {
                    void runPlayGrooveAction(row);
                  }}
                  onSelectTestingTarget={onSelectTestingTarget}
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
        unsetTestingEnvironmentConfirm={unsetTestingEnvironmentConfirm}
        isTestingInstancePending={isTestingInstancePending}
        setCreateBranch={setCreateBranch}
        setCreateBase={setCreateBase}
        setUnsetTestingEnvironmentConfirm={setUnsetTestingEnvironmentConfirm}
        onRunCutGrooveAction={(row, force) => {
          void runCutGrooveAction(row, force);
        }}
        onCloseCurrentWorkspace={() => {
          void closeCurrentWorkspace();
        }}
        onRunCreateWorktreeAction={(options) => {
          void runCreateWorktreeAction(options);
        }}
        onRunUnsetTestingTargetAction={(environment, stopRunningProcessesWhenUnset) => {
          void runUnsetTestingTargetAction(environment, stopRunningProcessesWhenUnset);
        }}
      />
    </PageShell>
  );
}
