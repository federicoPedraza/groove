import { describe, expect, it } from "vitest";

import {
  READY_STATUS_CLASSES,
  CLOSING_STATUS_CLASSES,
  PAUSED_STATUS_CLASSES,
  CORRUPTED_STATUS_CLASSES,
  DELETED_STATUS_CLASSES,
  SOFT_GREEN_BUTTON_CLASSES,
  SOFT_RED_BUTTON_CLASSES,
  ACTIVE_GREEN_BUTTON_CLASSES,
  ACTIVE_ORANGE_BUTTON_CLASSES,
  ACTIVE_AMBER_BUTTON_CLASSES,
  SOFT_YELLOW_BUTTON_CLASSES,
  SOFT_AMBER_BUTTON_CLASSES,
  SOFT_ORANGE_BUTTON_CLASSES,
} from "@/src/components/pages/dashboard/constants";

describe("dashboard constants", () => {
  it("exports all status class constants as non-empty strings", () => {
    const statusClasses = [
      READY_STATUS_CLASSES,
      CLOSING_STATUS_CLASSES,
      PAUSED_STATUS_CLASSES,
      CORRUPTED_STATUS_CLASSES,
      DELETED_STATUS_CLASSES,
    ];
    for (const cls of statusClasses) {
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    }
  });

  it("exports all button class constants as non-empty strings", () => {
    const buttonClasses = [
      SOFT_GREEN_BUTTON_CLASSES,
      SOFT_RED_BUTTON_CLASSES,
      ACTIVE_GREEN_BUTTON_CLASSES,
      ACTIVE_ORANGE_BUTTON_CLASSES,
      ACTIVE_AMBER_BUTTON_CLASSES,
      SOFT_YELLOW_BUTTON_CLASSES,
      SOFT_AMBER_BUTTON_CLASSES,
      SOFT_ORANGE_BUTTON_CLASSES,
    ];
    for (const cls of buttonClasses) {
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    }
  });

  it("each status class constant is unique", () => {
    const statusClasses = [
      READY_STATUS_CLASSES,
      CLOSING_STATUS_CLASSES,
      PAUSED_STATUS_CLASSES,
      CORRUPTED_STATUS_CLASSES,
      DELETED_STATUS_CLASSES,
    ];
    const unique = new Set(statusClasses);
    expect(unique.size).toBe(statusClasses.length);
  });

  it("each button class constant is unique", () => {
    const buttonClasses = [
      SOFT_GREEN_BUTTON_CLASSES,
      SOFT_RED_BUTTON_CLASSES,
      ACTIVE_GREEN_BUTTON_CLASSES,
      ACTIVE_ORANGE_BUTTON_CLASSES,
      ACTIVE_AMBER_BUTTON_CLASSES,
      SOFT_YELLOW_BUTTON_CLASSES,
      SOFT_AMBER_BUTTON_CLASSES,
      SOFT_ORANGE_BUTTON_CLASSES,
    ];
    const unique = new Set(buttonClasses);
    expect(unique.size).toBe(buttonClasses.length);
  });
});
