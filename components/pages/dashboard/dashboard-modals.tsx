import { CreateWorktreeModal } from "@/components/create-worktree-modal";
import type { WorktreeRow } from "@/components/pages/dashboard/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";

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
  setCreateBranch: (value: string) => void;
  setCreateBase: (value: string) => void;
  onRunCutGrooveAction: (row: WorktreeRow, force?: boolean) => void;
  onCloseCurrentWorkspace: () => void;
  onRunCreateWorktreeAction: (options?: { branchOverride?: string; baseOverride?: string }) => void;
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
  setCreateBranch,
  setCreateBase,
  onRunCutGrooveAction,
  onCloseCurrentWorkspace,
  onRunCreateWorktreeAction,
}: DashboardModalsProps) {
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
