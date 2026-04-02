"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import type { PageShellProps } from "@/components/pages/page-shell";

export type AppLayoutOptions = Pick<PageShellProps, "pageSidebar" | "noDirectoryOpenState">;

export type AppLayoutContextValue = {
  setOptions: (options: AppLayoutOptions) => void;
};

export const EMPTY_OPTIONS: AppLayoutOptions = {};
export const AppLayoutContext = createContext<AppLayoutContextValue | null>(null);

export function useAppLayout(options: AppLayoutOptions): void {
  const context = useContext(AppLayoutContext);

  if (!context) {
    throw new Error("useAppLayout must be used within AppLayout");
  }

  const {
    pageSidebar,
    noDirectoryOpenState,
  } = options;
  const pageSidebarRef = useRef(pageSidebar);
  pageSidebarRef.current = pageSidebar;

  const stablePageSidebar = useCallback(({ collapsed }: { collapsed: boolean }) => {
    const currentPageSidebar = pageSidebarRef.current;
    return typeof currentPageSidebar === "function" ? currentPageSidebar({ collapsed }) : currentPageSidebar;
  }, []);

  const {
    isVisible,
    isBusy,
    statusMessage,
    errorMessage,
    onSelectDirectory,
    onOpenRecentDirectory,
  } = noDirectoryOpenState ?? {};

  const stableNoDirectoryOpenState = useMemo(() => {
    if (
      typeof isVisible !== "boolean" ||
      typeof isBusy !== "boolean" ||
      typeof onSelectDirectory !== "function" ||
      typeof onOpenRecentDirectory !== "function"
    ) {
      return undefined;
    }
    return {
      isVisible,
      isBusy,
      statusMessage: statusMessage ?? null,
      errorMessage: errorMessage ?? null,
      onSelectDirectory,
      onOpenRecentDirectory,
    };
  }, [isVisible, isBusy, statusMessage, errorMessage, onSelectDirectory, onOpenRecentDirectory]);

  useEffect(() => {
    const resolvedPageSidebar = pageSidebarRef.current ? stablePageSidebar : undefined;
    context.setOptions({ pageSidebar: resolvedPageSidebar, noDirectoryOpenState: stableNoDirectoryOpenState });
  }, [context, stablePageSidebar, stableNoDirectoryOpenState]);

  useEffect(() => {
    return () => {
      context.setOptions(EMPTY_OPTIONS);
    };
  }, [context]);
}
