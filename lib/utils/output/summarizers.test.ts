import { describe, expect, it } from "vitest";

import { summarizeRestoreOutput } from "@/lib/utils/output/summarizers";

describe("summarizeRestoreOutput", () => {
  it("returns undefined when output is empty", () => {
    expect(summarizeRestoreOutput("", "")).toBeUndefined();
  });

  it("prefers actionable lines over generic prelude text", () => {
    const summary = summarizeRestoreOutput(
      "starting restore\npreflight checks",
      "fatal: worktree already checked out",
    );

    expect(summary).toBe("fatal: worktree already checked out");
  });

  it("truncates long lines to keep toast-sized summaries", () => {
    const longLine = `error: ${"x".repeat(220)}`;

    const summary = summarizeRestoreOutput("", longLine);

    expect(summary).toHaveLength(160);
    expect(summary?.endsWith("...")).toBe(true);
  });
});
