import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  subscribeToCommandHistory,
  getCommandHistorySnapshot,
  clearCommandHistory,
  beginCommandExecution,
  completeCommandExecution,
  trackCommandExecution,
  formatCommandRelativeTime,
} from "@/src/lib/command-history";

import type { CommandExecutionEntry } from "@/src/lib/command-history";

beforeEach(() => {
  clearCommandHistory();
});

describe("subscribeToCommandHistory / getCommandHistorySnapshot", () => {
  it("returns empty array initially", () => {
    expect(getCommandHistorySnapshot()).toEqual([]);
  });

  it("notifies listeners on changes", () => {
    const listener = vi.fn();
    subscribeToCommandHistory(listener);

    beginCommandExecution("test_cmd");
    expect(listener).toHaveBeenCalled();
  });

  it("unsubscribes listener", () => {
    const listener = vi.fn();
    const unsub = subscribeToCommandHistory(listener);
    unsub();

    beginCommandExecution("test_cmd");
    // listener registered then removed before begin, so not called after unsub
    // But clearCommandHistory in beforeEach may have called it once
    const callCountAfterUnsub = listener.mock.calls.length;
    beginCommandExecution("test_cmd_2");
    expect(listener.mock.calls.length).toBe(callCountAfterUnsub);
  });
});

describe("clearCommandHistory", () => {
  it("clears all entries and notifies listeners", () => {
    beginCommandExecution("cmd_a");
    expect(getCommandHistorySnapshot().length).toBe(1);

    const listener = vi.fn();
    subscribeToCommandHistory(listener);

    clearCommandHistory();
    expect(getCommandHistorySnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalled();
  });

  it("does not notify when already empty", () => {
    const listener = vi.fn();
    subscribeToCommandHistory(listener);
    clearCommandHistory();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("beginCommandExecution", () => {
  it("adds a running entry at the start of the list", () => {
    const id = beginCommandExecution("my_command");
    const snapshot = getCommandHistorySnapshot();

    expect(snapshot.length).toBe(1);
    expect(snapshot[0].id).toBe(id);
    expect(snapshot[0].command).toBe("my_command");
    expect(snapshot[0].state).toBe("running");
    expect(snapshot[0].completedAt).toBeNull();
  });

  it("prepends new entries", () => {
    beginCommandExecution("first");
    beginCommandExecution("second");
    const snapshot = getCommandHistorySnapshot();

    expect(snapshot[0].command).toBe("second");
    expect(snapshot[1].command).toBe("first");
  });

  it("trims entries beyond MAX_HISTORY_ENTRIES (200)", () => {
    for (let i = 0; i < 210; i++) {
      beginCommandExecution(`cmd_${i}`);
    }

    expect(getCommandHistorySnapshot().length).toBe(200);
  });
});

describe("completeCommandExecution", () => {
  it("marks entry as success", () => {
    const id = beginCommandExecution("cmd");
    completeCommandExecution(id, "success");

    const entry = getCommandHistorySnapshot().find((e) => e.id === id);
    expect(entry?.state).toBe("success");
    expect(entry?.completedAt).toBeTypeOf("number");
  });

  it("marks entry as error with failure detail", () => {
    const id = beginCommandExecution("cmd");
    completeCommandExecution(id, "error", "Something went wrong");

    const entry = getCommandHistorySnapshot().find((e) => e.id === id);
    expect(entry?.state).toBe("error");
    expect(entry?.failureDetail).toBe("Something went wrong");
  });

  it("does not add failureDetail for success state even if provided", () => {
    const id = beginCommandExecution("cmd");
    completeCommandExecution(id, "success", "ignored detail");

    const entry = getCommandHistorySnapshot().find((e) => e.id === id);
    expect(entry?.failureDetail).toBeUndefined();
  });

  it("does not double-complete an already completed entry", () => {
    const id = beginCommandExecution("cmd");
    completeCommandExecution(id, "success");

    const firstCompletedAt = getCommandHistorySnapshot().find(
      (e) => e.id === id,
    )?.completedAt;
    completeCommandExecution(id, "error");

    const entry = getCommandHistorySnapshot().find((e) => e.id === id);
    expect(entry?.state).toBe("success");
    expect(entry?.completedAt).toBe(firstCompletedAt);
  });

  it("does not notify if no entry matched", () => {
    beginCommandExecution("cmd");
    const listener = vi.fn();
    subscribeToCommandHistory(listener);

    completeCommandExecution("nonexistent-id", "success");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("trackCommandExecution", () => {
  it("records success for a resolved promise", async () => {
    const result = await trackCommandExecution("test_cmd", async () => "done");
    expect(result).toBe("done");

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].state).toBe("success");
  });

  it("records error and rethrows for a rejected promise", async () => {
    await expect(
      trackCommandExecution("test_cmd", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].state).toBe("error");
    expect(snapshot[0].failureDetail).toBe("boom");
  });

  it("infers error state from result with ok:false", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      error: "failed reason",
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].state).toBe("error");
    expect(snapshot[0].failureDetail).toBe("failed reason");
  });

  it("infers success state from result with ok:true", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: true,
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].state).toBe("success");
  });

  it("infers success for non-object result", async () => {
    await trackCommandExecution("test_cmd", async () => 42);

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].state).toBe("success");
  });

  it("infers success for null result", async () => {
    await trackCommandExecution("test_cmd", async () => null);

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].state).toBe("success");
  });

  it("extracts failureDetail from stderr field", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      stderr: "stderr output",
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBe("stderr output");
  });

  it("extracts failureDetail from outputSnippet field", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      outputSnippet: "snippet output",
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBe("snippet output");
  });

  it("extracts failureDetail from message field", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      message: "message output",
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBe("message output");
  });

  it("extracts failureDetail from stdout field", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      stdout: "stdout output",
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBe("stdout output");
  });

  it("extracts failureDetail from errors array", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      errors: ["first error", "second error"],
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBe("first error\nsecond error");
  });

  it("returns undefined failureDetail when errors array has non-strings", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      errors: [123, null],
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBeUndefined();
  });

  it("returns undefined failureDetail for ok:false with no detail fields", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBeUndefined();
  });

  it("truncates long failure details to 500 characters", async () => {
    const longMessage = "x".repeat(600);
    await expect(
      trackCommandExecution("test_cmd", async () => {
        throw new Error(longMessage);
      }),
    ).rejects.toThrow();

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail?.length).toBe(500);
    expect(snapshot[0].failureDetail?.endsWith("\u2026")).toBe(true);
  });

  it("returns undefined for non-Error non-object thrown values", async () => {
    await expect(
      trackCommandExecution("test_cmd", async () => {
        throw 42;
      }),
    ).rejects.toBe(42);

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBeUndefined();
  });

  it("returns undefined failureDetail when error field is empty string", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      error: "   ",
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBeUndefined();
  });

  it("returns undefined for non-string detail values", async () => {
    await trackCommandExecution("test_cmd", async () => ({
      ok: false,
      error: 123,
    }));

    const snapshot = getCommandHistorySnapshot();
    expect(snapshot[0].failureDetail).toBeUndefined();
  });
});

