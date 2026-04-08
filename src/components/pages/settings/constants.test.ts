import { describe, expect, it } from "vitest";

import { SUPPORTED_TERMINAL_OPTIONS } from "@/src/components/pages/settings/constants";

describe("SUPPORTED_TERMINAL_OPTIONS", () => {
  it("exports an array of terminal options with value and label", () => {
    expect(Array.isArray(SUPPORTED_TERMINAL_OPTIONS)).toBe(true);
    expect(SUPPORTED_TERMINAL_OPTIONS.length).toBeGreaterThan(0);

    for (const option of SUPPORTED_TERMINAL_OPTIONS) {
      expect(typeof option.value).toBe("string");
      expect(typeof option.label).toBe("string");
      expect(option.value.length).toBeGreaterThan(0);
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the auto option as the first entry", () => {
    expect(SUPPORTED_TERMINAL_OPTIONS[0]).toEqual({
      value: "auto",
      label: "Auto (recommended)",
    });
  });

  it("includes all expected terminal values", () => {
    const values = SUPPORTED_TERMINAL_OPTIONS.map((option) => option.value);
    expect(values).toContain("auto");
    expect(values).toContain("ghostty");
    expect(values).toContain("warp");
    expect(values).toContain("kitty");
    expect(values).toContain("gnome");
    expect(values).toContain("xterm");
    expect(values).toContain("none");
    expect(values).toContain("custom");
  });

  it("has unique values", () => {
    const values = SUPPORTED_TERMINAL_OPTIONS.map((option) => option.value);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});
