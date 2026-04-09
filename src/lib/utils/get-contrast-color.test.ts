import { describe, expect, it } from "vitest";

import { getContrastColor } from "./get-contrast-color";

describe("getContrastColor", () => {
  it("returns black for white background", () => {
    expect(getContrastColor("#ffffff")).toBe("black");
  });

  it("returns white for black background", () => {
    expect(getContrastColor("#000000")).toBe("white");
  });

  it("returns white for dark colors", () => {
    expect(getContrastColor("#0f172a")).toBe("white"); // slate-900
    expect(getContrastColor("#1e3a5f")).toBe("white"); // dark blue
  });

  it("returns black for bright/medium colors", () => {
    expect(getContrastColor("#f59e0b")).toBe("black"); // amber-500
    expect(getContrastColor("#10b981")).toBe("black"); // emerald-500
    expect(getContrastColor("#06b6d4")).toBe("black"); // cyan-500
    expect(getContrastColor("#f97316")).toBe("black"); // orange-500
    expect(getContrastColor("#6366f1")).toBe("black"); // indigo-500
    expect(getContrastColor("#0ea5e9")).toBe("black"); // sky-500
  });

  it("handles hex without hash prefix", () => {
    expect(getContrastColor("ffffff")).toBe("black");
    expect(getContrastColor("000000")).toBe("white");
  });
});
