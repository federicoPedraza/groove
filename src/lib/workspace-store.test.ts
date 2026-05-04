import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceGetActiveMock } = vi.hoisted(() => ({
  workspaceGetActiveMock: vi.fn(),
}));

vi.mock("@/src/lib/ipc", () => ({
  workspaceGetActive: workspaceGetActiveMock,
}));

import {
  clearWorkspaceContextStore,
  getWorkspaceContextStoreSnapshot,
  publishActiveTerminalWorktrees,
  publishWorkspaceContext,
  refreshWorkspaceContext,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    workspaceRoot: "/repo/groove",
    workspaceMeta: {
      version: 1,
      rootName: "groove",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    rows: [],
    hasWorktreesDirectory: true,
    ...overrides,
  };
}

beforeEach(() => {
  workspaceGetActiveMock.mockReset();
  clearWorkspaceContextStore();
});

afterEach(() => {
  clearWorkspaceContextStore();
});

describe("workspace-store", () => {
  it("starts with an empty snapshot", () => {
    const snapshot = getWorkspaceContextStoreSnapshot();
    expect(snapshot.context).toBeNull();
    expect(snapshot.activeTerminalWorktrees.size).toBe(0);
    expect(snapshot.isContextLoading).toBe(false);
  });

  it("publishes context updates and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToWorkspaceContextStore(listener);

    publishWorkspaceContext(makeContext());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getWorkspaceContextStoreSnapshot().context).toMatchObject({
      workspaceRoot: "/repo/groove",
    });

    publishActiveTerminalWorktrees(new Set(["alpha", "beta"]));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(
      Array.from(getWorkspaceContextStoreSnapshot().activeTerminalWorktrees),
    ).toEqual(["alpha", "beta"]);

    unsubscribe();
    publishActiveTerminalWorktrees(new Set(["gamma"]));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent refreshWorkspaceContext calls into one IPC", async () => {
    workspaceGetActiveMock.mockResolvedValue(makeContext());

    const promiseA = refreshWorkspaceContext();
    const promiseB = refreshWorkspaceContext();
    expect(promiseA).toBe(promiseB);

    await Promise.all([promiseA, promiseB]);
    expect(workspaceGetActiveMock).toHaveBeenCalledTimes(1);
    expect(getWorkspaceContextStoreSnapshot().context).toMatchObject({
      workspaceRoot: "/repo/groove",
    });
  });

  it("re-fetches after a previous fetch resolves", async () => {
    workspaceGetActiveMock.mockResolvedValueOnce(makeContext());
    workspaceGetActiveMock.mockResolvedValueOnce(
      makeContext({ workspaceRoot: "/repo/other" }),
    );

    await refreshWorkspaceContext();
    await refreshWorkspaceContext();

    expect(workspaceGetActiveMock).toHaveBeenCalledTimes(2);
    expect(getWorkspaceContextStoreSnapshot().context?.workspaceRoot).toBe(
      "/repo/other",
    );
  });
});
