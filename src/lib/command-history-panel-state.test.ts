import { describe, it, expect, beforeEach } from "vitest";

import {
  getIsCommandHistoryPanelOpen,
  setIsCommandHistoryPanelOpen,
} from "@/src/lib/command-history-panel-state";

describe("command-history-panel-state", () => {
  beforeEach(() => {
    setIsCommandHistoryPanelOpen(false);
  });

  it("defaults to false", () => {
    expect(getIsCommandHistoryPanelOpen()).toBe(false);
  });

  it("sets to true", () => {
    setIsCommandHistoryPanelOpen(true);
    expect(getIsCommandHistoryPanelOpen()).toBe(true);
  });

  it("sets back to false", () => {
    setIsCommandHistoryPanelOpen(true);
    setIsCommandHistoryPanelOpen(false);
    expect(getIsCommandHistoryPanelOpen()).toBe(false);
  });

  it("is a no-op when setting the same value", () => {
    setIsCommandHistoryPanelOpen(false);
    expect(getIsCommandHistoryPanelOpen()).toBe(false);

    setIsCommandHistoryPanelOpen(true);
    setIsCommandHistoryPanelOpen(true);
    expect(getIsCommandHistoryPanelOpen()).toBe(true);
  });
});
