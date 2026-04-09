import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addNotifiedWorktree,
  clearNotifiedWorktree,
  hasNotifiedWorktree,
  getNotifiedWorktreesSnapshot,
  subscribeToNotifiedWorktrees,
} from "@/src/lib/utils/notified-worktrees";

beforeEach(() => {
  for (const worktree of getNotifiedWorktreesSnapshot()) {
    clearNotifiedWorktree(worktree);
  }
});

describe("notified-worktrees", () => {
  it("addNotifiedWorktree adds a worktree", () => {
    addNotifiedWorktree("feature-a");
    expect(hasNotifiedWorktree("feature-a")).toBe(true);
  });

  it("addNotifiedWorktree is idempotent", () => {
    const listener = vi.fn();
    subscribeToNotifiedWorktrees(listener);

    addNotifiedWorktree("feature-a");
    addNotifiedWorktree("feature-a");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clearNotifiedWorktree removes a worktree", () => {
    addNotifiedWorktree("feature-b");
    expect(hasNotifiedWorktree("feature-b")).toBe(true);
    clearNotifiedWorktree("feature-b");
    expect(hasNotifiedWorktree("feature-b")).toBe(false);
  });

  it("clearNotifiedWorktree is a no-op for unknown worktree", () => {
    const listener = vi.fn();
    subscribeToNotifiedWorktrees(listener);

    clearNotifiedWorktree("nonexistent");
    expect(listener).not.toHaveBeenCalled();
  });

  it("hasNotifiedWorktree returns false for unknown worktree", () => {
    expect(hasNotifiedWorktree("unknown")).toBe(false);
  });

  it("getNotifiedWorktreesSnapshot returns the current set", () => {
    addNotifiedWorktree("wt-1");
    addNotifiedWorktree("wt-2");
    const snapshot = getNotifiedWorktreesSnapshot();
    expect(snapshot.has("wt-1")).toBe(true);
    expect(snapshot.has("wt-2")).toBe(true);
    expect(snapshot.size).toBe(2);
  });

  it("subscribeToNotifiedWorktrees notifies on add and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNotifiedWorktrees(listener);

    addNotifiedWorktree("wt-x");
    expect(listener).toHaveBeenCalledTimes(1);

    clearNotifiedWorktree("wt-x");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    addNotifiedWorktree("wt-y");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
