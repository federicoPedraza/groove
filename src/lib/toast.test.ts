import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getToastStoreSnapshot,
  dismissToast,
  pauseToast,
  resumeToast,
  getActiveToast,
  subscribeToToastStore,
  pushToast,
} from "@/src/lib/toast-store";
import { toast } from "@/src/lib/toast";

beforeEach(() => {
  vi.useFakeTimers();
  // Clear all active toasts
  for (const entry of getToastStoreSnapshot()) {
    dismissToast(entry.id);
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast api", () => {
  it("pushes a default toast via direct call", () => {
    toast("Hello");
    const entries = getToastStoreSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("default");
    expect(entries[0].message).toBe("Hello");
  });

  it("pushes a success toast", () => {
    toast.success("Worked");
    const entries = getToastStoreSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("success");
    expect(entries[0].message).toBe("Worked");
  });

  it("pushes an error toast", () => {
    toast.error("Failed");
    const entries = getToastStoreSnapshot();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("error");
    expect(entries[0].message).toBe("Failed");
  });

  it("pushes an info toast", () => {
    toast.info("Note");
    const entries = getToastStoreSnapshot();
    expect(entries[0].type).toBe("info");
  });

  it("pushes a warning toast", () => {
    toast.warning("Watch out");
    const entries = getToastStoreSnapshot();
    expect(entries[0].type).toBe("warning");
  });

  it("includes description when provided", () => {
    toast.error("Broke", { description: "Details here" });
    const entries = getToastStoreSnapshot();
    expect(entries[0].description).toBe("Details here");
  });

  it("dismiss removes a toast", () => {
    const id = toast.success("Temporary");
    expect(getToastStoreSnapshot().length).toBe(1);
    toast.dismiss(id);
    expect(getToastStoreSnapshot().length).toBe(0);
  });

  it("returns a string id", () => {
    const id = toast("Hello");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("auto-expires toast after duration", () => {
    toast.info("Expiring");
    expect(getToastStoreSnapshot().length).toBe(1);
    vi.advanceTimersByTime(4000);
    expect(getToastStoreSnapshot().length).toBe(0);
  });

  it("includes command when provided", () => {
    toast.success("Done", { command: "groove_restore" });
    expect(getToastStoreSnapshot()[0].command).toBe("groove_restore");
  });
});

describe("pauseToast / resumeToast", () => {
  it("pauseToast prevents auto-expiry", () => {
    const id = toast.info("Paused");
    pauseToast(id);
    vi.advanceTimersByTime(5000);
    expect(getToastStoreSnapshot().length).toBe(1);
  });

  it("resumeToast restarts expiry after pause", () => {
    const id = toast.info("Resume me");
    pauseToast(id);
    vi.advanceTimersByTime(5000);
    expect(getToastStoreSnapshot().length).toBe(1);
    resumeToast(id);
    vi.advanceTimersByTime(4000);
    expect(getToastStoreSnapshot().length).toBe(0);
  });

  it("pauseToast is a no-op for unknown id", () => {
    toast.info("Exists");
    pauseToast("nonexistent-id");
    expect(getToastStoreSnapshot().length).toBe(1);
  });

  it("resumeToast is a no-op for unknown id", () => {
    resumeToast("nonexistent-id");
    expect(getToastStoreSnapshot().length).toBe(0);
  });

  it("resumeToast is a no-op if toast already has a timer", () => {
    const id = toast.info("Has timer");
    // Timer already exists from pushToast, resumeToast should not add another
    resumeToast(id);
    vi.advanceTimersByTime(4000);
    expect(getToastStoreSnapshot().length).toBe(0);
  });
});

describe("getActiveToast", () => {
  it("returns null when no toasts exist", () => {
    expect(getActiveToast()).toBeNull();
  });

  it("returns the most recent toast", () => {
    toast.info("First");
    toast.success("Second");
    const active = getActiveToast();
    expect(active?.message).toBe("Second");
  });
});

describe("subscribeToToastStore", () => {
  it("notifies listener on push and dismiss", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToastStore(listener);

    const id = pushToast("info", "Hello");
    expect(listener).toHaveBeenCalledTimes(1);

    dismissToast(id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    pushToast("info", "After unsub");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("pushToast edge cases", () => {
  it("limits entries to max capacity", () => {
    for (let i = 0; i < 55; i++) {
      pushToast("info", `Toast ${i}`);
    }
    expect(getToastStoreSnapshot().length).toBeLessThanOrEqual(50);
  });
});
