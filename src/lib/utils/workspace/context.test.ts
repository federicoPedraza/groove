import { describe, it, expect } from "vitest";

import { describeWorkspaceContextError } from "@/src/lib/utils/workspace/context";

import type { WorkspaceContextResponse } from "@/src/lib/ipc";

function makeResponse(overrides: Partial<WorkspaceContextResponse> = {}): WorkspaceContextResponse {
  return {
    ok: false,
    rows: [],
    ...overrides,
  };
}

describe("describeWorkspaceContextError", () => {
  it("returns error when present and non-empty", () => {
    const result = describeWorkspaceContextError(makeResponse({ error: "Something broke" }));
    expect(result).toBe("Something broke");
  });

  it("returns default fallback when error is undefined", () => {
    const result = describeWorkspaceContextError(makeResponse());
    expect(result).toBe("Failed to load workspace context.");
  });

  it("returns default fallback when error is empty string", () => {
    const result = describeWorkspaceContextError(makeResponse({ error: "" }));
    expect(result).toBe("Failed to load workspace context.");
  });

  it("returns default fallback when error is whitespace", () => {
    const result = describeWorkspaceContextError(makeResponse({ error: "   " }));
    expect(result).toBe("Failed to load workspace context.");
  });

  it("returns custom fallback when error is empty and fallback is provided", () => {
    const result = describeWorkspaceContextError(makeResponse(), "Custom fallback");
    expect(result).toBe("Custom fallback");
  });
});
