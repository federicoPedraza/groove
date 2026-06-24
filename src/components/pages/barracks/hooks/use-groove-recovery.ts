import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  grooveRecoverableClear,
  grooveRecoverableList,
  grooveRestore,
  type RunningGrooveRecord,
  type WorkspaceContextResponse,
  type WorkspaceMeta,
} from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";
import {
  getWorkspaceContextStoreSnapshot,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";

type WorkspaceRecoveryContext = {
  rootName: string;
  knownWorktrees: string[];
  workspaceMeta: WorkspaceMeta;
};

function deriveRecoveryContext(
  context: WorkspaceContextResponse | null,
): WorkspaceRecoveryContext | null {
  if (
    !context ||
    !context.ok ||
    !context.workspaceMeta ||
    !context.workspaceRoot
  ) {
    return null;
  }
  const rootName = context.workspaceMeta.rootName?.trim();
  if (!rootName) {
    return null;
  }
  const knownWorktrees = context.rows
    .filter((row) => row.status !== "deleted")
    .map((row) => row.worktree);
  return { rootName, knownWorktrees, workspaceMeta: context.workspaceMeta };
}

export type UseGrooveRecoveryResult = {
  open: boolean;
  grooves: RunningGrooveRecord[];
  selected: ReadonlySet<string>;
  loading: boolean;
  toggle: (worktree: string) => void;
  recover: () => void;
  dismiss: () => void;
  onOpenChange: (open: boolean) => void;
};

/**
 * Surfaces grooves that were playing when Groove last exited but were never
 * cleanly stopped (survivors of an unexpected shutdown). Checks once per
 * workspace per app launch and drives the recover/dismiss prompt.
 */
export function useGrooveRecovery(): UseGrooveRecoveryResult {
  const { context } = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );

  const recoveryContext = deriveRecoveryContext(context);
  const workspaceRoot = context?.workspaceRoot ?? null;

  const [grooves, setGrooves] = useState<RunningGrooveRecord[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkedWorkspacesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!recoveryContext || !workspaceRoot) {
      return;
    }
    if (checkedWorkspacesRef.current.has(workspaceRoot)) {
      return;
    }
    checkedWorkspacesRef.current.add(workspaceRoot);

    let cancelled = false;
    void (async () => {
      try {
        const result = await grooveRecoverableList({
          rootName: recoveryContext.rootName,
          knownWorktrees: recoveryContext.knownWorktrees,
          workspaceMeta: recoveryContext.workspaceMeta,
        });
        if (cancelled || !result.ok || result.grooves.length === 0) {
          return;
        }
        setGrooves(result.grooves);
        setSelected(new Set(result.grooves.map((groove) => groove.worktree)));
        setOpen(true);
      } catch {
        // Recovery is best-effort; never block startup on it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recoveryContext, workspaceRoot]);

  const toggle = useCallback((worktree: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(worktree)) {
        next.delete(worktree);
      } else {
        next.add(worktree);
      }
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    if (!recoveryContext) {
      setOpen(false);
      return;
    }
    setLoading(true);
    void grooveRecoverableClear({
      rootName: recoveryContext.rootName,
      knownWorktrees: recoveryContext.knownWorktrees,
      workspaceMeta: recoveryContext.workspaceMeta,
      worktrees: grooves.map((groove) => groove.worktree),
    })
      .catch(() => {
        // Best-effort: leave records in place if clearing fails.
      })
      .finally(() => {
        setLoading(false);
        setOpen(false);
      });
  }, [grooves, recoveryContext]);

  const recover = useCallback(() => {
    if (!recoveryContext) {
      setOpen(false);
      return;
    }
    const chosen = grooves.filter((groove) => selected.has(groove.worktree));
    const skipped = grooves.filter((groove) => !selected.has(groove.worktree));
    if (chosen.length === 0) {
      dismiss();
      return;
    }

    setLoading(true);
    void (async () => {
      let recovered = 0;
      try {
        for (const groove of chosen) {
          try {
            const result = await grooveRestore({
              rootName: recoveryContext.rootName,
              knownWorktrees: recoveryContext.knownWorktrees,
              workspaceMeta: recoveryContext.workspaceMeta,
              worktree: groove.worktree,
              action: "go",
              target: groove.target,
            });
            if (result.ok) {
              recovered += 1;
            }
          } catch {
            // Continue with the rest of the selection.
          }
        }

        if (skipped.length > 0) {
          await grooveRecoverableClear({
            rootName: recoveryContext.rootName,
            knownWorktrees: recoveryContext.knownWorktrees,
            workspaceMeta: recoveryContext.workspaceMeta,
            worktrees: skipped.map((groove) => groove.worktree),
          }).catch(() => {
            // Best-effort.
          });
        }

        if (recovered > 0) {
          toast.success(
            recovered === 1
              ? "Recovered 1 groove."
              : `Recovered ${recovered} grooves.`,
            { command: "groove_restore" },
          );
        }
        if (recovered < chosen.length) {
          toast.error("Some grooves could not be recovered.", {
            command: "groove_restore",
          });
        }
      } finally {
        setLoading(false);
        setOpen(false);
      }
    })();
  }, [dismiss, grooves, recoveryContext, selected]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next || loading) {
        return;
      }
      dismiss();
    },
    [dismiss, loading],
  );

  return {
    open,
    grooves,
    selected,
    loading,
    toggle,
    recover,
    dismiss,
    onOpenChange,
  };
}
