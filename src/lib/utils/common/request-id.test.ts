import { describe, it, expect } from "vitest";

import { appendRequestId } from "@/src/lib/utils/common/request-id";

describe("appendRequestId", () => {
  it("returns detail when requestId is undefined", () => {
    expect(appendRequestId("some detail", undefined)).toBe("some detail");
  });

  it("returns detail when requestId is empty string", () => {
    expect(appendRequestId("some detail", "")).toBe("some detail");
  });

  it("returns detail when requestId is whitespace", () => {
    expect(appendRequestId("some detail", "   ")).toBe("some detail");
  });

  it("returns '(requestId: X)' when detail is undefined", () => {
    expect(appendRequestId(undefined, "abc-123")).toBe("(requestId: abc-123)");
  });

  it("returns '(requestId: X)' when detail is empty string", () => {
    expect(appendRequestId("", "abc-123")).toBe("(requestId: abc-123)");
  });

  it("returns '(requestId: X)' when detail is whitespace", () => {
    expect(appendRequestId("   ", "abc-123")).toBe("(requestId: abc-123)");
  });

  it("returns 'detail (requestId: X)' when both are present", () => {
    expect(appendRequestId("Something failed", "req-42")).toBe("Something failed (requestId: req-42)");
  });

  it("returns undefined when both are undefined", () => {
    expect(appendRequestId(undefined, undefined)).toBeUndefined();
  });
});
