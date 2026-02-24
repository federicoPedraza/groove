import { CreateWorktreeModal } from "@/components/create-worktree-modal";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { TestingEnvironmentEntry } from "@/src/lib/ipc";

type DashboardModalsProps = {
  workspaceRoot: string | null;
  cutConfirmRow: WorktreeRow | null;
  setCutConfirmRow: (row: WorktreeRow | null) => void;
  forceCutConfirmRow: WorktreeRow | null;
  setForceCutConfirmRow: (row: WorktreeRow | null) => void;
  forceCutConfirmLoading: boolean;
  isCloseWorkspaceConfirmOpen: boolean;
  setIsCloseWorkspaceConfirmOpen: (open: boolean) => void;
  isBusy: boolean;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  createBranch: string;
  createBase: string;
  isCreatePending: boolean;
  unsetTestingEnvironmentConfirm: TestingEnvironmentEntry | null;
  isTestingInstancePending: boolean;
  setCreateBranch: (value: string) => void;
  setCreateBase: (value: string) => void;
  setUnsetTestingEnvironmentConfirm: (environment: TestingEnvironmentEntry | null) => void;
  onRunCutGrooveAction: (row: WorktreeRow, force?: boolean) => void;
  onCloseCurrentWorkspace: () => void;
  onRunCreateWorktreeAction: (options?: { branchOverride?: string; baseOverride?: string }) => void;
  onRunUnsetTestingTargetAction: (environment: TestingEnvironmentEntry, stopRunningProcessesWhenUnset: boolean) => void;
};

export function DashboardModals({
  workspaceRoot,
  cutConfirmRow,
  setCutConfirmRow,
  forceCutConfirmRow,
  setForceCutConfirmRow,
  forceCutConfirmLoading,
  isCloseWorkspaceConfirmOpen,
  setIsCloseWorkspaceConfirmOpen,
  isBusy,
  isCreateModalOpen,
  setIsCreateModalOpen,
  createBranch,
  createBase,
  isCreatePending,
  unsetTestingEnvironmentConfirm,
  isTestingInstancePending,
  setCreateBranch,
  setCreateBase,
  setUnsetTestingEnvironmentConfirm,
  onRunCutGrooveAction,
  onCloseCurrentWorkspace,
  onRunCreateWorktreeAction,
  onRunUnsetTestingTargetAction,
}: DashboardModalsProps) {
  const unsetTargetIsRunning = unsetTestingEnvironmentConfirm?.status === "running";
  const isForgetDeletedWorktree = cutConfirmRow?.status === "deleted";

  return (
    <>
      <ConfirmModal
        open={cutConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCutConfirmRow(null);
          }
        }}
        title={isForgetDeletedWorktree ? "Forget this deleted worktree forever?" : "Cut this groove?"}
        description={
          cutConfirmRow
            ? isForgetDeletedWorktree
              ? `This permanently removes deleted worktree "${cutConfirmRow.worktree}" from Groove's local state.`
              : `This removes worktree "${cutConfirmRow.worktree}" (branch "${cutConfirmRow.branchGuess}").`
            : "This removes the selected worktree."
        }
        confirmLabel={isForgetDeletedWorktree ? "Forget forever" : "Cut groove"}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (!cutConfirmRow) {
            return;
          }
          const selectedRow = cutConfirmRow;
          setCutConfirmRow(null);
          onRunCutGrooveAction(selectedRow);
        }}
        onCancel={() => {
          setCutConfirmRow(null);
        }}
      />

      <ConfirmModal
        open={forceCutConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setForceCutConfirmRow(null);
          }
        }}
        title="Force cut this groove?"
        description={
          forceCutConfirmRow
            ? `Worktree "${forceCutConfirmRow.worktree}" contains modified or untracked files. Force deletion is irreversible and there is no turn back.`
            : "This worktree contains modified or untracked files. Force deletion is irreversible and there is no turn back."
        }
        confirmLabel="Force delete worktree"
        cancelLabel="Keep worktree"
        destructive
        loading={forceCutConfirmLoading}
        onConfirm={() => {
          if (!forceCutConfirmRow) {
            return;
          }
          const selectedRow = forceCutConfirmRow;
          setForceCutConfirmRow(null);
          onRunCutGrooveAction(selectedRow, true);
        }}
        onCancel={() => {
          setForceCutConfirmRow(null);
        }}
      />

      <ConfirmModal
        open={unsetTestingEnvironmentConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnsetTestingEnvironmentConfirm(null);
          }
        }}
        title="Unset this testing environment?"
        description={
          unsetTestingEnvironmentConfirm
            ? unsetTargetIsRunning
              ? `Testing target "${unsetTestingEnvironmentConfirm.worktree}" is running. Should running processes be stopped while unsetting?`
              : `Testing target "${unsetTestingEnvironmentConfirm.worktree}" is not running. You can safely unset it now.`
            : "Unset the selected testing target."
        }
        confirmLabel={unsetTargetIsRunning ? "Unset and stop" : "Unset target"}
        secondaryActionLabel={unsetTargetIsRunning ? "Unset and keep running" : undefined}
        cancelLabel="Cancel"
        loading={isTestingInstancePending}
        onConfirm={() => {
          if (!unsetTestingEnvironmentConfirm) {
            return;
          }
          const selectedEnvironment = unsetTestingEnvironmentConfirm;
          setUnsetTestingEnvironmentConfirm(null);
          onRunUnsetTestingTargetAction(selectedEnvironment, true);
        }}
        onSecondaryAction={() => {
          if (!unsetTestingEnvironmentConfirm) {
            return;
          }
          const selectedEnvironment = unsetTestingEnvironmentConfirm;
          setUnsetTestingEnvironmentConfirm(null);
          onRunUnsetTestingTargetAction(selectedEnvironment, false);
        }}
        onCancel={() => {
          setUnsetTestingEnvironmentConfirm(null);
        }}
      />

      <ConfirmModal
        open={isCloseWorkspaceConfirmOpen}
        onOpenChange={setIsCloseWorkspaceConfirmOpen}
        title="Close current workspace?"
        description="This clears the active workspace in desktop storage until you select a directory again."
        confirmLabel="Close workspace"
        cancelLabel="Keep workspace open"
        loading={isBusy}
        onConfirm={() => {
          setIsCloseWorkspaceConfirmOpen(false);
          onCloseCurrentWorkspace();
        }}
        onCancel={() => {
          setIsCloseWorkspaceConfirmOpen(false);
        }}
      />

      <CreateWorktreeModal
        open={isCreateModalOpen}
        workspaceRoot={workspaceRoot}
        branch={createBranch}
        base={createBase}
        loading={isCreatePending}
        onOpenChange={(open) => {
          setIsCreateModalOpen(open);
          if (!open && !isCreatePending) {
            setCreateBranch("");
            setCreateBase("");
          }
        }}
        onBranchChange={setCreateBranch}
        onBaseChange={setCreateBase}
        onSubmit={onRunCreateWorktreeAction}
        onCancel={() => {
          if (isCreatePending) {
            return;
          }
          setIsCreateModalOpen(false);
          setCreateBranch("");
          setCreateBase("");
        }}
      />
    </>
  );
}
