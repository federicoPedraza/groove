"use client";

import { createContext, useContext, useEffect } from "react";

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

  const {
    isVisible,
    isBusy,
    statusMessage,
    errorMessage,
    onSelectDirectory,
    onOpenRecentDirectory,
  } = noDirectoryOpenState ?? {};

  useEffect(() => {
    const nextNoDirectoryOpenState =
      typeof isVisible === "boolean" &&
      typeof isBusy === "boolean" &&
      typeof onSelectDirectory === "function" &&
      typeof onOpenRecentDirectory === "function"
        ? {
            isVisible,
            isBusy,
            statusMessage: statusMessage ?? null,
            errorMessage: errorMessage ?? null,
            onSelectDirectory,
            onOpenRecentDirectory,
          }
        : undefined;

    context.setOptions({ pageSidebar, noDirectoryOpenState: nextNoDirectoryOpenState });

    return () => {
      context.setOptions(EMPTY_OPTIONS);
    };
  }, [context, pageSidebar, isVisible, isBusy, statusMessage, errorMessage, onSelectDirectory, onOpenRecentDirectory]);
}