describe("formatCommandRelativeTime", () => {
  function makeEntry(
    overrides: Partial<CommandExecutionEntry> = {},
  ): CommandExecutionEntry {
    return {
      id: "test-id",
      command: "test_cmd",
      startedAt: 1000,
      completedAt: 2000,
      state: "success",
      ...overrides,
    };
  }

  it("returns 'running' when completedAt is null", () => {
    expect(
      formatCommandRelativeTime(
        makeEntry({ completedAt: null, state: "running" }),
        5000,
      ),
    ).toBe("running");
  });

  it("returns 'now' when elapsed is less than 1000ms", () => {
    expect(
      formatCommandRelativeTime(makeEntry({ completedAt: 5000 }), 5500),
    ).toBe("now");
  });

  it("returns 'now' when elapsed is exactly 0", () => {
    expect(
      formatCommandRelativeTime(makeEntry({ completedAt: 5000 }), 5000),
    ).toBe("now");
  });

  it("returns 'N seconds ago' for elapsed between 1s and 10s", () => {
    const result = formatCommandRelativeTime(
      makeEntry({ completedAt: 5000 }),
      5000 + 3000,
    );
    expect(result).toBe("3 seconds ago");
  });

  it("returns at least '2 seconds ago' at the boundary", () => {
    const result = formatCommandRelativeTime(
      makeEntry({ completedAt: 5000 }),
      5000 + 1001,
    );
    expect(result).toBe("2 seconds ago");
  });

  it("returns 'a moment ago' for elapsed greater than 10s", () => {
    expect(
      formatCommandRelativeTime(makeEntry({ completedAt: 5000 }), 5000 + 15000),
    ).toBe("a moment ago");
  });

  it("handles negative elapsed by clamping to 0", () => {
    expect(
      formatCommandRelativeTime(makeEntry({ completedAt: 5000 }), 4000),
    ).toBe("now");
  });
});
