import {
  grooveTerminalActiveWorktrees,
  workspaceGetActive,
  type WorkspaceContextResponse,
  type WorkspaceMeta,
  type WorktreeRecord,
  type WorktreeState,
} from "@/src/lib/ipc";

type Listener = () => void;

export type WorkspaceContextStoreSnapshot = {
  context: WorkspaceContextResponse | null;
  activeTerminalWorktrees: ReadonlySet<string>;
  isContextLoading: boolean;
};

const EMPTY_ACTIVE_TERMINAL_WORKTREES: ReadonlySet<string> = new Set();

let snapshot: WorkspaceContextStoreSnapshot = {
  context: null,
  activeTerminalWorktrees: EMPTY_ACTIVE_TERMINAL_WORKTREES,
  isContextLoading: false,
};

const listeners = new Set<Listener>();
let inFlightContextFetch: Promise<WorkspaceContextResponse> | null = null;
let inFlightRuntimeFetch: Promise<ReadonlySet<string>> | null = null;

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: WorkspaceContextStoreSnapshot): void {
  if (
    snapshot.context === next.context &&
    snapshot.activeTerminalWorktrees === next.activeTerminalWorktrees &&
    snapshot.isContextLoading === next.isContextLoading
  ) {
    return;
  }
  snapshot = next;
  emitChange();
}

export function subscribeToWorkspaceContextStore(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkspaceContextStoreSnapshot(): WorkspaceContextStoreSnapshot {
  return snapshot;
}

export function publishWorkspaceContext(
  context: WorkspaceContextResponse,
): void {
  setSnapshot({
    ...snapshot,
    context,
    isContextLoading: false,
  });
}

export function publishActiveTerminalWorktrees(
  next: ReadonlySet<string>,
): void {
  setSnapshot({
    ...snapshot,
    activeTerminalWorktrees: next,
  });
}

/**
 * Optimistically updates the cached worktree's `state` in the snapshot so the
 * UI reflects the user's choice immediately, before the IPC round trip
 * completes. The next `refreshWorkspaceContext()` will overwrite this with the
 * authoritative value from the backend.
 */
export function applyOptimisticWorktreeState(
  worktree: string,
  state: WorktreeState,
): void {
  const context = snapshot.context;
  const meta = context?.workspaceMeta;
  if (!context || !meta) {
    return;
  }
  const previousRecords = meta.worktreeRecords ?? {};
  const previousRecord = previousRecords[worktree];
  if (previousRecord && previousRecord.state === state) {
    return;
  }
  const nextRecord: WorktreeRecord = previousRecord
    ? { ...previousRecord, state }
    : {
        id: worktree,
        createdAt: new Date().toISOString(),
        state,
      };
  const nextRecords = { ...previousRecords, [worktree]: nextRecord };
  const nextMeta: WorkspaceMeta = { ...meta, worktreeRecords: nextRecords };
  const nextContext: WorkspaceContextResponse = {
    ...context,
    workspaceMeta: nextMeta,
  };
  setSnapshot({
    ...snapshot,
    context: nextContext,
  });
}

export function clearWorkspaceContextStore(): void {
  inFlightContextFetch = null;
  inFlightRuntimeFetch = null;
  setSnapshot({
    context: null,
    activeTerminalWorktrees: EMPTY_ACTIVE_TERMINAL_WORKTREES,
    isContextLoading: false,
  });
}

/**
 * Triggers a single `workspaceGetActive()` IPC. Concurrent callers receive the
 * same in-flight promise; the result is published to the snapshot so all
 * subscribers (sidebar, page-shell, settings, diagnostics, shortcuts) re-render
 * from the same data.
 */
export function refreshWorkspaceContext(): Promise<WorkspaceContextResponse> {
  if (inFlightContextFetch) {
    return inFlightContextFetch;
  }

  setSnapshot({ ...snapshot, isContextLoading: true });

  inFlightContextFetch = workspaceGetActive()
    .then((result) => {
      publishWorkspaceContext(result);
      return result;
    })
    .finally(() => {
      inFlightContextFetch = null;
      if (snapshot.isContextLoading) {
        setSnapshot({ ...snapshot, isContextLoading: false });
      }
    });

  return inFlightContextFetch;
}

/**
 * Returns the cached workspace context if the store already has one;
 * otherwise triggers (and awaits) a single `refreshWorkspaceContext()`.
 *
 * Use this for mount-time bootstraps that should reuse an already-fetched
 * snapshot rather than triggering a redundant IPC. Always resolves with the
 * response (cached or freshly fetched).
 */
export function ensureWorkspaceContext(): Promise<WorkspaceContextResponse> {
  if (snapshot.context) {
    return Promise.resolve(snapshot.context);
  }
  return refreshWorkspaceContext();
}

/**
 * Fetches the live "which worktrees have an active PTY" set for the given
 * workspace meta + worktrees, coalescing concurrent calls. Result is published
 * to the snapshot.
 */
export function refreshActiveTerminalWorktrees(input: {
  workspaceMeta: WorkspaceMeta;
  knownWorktrees: string[];
}): Promise<ReadonlySet<string>> {
  if (inFlightRuntimeFetch) {
    return inFlightRuntimeFetch;
  }

  inFlightRuntimeFetch = grooveTerminalActiveWorktrees({
    rootName: input.workspaceMeta.rootName,
    knownWorktrees: input.knownWorktrees,
    workspaceMeta: input.workspaceMeta,
  })
    .then((result) => {
      const next: ReadonlySet<string> =
        result.ok && Array.isArray(result.worktrees)
          ? new Set(result.worktrees)
          : EMPTY_ACTIVE_TERMINAL_WORKTREES;
      publishActiveTerminalWorktrees(next);
      return next;
    })
    .finally(() => {
      inFlightRuntimeFetch = null;
    });

  return inFlightRuntimeFetch;
}
