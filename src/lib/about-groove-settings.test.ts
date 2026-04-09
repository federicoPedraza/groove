import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAlwaysShowDiagnosticsSidebarEnabled,
  setAlwaysShowDiagnosticsSidebarEnabled,
  subscribeToAboutGrooveSettings,
} from "@/src/lib/about-groove-settings";

const STORAGE_KEY = "groove:always-show-diagnostics-sidebar";
const CUSTOM_EVENT_NAME = "groove:about-groove-settings-updated";

describe("isAlwaysShowDiagnosticsSidebarEnabled", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns false when nothing is stored", () => {
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(false);
  });

  it("returns true when stored value is 'true'", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(true);
  });

  it("returns false when stored value is 'false'", () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(false);
  });

  it("returns false for arbitrary stored value", () => {
    window.localStorage.setItem(STORAGE_KEY, "yes");
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(false);
  });

  it("returns false when localStorage throws", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(isAlwaysShowDiagnosticsSidebarEnabled()).toBe(false);
    getItemSpy.mockRestore();
  });
});

describe("setAlwaysShowDiagnosticsSidebarEnabled", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores 'true' and dispatches custom event when enabling", () => {
    const listener = vi.fn();
    window.addEventListener(CUSTOM_EVENT_NAME, listener);

    setAlwaysShowDiagnosticsSidebarEnabled(true);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CUSTOM_EVENT_NAME, listener);
  });

  it("stores 'false' and dispatches custom event when disabling", () => {
    const listener = vi.fn();
    window.addEventListener(CUSTOM_EVENT_NAME, listener);

    setAlwaysShowDiagnosticsSidebarEnabled(false);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CUSTOM_EVENT_NAME, listener);
  });

  it("does not throw and does not dispatch event when localStorage throws", () => {
    const listener = vi.fn();
    window.addEventListener(CUSTOM_EVENT_NAME, listener);

    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    expect(() => setAlwaysShowDiagnosticsSidebarEnabled(true)).not.toThrow();
    expect(listener).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
    window.removeEventListener(CUSTOM_EVENT_NAME, listener);
  });
});

describe("subscribeToAboutGrooveSettings", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("fires callback on storage events for the correct key", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToAboutGrooveSettings(callback);

    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("does not fire callback on storage events for other keys", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToAboutGrooveSettings(callback);

    window.dispatchEvent(new StorageEvent("storage", { key: "other-key" }));
    expect(callback).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("fires callback on custom settings-updated event", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToAboutGrooveSettings(callback);

    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME));
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("stops firing after unsubscribe is called", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToAboutGrooveSettings(callback);
    unsubscribe();

    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_NAME));

    expect(callback).not.toHaveBeenCalled();
  });

  it("fires callback when setAlwaysShowDiagnosticsSidebarEnabled is called", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToAboutGrooveSettings(callback);

    setAlwaysShowDiagnosticsSidebarEnabled(true);
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
