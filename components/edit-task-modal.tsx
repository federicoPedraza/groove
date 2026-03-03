"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { WorkspaceTask } from "@/src/lib/ipc";

type EditTaskModalProps = {
  open: boolean;
  task: WorkspaceTask | null;
  savePending: boolean;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { id: string; title: string; description: string }) => void;
};

export function EditTaskModal({
  open,
  task,
  savePending,
  errorMessage,
  onOpenChange,
  onSave,
}: EditTaskModalProps) {
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !task) {
      return;
    }

    setTitleDraft(task.title);
    setDescriptionDraft(task.description);
    setValidationError(null);
  }, [open, task]);

  const combinedErrorMessage = useMemo(() => {
    if (validationError) {
      return validationError;
    }

    return errorMessage;
  }, [errorMessage, validationError]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (savePending || !task) {
              return;
            }

            const normalizedTitle = titleDraft.trim();
            const normalizedDescription = descriptionDraft.trim();
            if (!normalizedTitle) {
              setValidationError("Title is required.");
              return;
            }

            if (!normalizedDescription) {
              setValidationError("Description is required.");
              return;
            }

            setValidationError(null);
            onSave({
              id: task.id,
              title: normalizedTitle,
              description: normalizedDescription,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update title and description for this task.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="task-title" className="text-sm font-medium">Title</label>
            <Input
              id="task-title"
              value={titleDraft}
              onChange={(event) => {
                setTitleDraft(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              placeholder="Task title"
              disabled={savePending}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="task-description" className="text-sm font-medium">Description</label>
            <Input
              id="task-description"
              value={descriptionDraft}
              onChange={(event) => {
                setDescriptionDraft(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              placeholder="Task description"
              disabled={savePending}
            />
          </div>

          {combinedErrorMessage ? <p className="text-xs text-destructive">{combinedErrorMessage}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={savePending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savePending || !task}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
