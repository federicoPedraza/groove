/**
 * Tiny external store that tracks which worktrees have unread notifications.
 * Used by the sidebar to show a red dot, and cleared when the user views
 * the worktree detail page.
 */

const notifiedWorktrees = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function addNotifiedWorktree(worktree: string): void {
  if (notifiedWorktrees.has(worktree)) {
    return;
  }
  notifiedWorktrees.add(worktree);
  emit();
}

export function clearNotifiedWorktree(worktree: string): void {
  if (!notifiedWorktrees.has(worktree)) {
    return;
  }
  notifiedWorktrees.delete(worktree);
  emit();
}

export function hasNotifiedWorktree(worktree: string): boolean {
  return notifiedWorktrees.has(worktree);
}

export function getNotifiedWorktreesSnapshot(): ReadonlySet<string> {
  return notifiedWorktrees;
}

export function subscribeToNotifiedWorktrees(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
