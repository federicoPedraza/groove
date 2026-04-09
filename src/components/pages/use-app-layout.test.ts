import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  AppLayoutContext,
  EMPTY_OPTIONS,
  useAppLayout,
  type AppLayoutContextValue,
} from "@/src/components/pages/use-app-layout";

function createWrapper(contextValue: AppLayoutContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      AppLayoutContext.Provider,
      { value: contextValue },
      children,
    );
  };
}

describe("EMPTY_OPTIONS", () => {
  it("is an empty object", () => {
    expect(EMPTY_OPTIONS).toEqual({});
  });
});

describe("useAppLayout", () => {
  it("throws when used outside AppLayout context", () => {
    expect(() => {
      renderHook(() => useAppLayout({}));
    }).toThrow("useAppLayout must be used within AppLayout");
  });

  it("calls setOptions with resolved pageSidebar when provided", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const pageSidebar = ({ collapsed }: { collapsed: boolean }) =>
      createElement("div", null, collapsed ? "collapsed" : "expanded");

    renderHook(() => useAppLayout({ pageSidebar }), { wrapper });

    expect(setOptions).toHaveBeenCalled();
    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    expect(typeof lastCall.pageSidebar).toBe("function");
  });

  it("calls setOptions without pageSidebar when not provided", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    renderHook(() => useAppLayout({}), { wrapper });

    expect(setOptions).toHaveBeenCalled();
    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    expect(lastCall.pageSidebar).toBeUndefined();
  });

  it("calls setOptions with noDirectoryOpenState when fully provided", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const noDirectoryOpenState = {
      isVisible: true,
      isBusy: false,
      statusMessage: "Loading...",
      errorMessage: null,
      onSelectDirectory: vi.fn(),
      onOpenRecentDirectory: vi.fn(),
    };

    renderHook(() => useAppLayout({ noDirectoryOpenState }), { wrapper });

    expect(setOptions).toHaveBeenCalled();
    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    expect(lastCall.noDirectoryOpenState).toBeDefined();
    expect(lastCall.noDirectoryOpenState.isVisible).toBe(true);
    expect(lastCall.noDirectoryOpenState.isBusy).toBe(false);
    expect(lastCall.noDirectoryOpenState.statusMessage).toBe("Loading...");
  });

  it("sets noDirectoryOpenState to undefined when required fields are missing", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const incompleteState = {
      isVisible: true,
      isBusy: false,
      statusMessage: null,
      errorMessage: null,
    };

    renderHook(
      () =>
        useAppLayout({
          noDirectoryOpenState: incompleteState as Parameters<
            typeof useAppLayout
          >[0]["noDirectoryOpenState"],
        }),
      { wrapper },
    );

    expect(setOptions).toHaveBeenCalled();
    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    expect(lastCall.noDirectoryOpenState).toBeUndefined();
  });

  it("resets options to EMPTY_OPTIONS on unmount", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const { unmount } = renderHook(() => useAppLayout({}), { wrapper });

    setOptions.mockClear();
    unmount();

    expect(setOptions).toHaveBeenCalledWith(EMPTY_OPTIONS);
  });

  it("calls pageSidebar render function with collapsed argument", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const pageSidebarFn = vi.fn(({ collapsed }: { collapsed: boolean }) =>
      createElement("div", null, collapsed ? "collapsed" : "expanded"),
    );

    renderHook(() => useAppLayout({ pageSidebar: pageSidebarFn }), { wrapper });

    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    const stablePageSidebar = lastCall.pageSidebar as (args: {
      collapsed: boolean;
    }) => unknown;

    stablePageSidebar({ collapsed: true });
    expect(pageSidebarFn).toHaveBeenCalledWith({ collapsed: true });

    stablePageSidebar({ collapsed: false });
    expect(pageSidebarFn).toHaveBeenCalledWith({ collapsed: false });
  });

  it("handles pageSidebar as a ReactNode instead of a function", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const pageSidebarNode = createElement("div", null, "static sidebar");

    renderHook(() => useAppLayout({ pageSidebar: pageSidebarNode }), {
      wrapper,
    });

    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    const stablePageSidebar = lastCall.pageSidebar as (args: {
      collapsed: boolean;
    }) => unknown;

    const result = stablePageSidebar({ collapsed: false });
    expect(result).toBe(pageSidebarNode);
  });

  it("defaults statusMessage and errorMessage to null when not provided in noDirectoryOpenState", () => {
    const setOptions = vi.fn();
    const wrapper = createWrapper({ setOptions });

    const noDirectoryOpenState = {
      isVisible: false,
      isBusy: false,
      statusMessage: null as string | null,
      errorMessage: null as string | null,
      onSelectDirectory: vi.fn(),
      onOpenRecentDirectory: vi.fn(),
    };

    renderHook(() => useAppLayout({ noDirectoryOpenState }), { wrapper });

    const lastCall = setOptions.mock.calls[setOptions.mock.calls.length - 1][0];
    expect(lastCall.noDirectoryOpenState.statusMessage).toBeNull();
    expect(lastCall.noDirectoryOpenState.errorMessage).toBeNull();
  });
});
