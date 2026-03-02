import { TaskBadge } from "@/components/ui/task-badge";
import type { WorkspaceTask } from "@/src/lib/ipc";

type WorktreeTaskSelectorProps = {
  worktree: string;
  tasks: WorkspaceTask[];
  selectedTaskId: string | null;
  onTaskChange: (worktree: string, taskId: string | null) => void;
  onAssignPr: (taskId: string, url: string) => Promise<void>;
  disabled?: boolean;
  triggerClassName?: string;
};

export function WorktreeTaskSelector({
  worktree,
  tasks,
  selectedTaskId,
  onTaskChange,
  onAssignPr,
  disabled = false,
  triggerClassName,
}: WorktreeTaskSelectorProps) {
  return (
    <TaskBadge
      worktree={worktree}
      tasks={tasks}
      selectedTaskId={selectedTaskId}
      onTaskChange={(taskId) => {
        onTaskChange(worktree, taskId);
      }}
      onAssignPr={onAssignPr}
      disabled={disabled}
      className={triggerClassName}
    />
  );
}
