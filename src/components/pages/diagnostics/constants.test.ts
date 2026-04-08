import { describe, expect, it } from "vitest";

import { SOFT_RED_BUTTON_CLASSES } from "@/src/components/pages/diagnostics/constants";
import { SOFT_RED_BUTTON_CLASSES as DASHBOARD_SOFT_RED_BUTTON_CLASSES } from "@/src/components/pages/dashboard/constants";

describe("diagnostics constants", () => {
  it("re-exports SOFT_RED_BUTTON_CLASSES from dashboard constants", () => {
    expect(typeof SOFT_RED_BUTTON_CLASSES).toBe("string");
    expect(SOFT_RED_BUTTON_CLASSES.length).toBeGreaterThan(0);
    expect(SOFT_RED_BUTTON_CLASSES).toBe(DASHBOARD_SOFT_RED_BUTTON_CLASSES);
  });
});
