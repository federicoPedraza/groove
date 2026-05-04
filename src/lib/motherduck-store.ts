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
  setSnapshot(INITIAL_SNAPSHOT);
}

export async function refreshMotherduckStatus(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  setSnapshot({ ...snapshot, isLoading: true });

  inFlight = (async () => {
    try {
      const response = await motherduckGetStatus();
      setSnapshot({
        tokenPresent: Boolean(response.tokenPresent),
        defaultDatabase: response.defaultDatabase ?? null,
        workspaceRoot: response.workspaceRoot ?? null,
        isLoading: false,
        hasLoadedOnce: true,
      });
    } catch {
      setSnapshot({
        ...snapshot,
        isLoading: false,
        hasLoadedOnce: true,
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
