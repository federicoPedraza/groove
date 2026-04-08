const NOW_THRESHOLD_MS = 1_000;
const SECONDS_AGO_THRESHOLD_MS = 10_000;
const MAX_HISTORY_ENTRIES = 200;

export type CommandExecutionEntry = {
  id: string;
  command: string;
  startedAt: number;
  completedAt: number | null;
  state: "running" | "success" | "error";
  failureDetail?: string;
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

export function clearCommandHistory(): void {
  if (entries.length === 0) {
    return;
  }

  entries = [];
  emitChange();
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

export function completeCommandExecution(id: string, state: "success" | "error", failureDetail?: string): void {
  const now = Date.now();
  let changed = false;

  entries = entries.map((entry) => {
    if (entry.id !== id || entry.completedAt !== null) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      completedAt: now,
      state,
      ...(state === "error" && failureDetail ? { failureDetail } : {}),
    };
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
    const outcome = inferResultOutcome(result);
    completeCommandExecution(id, outcome.state, outcome.failureDetail);
    return result;
  } catch (error) {
    completeCommandExecution(id, "error", extractFailureDetail(error));
    throw error;
  }
}

function inferResultOutcome(result: unknown): { state: "success" | "error"; failureDetail?: string } {
  if (!result || typeof result !== "object" || !("ok" in result)) {
    return { state: "success" };
  }

  if (result.ok !== false) {
    return { state: "success" };
  }

  return {
    state: "error",
    failureDetail: extractFailureDetail(result),
  };
}

function extractFailureDetail(value: unknown): string | undefined {
  if (value instanceof Error) {
    return normalizeFailureDetail(value.message);
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as {
    error?: unknown;
    stderr?: unknown;
    outputSnippet?: unknown;
    message?: unknown;
    stdout?: unknown;
    errors?: unknown;
  };

  const prioritizedDetails = [
    candidate.error,
    candidate.stderr,
    candidate.outputSnippet,
    candidate.message,
    candidate.stdout,
  ];

  for (const detail of prioritizedDetails) {
    const normalized = normalizeFailureDetail(detail);
    if (normalized) {
      return normalized;
    }
  }

  if (Array.isArray(candidate.errors)) {
    const normalized = normalizeFailureDetail(candidate.errors.filter((entry) => typeof entry === "string").join("\n"));
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeFailureDetail(detail: unknown): string | undefined {
  if (typeof detail !== "string") {
    return undefined;
  }

  const trimmed = detail.trim();
  if (!trimmed) {
    return undefined;
  }

  const MAX_FAILURE_DETAIL_LENGTH = 500;
  return trimmed.length > MAX_FAILURE_DETAIL_LENGTH
    ? `${trimmed.slice(0, MAX_FAILURE_DETAIL_LENGTH - 1)}…`
    : trimmed;
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
