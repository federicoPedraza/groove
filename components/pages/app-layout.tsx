"use client";

import { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";

import { PageShell, type PageShellProps } from "@/components/pages/page-shell";
import { AppLayoutContext, EMPTY_OPTIONS, type AppLayoutContextValue } from "@/components/pages/use-app-layout";

type AppLayoutOptions = Pick<PageShellProps, "pageSidebar" | "noDirectoryOpenState">;

export function AppLayout() {
  const [options, setOptions] = useState<AppLayoutOptions>(EMPTY_OPTIONS);

  const contextValue = useMemo<AppLayoutContextValue>(
    () => ({
      setOptions,
    }),
    [],
  );

  return (
    <AppLayoutContext.Provider value={contextValue}>
      <PageShell pageSidebar={options.pageSidebar} noDirectoryOpenState={options.noDirectoryOpenState}>
        <Outlet />
      </PageShell>
    </AppLayoutContext.Provider>
  );
}
