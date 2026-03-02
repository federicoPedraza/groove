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
          <DialogDescription>Quick guide for daily worktree and Groove flows.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2 text-sm">
          <h2 className="font-medium">Getting started</h2>
          <p className="text-muted-foreground">
            Start by connecting a repository root with <span className="font-medium text-foreground">Select new directory</span> (or <span className="font-medium text-foreground">Change directory</span> once a workspace is open).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Use <span className="font-medium text-foreground">Recent directories</span> to reopen common repos quickly.</li>
            <li>On the Dashboard, use <span className="font-medium text-foreground">Create worktree</span> to add a branch workspace and <span className="font-medium text-foreground">Refresh</span> to rescan.</li>
          </ul>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Workspace structure</h2>
          <p className="text-muted-foreground">
            Groove expects worktree folders under <code>.worktrees</code> in your repository root.
          </p>
          <p className="text-muted-foreground">
            Groove also keeps workspace metadata in <code>.groove/workspace.json</code> so it can restore workspace context and known worktrees.
          </p>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Daily workflow</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Create a branch worktree with <span className="font-medium text-foreground">Create worktree</span>.</li>
            <li>Start a paused row with <span className="font-medium text-foreground">Play groove</span>; stop runtime with <span className="font-medium text-foreground">Pause Groove</span>.</li>
            <li>Open the row from the Worktrees page with <span className="font-medium text-foreground">Open details</span>.</li>
            <li>From details/testing controls, run your app with <span className="font-medium text-foreground">Run local</span>.</li>
          </ul>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Status meanings and actions</h2>
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
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li><span className="font-medium text-foreground">ready</span>: active runtime; use <span className="font-medium text-foreground">Pause Groove</span> to stop it.</li>
            <li><span className="font-medium text-foreground">paused</span>: stopped runtime; use <span className="font-medium text-foreground">Play groove</span> to resume.</li>
            <li><span className="font-medium text-foreground">corrupted</span>: use <span className="font-medium text-foreground">Repair</span>.</li>
            <li><span className="font-medium text-foreground">deleted</span>: use <span className="font-medium text-foreground">Restore</span> (or remove the stale row).</li>
          </ul>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Process and terminal controls</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Use <span className="font-medium text-foreground">Open terminal</span> for an in-app terminal on a worktree.</li>
            <li>Use <span className="font-medium text-foreground">New split</span> to start another in-app terminal session for the same worktree.</li>
            <li><span className="font-medium text-foreground">Pause Groove</span> closes all in-app terminal sessions tied to that worktree.</li>
          </ul>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Testing targets and ports</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Use <span className="font-medium text-foreground">Set testing target</span> on a worktree to include it in Testing Environments.</li>
            <li>From Testing Environments or worktree details, use <span className="font-medium text-foreground">Run local</span> and <span className="font-medium text-foreground">Stop local</span>.</li>
            <li>Configure preferred local ports in <span className="font-medium text-foreground">Settings</span> - <span className="font-medium text-foreground">Workspace settings</span> - <span className="font-medium text-foreground">Testing ports</span>.</li>
          </ul>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Git actions in each worktree row</h2>
          <p className="text-muted-foreground">
            Open <span className="font-medium text-foreground">Git actions</span> to run row-scoped operations like <span className="font-medium text-foreground">Refresh status</span>, <span className="font-medium text-foreground">Commit</span>, <span className="font-medium text-foreground">Pull</span>, <span className="font-medium text-foreground">Push</span>, <span className="font-medium text-foreground">Open branch</span>, and PR actions when a remote is available.
          </p>
        </section>

        <section className="space-y-2 border-t pt-3 text-sm">
          <h2 className="font-medium">Troubleshooting</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>If a row is inconsistent, try <span className="font-medium text-foreground">Repair</span> or <span className="font-medium text-foreground">Restore</span> first.</li>
            <li>If automatic updates lag or are unavailable, use <span className="font-medium text-foreground">Refresh</span> for a manual rescan.</li>
            <li>If state still looks stale, reopen the workspace directory from <span className="font-medium text-foreground">Recent directories</span> or <span className="font-medium text-foreground">Change directory</span>.</li>
          </ul>
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
