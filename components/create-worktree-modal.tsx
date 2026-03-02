"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";

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
import { SearchDropdown } from "@/components/ui/search-dropdown";
import { gitCurrentBranch, gitListBranches } from "@/src/lib/ipc";

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
  const [existingBranches, setExistingBranches] = useState<string[]>([]);
  const [isExistingBranchesLoading, setIsExistingBranchesLoading] = useState(false);
  const [existingBranchesError, setExistingBranchesError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const existingBranchOptions = useMemo(() => {
    return existingBranches.map((branchName) => ({
      value: branchName,
      label: branchName,
      icon: <GitBranch aria-hidden="true" className="size-4" />,
    }));
  }, [existingBranches]);

  useEffect(() => {
    if (!open) {
      setExistingBranchesError(null);
      setSelectionError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !workspaceRoot) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setIsExistingBranchesLoading(true);
      setExistingBranchesError(null);
      try {
        const [branchesResult, currentBranchResult] = await Promise.all([
          gitListBranches({ path: workspaceRoot }),
          gitCurrentBranch({ path: workspaceRoot }),
        ]);
        if (cancelled) {
          return;
        }

        if (!branchesResult.ok) {
          setExistingBranches([]);
          setExistingBranchesError(branchesResult.error ?? "Failed to load branches.");
          onBaseChange("");
          return;
        }

        const availableBranches = branchesResult.branches;
        setExistingBranches(availableBranches);

        if (availableBranches.length === 0) {
          onBaseChange("");
          return;
        }

        const currentBranch = currentBranchResult.ok ? currentBranchResult.branch?.trim() : "";
        if (currentBranch && availableBranches.includes(currentBranch)) {
          onBaseChange(currentBranch);
          return;
        }

        onBaseChange(availableBranches[0]);
      } catch {
        if (!cancelled) {
          setExistingBranches([]);
          setExistingBranchesError("Failed to load branches.");
          onBaseChange("");
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
  }, [onBaseChange, open, workspaceRoot]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading) {
              const selectedBranch = base.trim();
              if (!selectedBranch) {
                setSelectionError("Select an existing base branch.");
                return;
              }

              if (!existingBranches.includes(selectedBranch)) {
                setSelectionError("Select a branch from the existing branch list.");
                return;
              }

              setSelectionError(null);
              onSubmit({ baseOverride: selectedBranch });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create worktree</DialogTitle>
            <DialogDescription>Enter a branch name and choose the base branch.</DialogDescription>
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
            <label className="text-sm font-medium">Base branch</label>
            <SearchDropdown
              ariaLabel="Select base branch"
              searchAriaLabel="Search existing branches"
              options={existingBranchOptions}
              value={base}
              placeholder={isExistingBranchesLoading ? "Loading branches..." : "Select an existing branch"}
              searchPlaceholder="Filter branches"
              onValueChange={(nextValue) => {
                setSelectionError(null);
                onBaseChange(nextValue);
              }}
              disabled={loading || isExistingBranchesLoading || existingBranches.length === 0}
            />
            {existingBranchesError ? <p className="text-xs text-destructive">{existingBranchesError}</p> : null}
            {!existingBranchesError && selectionError ? <p className="text-xs text-destructive">{selectionError}</p> : null}
            {!isExistingBranchesLoading && !existingBranchesError && existingBranches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No branches were found in this repository.</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || isExistingBranchesLoading || existingBranches.length === 0 || !base.trim()}>
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
