import type { DoctrineRecord } from "@/src/lib/ipc";

type DoctrineListener = (records: DoctrineRecord[]) => void;

const listeners = new Set<DoctrineListener>();

export function subscribeDoctrines(listener: DoctrineListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishDoctrines(records: DoctrineRecord[]): void {
  for (const listener of listeners) {
    listener(records);
  }
}
