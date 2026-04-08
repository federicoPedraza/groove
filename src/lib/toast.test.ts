import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDismiss, mockSuccess, mockError, mockSonnerToast } = vi.hoisted(() => {
  const mockDismiss = vi.fn();
  const mockSuccess = vi.fn(() => "success-id");
  const mockError = vi.fn(() => "error-id");
  const mockSonnerToast = Object.assign(vi.fn(() => "toast-id"), {
    success: mockSuccess,
    error: mockError,
    dismiss: mockDismiss,
  });
  return { mockDismiss, mockSuccess, mockError, mockSonnerToast };
});

vi.mock("sonner", () => ({
  toast: mockSonnerToast,
}));

import {
  setIsCommandHistoryPanelOpen,
} from "@/src/lib/command-history-panel-state";

import { toast } from "@/src/lib/toast";

beforeEach(() => {
  vi.clearAllMocks();
  setIsCommandHistoryPanelOpen(false);
});

describe("toast proxy", () => {
  it("passes through direct calls when panel is closed", () => {
    toast("Hello");
    expect(mockSonnerToast).toHaveBeenCalledWith("Hello");
  });

  it("suppresses direct calls when panel is open", () => {
    setIsCommandHistoryPanelOpen(true);
    const result = toast("Hello");
    expect(mockSonnerToast).not.toHaveBeenCalled();
    expect(result).toBe("");
  });

  it("passes through method calls (success) when panel is closed", () => {
    toast.success("Worked");
    expect(mockSuccess).toHaveBeenCalledWith("Worked");
  });

  it("suppresses method calls (success) when panel is open", () => {
    setIsCommandHistoryPanelOpen(true);
    const result = toast.success("Worked");
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(result).toBe("");
  });

  it("suppresses method calls (error) when panel is open", () => {
    setIsCommandHistoryPanelOpen(true);
    const result = toast.error("Failed");
    expect(mockError).not.toHaveBeenCalled();
    expect(result).toBe("");
  });

  it("always passes through dismiss method", () => {
    setIsCommandHistoryPanelOpen(true);
    toast.dismiss("some-id");
    expect(mockDismiss).toHaveBeenCalledWith("some-id");
  });

  it("returns non-function properties as-is", () => {
    const description = (toast as unknown as Record<string, unknown>)["nonExistentProp"];
    expect(description).toBeUndefined();
  });
});
