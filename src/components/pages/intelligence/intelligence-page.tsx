"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Loader2, PencilRuler, Sparkles, SquareTerminal } from "lucide-react";

import { DoctrineSection } from "@/src/components/pages/intelligence/doctrine-section";
import { DoctrineTable } from "@/src/components/pages/intelligence/doctrine-table";
import { GrooveWorktreeTerminal } from "@/src/components/pages/worktrees/groove-worktree-terminal";
import { Button } from "@/src/components/ui/button";
import {
  grooveTerminalListSessions,
  grooveTerminalOpen,
} from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";
import {
  ensureWorkspaceContext,
  getWorkspaceContextStoreSnapshot,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";

/** Pseudo-worktree the backend maps to the workspace root itself. */
const WORKSPACE_TERMINAL_WORKTREE = "__workspace__";

type WorkspaceOpenMode = "claudeCode" | "plain";

export function IntelligencePage() {
  const { context } = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );

  useEffect(() => {
    void ensureWorkspaceContext();
  }, []);

  const workspaceRoot = context?.workspaceRoot ?? null;
  const workspaceMeta = context?.workspaceMeta ?? null;
  const contextRows = context?.rows;
  const knownWorktrees = useMemo(
    () =>
      (contextRows ?? [])
        .filter((row) => row.status !== "deleted")
        .map((row) => row.worktree),
    [contextRows],
  );

  const [pendingOpenMode, setPendingOpenMode] =
    useState<WorkspaceOpenMode | null>(null);

  const openSession = useCallback(
    async (openMode: WorkspaceOpenMode, openNew: boolean) => {
      if (!workspaceMeta) {
        toast.error("Select a workspace before opening a terminal.");
        return;
      }

      setPendingOpenMode(openMode);
      try {
        const result = await grooveTerminalOpen({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: WORKSPACE_TERMINAL_WORKTREE,
          openMode,
          openNew,
        });
        if (!result.ok) {
          toast.error(
            result.error ?? "Failed to open workspace terminal session.",
          );
        }
      } catch {
        toast.error("Workspace terminal open request failed.");
      } finally {
        setPendingOpenMode(null);
      }
    },
    [knownWorktrees, workspaceMeta],
  );

  // Auto-start a Claude Code session at the workspace root on first visit;
  // later visits reattach to whatever sessions are still running.
  const autoOpenAttemptedRef = useRef(false);
  useEffect(() => {
    if (!workspaceMeta || autoOpenAttemptedRef.current) {
      return;
    }
    autoOpenAttemptedRef.current = true;

    void (async () => {
      try {
        const result = await grooveTerminalListSessions({
          rootName: workspaceMeta.rootName,
          knownWorktrees,
          workspaceMeta,
          worktree: WORKSPACE_TERMINAL_WORKTREE,
        });
        if (result.ok && result.sessions.length > 0) {
          return;
        }
      } catch {
        // Fall through and try to open a fresh session.
      }
      await openSession("claudeCode", false);
    })();
  }, [knownWorktrees, openSession, workspaceMeta]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PencilRuler aria-hidden="true" className="size-6" />
          <div>
            <h1 className="text-lg font-semibold">Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              {workspaceRoot
                ? `Claude Code at the workspace root: ${workspaceRoot}`
                : "Terminal sessions at the workspace root."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!workspaceMeta || pendingOpenMode !== null}
            onClick={() => void openSession("plain", true)}
          >
            {pendingOpenMode === "plain" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <SquareTerminal aria-hidden="true" className="size-4" />
            )}
            <span>New terminal</span>
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!workspaceMeta || pendingOpenMode !== null}
            onClick={() => void openSession("claudeCode", true)}
          >
            {pendingOpenMode === "claudeCode" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )}
            <span>New Claude session</span>
          </Button>
        </div>
      </header>

      {workspaceRoot && workspaceMeta ? (
        <GrooveWorktreeTerminal
          workspaceRoot={workspaceRoot}
          workspaceMeta={workspaceMeta}
          knownWorktrees={knownWorktrees}
          worktree={WORKSPACE_TERMINAL_WORKTREE}
          runningSessionIds={[]}
        />
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          Select a workspace to open the Intelligence terminal.
        </div>
      )}

      <DoctrineSection />
      <DoctrineTable />
    </section>
  );
}
