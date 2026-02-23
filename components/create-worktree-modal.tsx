"use client";

import { useEffect, useId, useState } from "react";
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
import { gitListBranches } from "@/src/lib/ipc";

type BaseMode = "manual" | "branch";

type CreateWorktreeModalProps = {
  open: boolean;
  workspaceRoot: string | null;
  branch: string;
  base: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onBranchChange: (value: string) => void;
  onBaseChange: (value: string) => void;
  onSubmit: (options?: { branchOverride?: string; baseOverride?: string }) => void;
  onCancel: () => void;
};

function CreateWorktreeModal({
  open,
  workspaceRoot,
  branch,
  base,
  loading,
  onOpenChange,
  onBranchChange,
  onBaseChange,
  onSubmit,
  onCancel,
}: CreateWorktreeModalProps) {
  const [baseMode, setBaseMode] = useState<BaseMode>("manual");
  const [existingBranches, setExistingBranches] = useState<string[]>([]);
  const [isExistingBranchesLoading, setIsExistingBranchesLoading] = useState(false);
  const [existingBranchesError, setExistingBranchesError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const branchListId = useId();

  useEffect(() => {
    if (!open) {
      setBaseMode("manual");
      setExistingBranchesError(null);
      setSelectionError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || baseMode !== "branch" || !workspaceRoot) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setIsExistingBranchesLoading(true);
      setExistingBranchesError(null);
      try {
        const result = await gitListBranches({ path: workspaceRoot });
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setExistingBranches([]);
          setExistingBranchesError(result.error ?? "Failed to load branches.");
          return;
        }
        setExistingBranches(result.branches);
      } catch {
        if (!cancelled) {
          setExistingBranches([]);
          setExistingBranchesError("Failed to load branches.");
        }
      } finally {
        if (!cancelled) {
          setIsExistingBranchesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseMode, open, workspaceRoot]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading) {
              if (baseMode === "branch") {
                const selectedBranch = base.trim();
                if (!selectedBranch) {
                  setSelectionError("Select an existing branch.");
                  return;
                }
                setSelectionError(null);
                onSubmit({ branchOverride: selectedBranch, baseOverride: "" });
                return;
              }
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

          {baseMode === "manual" ? (
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
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">Base ref mode</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={baseMode === "manual" ? "default" : "outline"}
                onClick={() => {
                  setBaseMode("manual");
                  setSelectionError(null);
                }}
                disabled={loading}
              >
                Manual ref
              </Button>
              <Button
                type="button"
                variant={baseMode === "branch" ? "default" : "outline"}
                onClick={() => {
                  setBaseMode("branch");
                  setSelectionError(null);
                }}
                disabled={loading}
              >
                Existing branch
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="create-worktree-base" className="text-sm font-medium">
              {baseMode === "branch" ? "Existing branch (optional)" : "Base ref (optional)"}
            </label>
            <Input
              id="create-worktree-base"
              type="text"
              value={base}
              list={baseMode === "branch" ? branchListId : undefined}
              onChange={(event) => {
                if (baseMode === "branch") {
                  setSelectionError(null);
                }
                onBaseChange(event.target.value);
              }}
              placeholder={baseMode === "branch" ? "Search and pick a branch" : "HEAD"}
              disabled={loading || (baseMode === "branch" && isExistingBranchesLoading)}
            />
            {baseMode === "branch" ? <datalist id={branchListId}>{existingBranches.map((branchName) => <option key={branchName} value={branchName} />)}</datalist> : null}
            {baseMode === "branch" && existingBranchesError ? <p className="text-xs text-destructive">{existingBranchesError}</p> : null}
            {baseMode === "branch" && !existingBranchesError && selectionError ? <p className="text-xs text-destructive">{selectionError}</p> : null}
            {baseMode === "branch" && !isExistingBranchesLoading && !existingBranchesError && existingBranches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No branches were found in this repository.</p>
            ) : null}
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
