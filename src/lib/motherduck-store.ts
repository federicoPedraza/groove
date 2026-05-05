import { motherduckGetStatus } from "@/src/lib/ipc";

type Listener = () => void;

export type MotherduckStoreSnapshot = {
  tokenPresent: boolean;
  defaultDatabase: string | null;
  workspaceRoot: string | null;
  isLoading: boolean;
  hasLoadedOnce: boolean;
};

const INITIAL_SNAPSHOT: MotherduckStoreSnapshot = {
  tokenPresent: false,
  defaultDatabase: null,
  workspaceRoot: null,
  isLoading: false,
  hasLoadedOnce: false,
};

let snapshot: MotherduckStoreSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<Listener>();
let inFlight: Promise<void> | null = null;
let inFlightWorkspaceRoot: string | null = null;
let refreshGeneration = 0;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: MotherduckStoreSnapshot): void {
  if (
    snapshot.tokenPresent === next.tokenPresent &&
    snapshot.defaultDatabase === next.defaultDatabase &&
    snapshot.workspaceRoot === next.workspaceRoot &&
    snapshot.isLoading === next.isLoading &&
    snapshot.hasLoadedOnce === next.hasLoadedOnce
  ) {
    return;
  }
  snapshot = next;
  emit();
}

export function subscribeToMotherduckStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMotherduckStoreSnapshot(): MotherduckStoreSnapshot {
  return snapshot;
}

export function resetMotherduckStore(): void {
  refreshGeneration += 1;
  inFlight = null;
  inFlightWorkspaceRoot = null;
  setSnapshot(INITIAL_SNAPSHOT);
}

export async function refreshMotherduckStatus(
  workspaceRoot: string | null = null,
): Promise<void> {
  // Only dedup against an in-flight call that targets the same workspace. A
  // request from a freshly-switched workspace must not consume a pending
  // response that was issued in the previous workspace's context.
  if (inFlight && inFlightWorkspaceRoot === workspaceRoot) {
    return inFlight;
  }

  refreshGeneration += 1;
  const generation = refreshGeneration;
  inFlightWorkspaceRoot = workspaceRoot;

  setSnapshot({ ...snapshot, isLoading: true });

  inFlight = (async () => {
    try {
      const response = await motherduckGetStatus();
      if (generation !== refreshGeneration) {
        return;
      }
      setSnapshot({
        tokenPresent: Boolean(response.tokenPresent),
        defaultDatabase: response.defaultDatabase ?? null,
        workspaceRoot: response.workspaceRoot ?? null,
        isLoading: false,
        hasLoadedOnce: true,
      });
    } catch {
      if (generation !== refreshGeneration) {
        return;
      }
      setSnapshot({
        ...snapshot,
        isLoading: false,
        hasLoadedOnce: true,
      });
    } finally {
      if (generation === refreshGeneration) {
        inFlight = null;
        inFlightWorkspaceRoot = null;
      }
    }
  })();

  return inFlight;
}
