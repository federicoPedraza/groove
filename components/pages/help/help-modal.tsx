import type { WorktreeStatus } from "@/components/pages/dashboard/types";
import { getWorktreeStatusBadgeClasses, getWorktreeStatusIcon, getWorktreeStatusTitle } from "@/components/pages/dashboard/worktree-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WORKTREE_STATUSES: WorktreeStatus[] = ["ready", "paused", "closing", "deleted", "corrupted"];

type HelpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Groove Help</DialogTitle>
          <DialogDescription>Quick reference for worktrees and Groove statuses.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2 text-sm">
          <h2 className="font-medium">What is a git worktree?</h2>
          <p className="text-muted-foreground">
            A git worktree is another checked-out branch from the same repository, in a separate folder. It lets you work on multiple branches at once without constant branch switching.
          </p>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-medium">Where worktrees are stored</h2>
          <p className="text-muted-foreground">
            Groove expects worktree folders under <code>.worktrees</code> inside your connected repository root.
          </p>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-medium">Status meanings</h2>
          <ul className="space-y-2">
            {WORKTREE_STATUSES.map((status) => (
              <li key={status} className="flex items-start gap-2">
                <Badge variant="outline" className={getWorktreeStatusBadgeClasses(status)} title={getWorktreeStatusTitle(status)}>
                  {getWorktreeStatusIcon(status)}
                  {status}
                </Badge>
                <span className="pt-0.5 text-muted-foreground">{getWorktreeStatusTitle(status)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2 text-sm">
          <h2 className="font-medium">What Groove eases</h2>
          <p className="text-muted-foreground">
            Groove keeps worktree creation, repair, cleanup, and process controls in one place so you can move between tasks faster with less terminal overhead.
          </p>
        </section>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
