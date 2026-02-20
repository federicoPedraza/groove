import { CreateWorktreeModal } from "@/components/create-worktree-modal";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";

type DashboardModalsProps = {
  cutConfirmRow: WorktreeRow | null;
  setCutConfirmRow: (row: WorktreeRow | null) => void;
  forceCutConfirmRow: WorktreeRow | null;
  setForceCutConfirmRow: (row: WorktreeRow | null) => void;
  forceCutConfirmLoading: boolean;
  switchTestingTargetConfirmRow: WorktreeRow | null;
  setSwitchTestingTargetConfirmRow: (row: WorktreeRow | null) => void;
  switchTestingTargetConfirmLoading: boolean;
  testingInstanceIsRunning: boolean;
  testingTargetWorktree: string | undefined;
  isCloseWorkspaceConfirmOpen: boolean;
  setIsCloseWorkspaceConfirmOpen: (open: boolean) => void;
  isBusy: boolean;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  createBranch: string;
  createBase: string;
  isCreatePending: boolean;
  setCreateBranch: (value: string) => void;
  setCreateBase: (value: string) => void;
  onRunCutGrooveAction: (row: WorktreeRow, force?: boolean) => void;
  onRunSetTestingTargetAction: (row: WorktreeRow, autoStartIfCurrentRunning?: boolean) => void;
  onCloseCurrentWorkspace: () => void;
  onRunCreateWorktreeAction: () => void;
};

export function DashboardModals({
  cutConfirmRow,
  setCutConfirmRow,
  forceCutConfirmRow,
  setForceCutConfirmRow,
  forceCutConfirmLoading,
  switchTestingTargetConfirmRow,
  setSwitchTestingTargetConfirmRow,
  switchTestingTargetConfirmLoading,
  testingInstanceIsRunning,
  testingTargetWorktree,
  isCloseWorkspaceConfirmOpen,
  setIsCloseWorkspaceConfirmOpen,
  isBusy,
  isCreateModalOpen,
  setIsCreateModalOpen,
  createBranch,
  createBase,
  isCreatePending,
  setCreateBranch,
  setCreateBase,
  onRunCutGrooveAction,
  onRunSetTestingTargetAction,
  onCloseCurrentWorkspace,
  onRunCreateWorktreeAction,
}: DashboardModalsProps) {
  return (
    <>
      <ConfirmModal
        open={cutConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCutConfirmRow(null);
          }
        }}
        title="Cut this groove?"
        description={
          cutConfirmRow
            ? `This removes worktree "${cutConfirmRow.worktree}" (branch "${cutConfirmRow.branchGuess}").`
            : "This removes the selected worktree."
        }
        confirmLabel="Cut groove"
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
        open={switchTestingTargetConfirmRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSwitchTestingTargetConfirmRow(null);
          }
        }}
        title="Switch testing target?"
        description={
          switchTestingTargetConfirmRow
            ? testingInstanceIsRunning
              ? `Testing is currently running for "${testingTargetWorktree}". This will stop it, switch to "${switchTestingTargetConfirmRow.worktree}", and start local testing there.`
              : `Testing target is currently "${testingTargetWorktree}". This will switch target to "${switchTestingTargetConfirmRow.worktree}".`
            : "Switch to the selected testing target."
        }
        confirmLabel={testingInstanceIsRunning ? "Stop and switch" : "Switch target"}
        cancelLabel="Cancel"
        loading={switchTestingTargetConfirmLoading}
        onConfirm={() => {
          if (!switchTestingTargetConfirmRow) {
            return;
          }
          const selectedRow = switchTestingTargetConfirmRow;
          setSwitchTestingTargetConfirmRow(null);
          onRunSetTestingTargetAction(selectedRow, testingInstanceIsRunning);
        }}
        onCancel={() => {
          setSwitchTestingTargetConfirmRow(null);
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
