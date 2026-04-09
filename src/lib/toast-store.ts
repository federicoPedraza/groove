export type ToastType =
  | "success"
  | "error"
  | "info"
  | "warning"
  | "loading"
  | "default";

export type ToastEntry = {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  command?: string;
  createdAt: number;
};

const TOAST_DURATION_MS = 4_000;
const MAX_TOAST_ENTRIES = 50;

type Listener = () => void;

let sequence = 0;
let entries: ToastEntry[] = [];
const listeners = new Set<Listener>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToToastStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastStoreSnapshot(): ToastEntry[] {
  return entries;
}

export function pushToast(
  type: ToastType,
  message: string,
  options?: { description?: string; command?: string },
): string {
  const id = `toast-${Date.now()}-${sequence}`;
  sequence += 1;

  const entry: ToastEntry = {
    id,
    type,
    message,
    description: options?.description,
    command: options?.command,
    createdAt: Date.now(),
  };

  entries = [entry, ...entries].slice(0, MAX_TOAST_ENTRIES);
  emitChange();

  const timer = setTimeout(() => {
    expireToast(id);
  }, TOAST_DURATION_MS);
  expiryTimers.set(id, timer);

  return id;
}

export function dismissToast(id: string): void {
  expireToast(id);
}

export function pauseToast(id: string): void {
  const timer = expiryTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(id);
  }
}

export function resumeToast(id: string): void {
  if (!entries.some((e) => e.id === id)) return;
  if (expiryTimers.has(id)) return;

  const timer = setTimeout(() => {
    expireToast(id);
  }, TOAST_DURATION_MS);
  expiryTimers.set(id, timer);
}

function expireToast(id: string): void {
  const timer = expiryTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(id);
  }

  const prev = entries;
  entries = entries.filter((e) => e.id !== id);
  if (entries !== prev) {
    emitChange();
  }
}

/** Returns the most recent active (non-expired) toast, if any. */
export function getActiveToast(): ToastEntry | null {
  return entries.length > 0 ? entries[0] : null;
}
