"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    switchTestingTargetConfirmRow,
    runtimeStateByWorktree,
    testingEnvironment,
    isTestingInstancePending,
    isCreateModalOpen,
    createBranch,
    createBase,
    isCreatePending,
    workspaceMeta,
    workspaceRoot,
    forceCutConfirmLoading,
    testingTargetWorktree,
    testingInstanceIsRunning,
    switchTestingTargetConfirmLoading,
    testingTargetRow,
    groupedWorktreeItems,
    setIsCloseWorkspaceConfirmOpen,
    setCutConfirmRow,
    setForceCutConfirmRow,
    setSwitchTestingTargetConfirmRow,
    setIsCreateModalOpen,
    setCreateBranch,
    setCreateBase,
    pickDirectory,
    refreshWorktrees,
    copyBranchName,
    runRestoreAction,
    runCreateWorktreeAction,
    runCutGrooveAction,
    runStopAction,
    runPlayGrooveAction,
    runSetTestingTargetAction,
    onSelectTestingTarget,
    runStartTestingInstanceAction,
    runStartTestingInstanceInSeparateTerminalAction,
    runStopTestingInstanceAction,
    closeCurrentWorkspace,
  } = useDashboardState();

  return (
    <PageShell>
      {!activeWorkspace ? (
        <Card className="mx-auto w-full max-w-xl" aria-live="polite">
          <CardHeader>
            <CardTitle>No directory selected</CardTitle>
            <CardDescription>Select a local folder to create or load its Groove workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              onClick={() => {
                void pickDirectory();
              }}
              disabled={isBusy}
            >
              {isBusy ? "Opening picker..." : "Select directory"}
            </Button>
            {statusMessage && (
              <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p>
            )}
            {errorMessage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div aria-live="polite" className="space-y-3">
          <DashboardHeader
            workspaceRootName={workspaceMeta?.rootName}
            workspaceRoot={workspaceRoot}
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
            onPickDirectory={() => {
              void pickDirectory();
            }}
            onCloseWorkspace={() => {
              setIsCloseWorkspaceConfirmOpen(true);
            }}
          />

          <Card>
            <CardContent className="space-y-3 pt-6">
              <TestingEnvironmentPanel
                testingTargetWorktree={testingTargetWorktree}
                testingStatus={testingEnvironment?.status}
                testingInstanceId={testingEnvironment?.instanceId}
                hasTestingTargetRow={Boolean(testingTargetRow)}
                isTestingInstancePending={isTestingInstancePending}
                onStop={() => {
                  void runStopTestingInstanceAction();
                }}
                onRunLocal={() => {
                  void runStartTestingInstanceAction();
                }}
                onRunSeparate={() => {
                  void runStartTestingInstanceInSeparateTerminalAction();
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
                  testingTargetWorktree={testingTargetWorktree}
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
        cutConfirmRow={cutConfirmRow}
        setCutConfirmRow={setCutConfirmRow}
        forceCutConfirmRow={forceCutConfirmRow}
        setForceCutConfirmRow={setForceCutConfirmRow}
        forceCutConfirmLoading={forceCutConfirmLoading}
        switchTestingTargetConfirmRow={switchTestingTargetConfirmRow}
        setSwitchTestingTargetConfirmRow={setSwitchTestingTargetConfirmRow}
        switchTestingTargetConfirmLoading={switchTestingTargetConfirmLoading}
        testingInstanceIsRunning={testingInstanceIsRunning}
        testingTargetWorktree={testingTargetWorktree}
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
        onRunSetTestingTargetAction={(row, autoStartIfCurrentRunning) => {
          void runSetTestingTargetAction(row, autoStartIfCurrentRunning);
        }}
        onCloseCurrentWorkspace={() => {
          void closeCurrentWorkspace();
        }}
        onRunCreateWorktreeAction={() => {
          void runCreateWorktreeAction();
        }}
      />
    </PageShell>
  );
}
