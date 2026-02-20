const NOW_THRESHOLD_MS = 1_000;
const SECONDS_AGO_THRESHOLD_MS = 10_000;
const MAX_HISTORY_ENTRIES = 200;

export type CommandExecutionEntry = {
  id: string;
  command: string;
  startedAt: number;
  completedAt: number | null;
  state: "running" | "success" | "error";
};

type Listener = () => void;

let sequence = 0;
let entries: CommandExecutionEntry[] = [];
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function trimInternal(): boolean {
  if (entries.length <= MAX_HISTORY_ENTRIES) {
    return false;
  }
  entries = entries.slice(0, MAX_HISTORY_ENTRIES);
  return true;
}

export function subscribeToCommandHistory(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCommandHistorySnapshot(): CommandExecutionEntry[] {
  return entries;
}

export function beginCommandExecution(command: string): string {
  const id = `cmd-${Date.now()}-${sequence}`;
  sequence += 1;
  const now = Date.now();

  entries = [{ id, command, startedAt: now, completedAt: null, state: "running" }, ...entries];
  trimInternal();
  emitChange();

  return id;
}

export function completeCommandExecution(id: string, state: "success" | "error"): void {
  const now = Date.now();
  let changed = false;

  entries = entries.map((entry) => {
    if (entry.id !== id || entry.completedAt !== null) {
      return entry;
    }
    changed = true;
    return { ...entry, completedAt: now, state };
  });

  const trimmed = trimInternal();
  if (changed || trimmed) {
    emitChange();
  }
}

export async function trackCommandExecution<T>(command: string, run: () => Promise<T>): Promise<T> {
  const id = beginCommandExecution(command);
  try {
    const result = await run();
    completeCommandExecution(id, inferResultState(result));
    return result;
  } catch (error) {
    completeCommandExecution(id, "error");
    throw error;
  }
}

function inferResultState(result: unknown): "success" | "error" {
  if (!result || typeof result !== "object" || !("ok" in result)) {
    return "success";
  }
  return result.ok === false ? "error" : "success";
}

export function formatCommandRelativeTime(entry: CommandExecutionEntry, now: number): string {
  if (entry.completedAt === null) {
    return "running";
  }

  const elapsedMs = Math.max(0, now - entry.completedAt);
  if (elapsedMs < NOW_THRESHOLD_MS) {
    return "now";
  }

  if (elapsedMs <= SECONDS_AGO_THRESHOLD_MS) {
    const elapsedSeconds = Math.max(2, Math.ceil(elapsedMs / 1_000));
    return `${String(elapsedSeconds)} seconds ago`;
  }

  return "a moment ago";
}
