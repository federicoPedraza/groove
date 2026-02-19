"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CreateWorktreeModalProps = {
  open: boolean;
  branch: string;
  base: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onBranchChange: (value: string) => void;
  onBaseChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

function CreateWorktreeModal({
  open,
  branch,
  base,
  loading,
  onOpenChange,
  onBranchChange,
  onBaseChange,
  onSubmit,
  onCancel,
}: CreateWorktreeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading) {
              onSubmit();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create worktree</DialogTitle>
            <DialogDescription>
              Enter a branch name and an optional base ref (defaults to HEAD).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="create-worktree-branch" className="text-sm font-medium">
              Branch name
            </label>
            <Input
              id="create-worktree-branch"
              type="text"
              value={branch}
              onChange={(event) => {
                onBranchChange(event.target.value);
              }}
              placeholder="feature/my-branch"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="create-worktree-base" className="text-sm font-medium">
              Base ref (optional)
            </label>
            <Input
              id="create-worktree-base"
              type="text"
              value={base}
              onChange={(event) => {
                onBaseChange(event.target.value);
              }}
              placeholder="HEAD"
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              <span>Create</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateWorktreeModal };
