"use client";

import { Link, useLocation } from "react-router-dom";
import { ActivitySquare, CircleHelp, LayoutDashboard, PanelLeft, Settings } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  sidebarMenuButtonClassName,
} from "@/components/ui/sidebar";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isTelemetryEnabled } from "@/src/lib/ipc";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";
const NAVIGATION_START_MARKER_KEY = "__grooveNavigationTelemetryStart";

type NavigationStartMarker = {
  from: string;
  to: string;
  startedAtUnixMs: number;
  startedAtPerfMs: number;
};

function setNavigationStartMarker(marker: NavigationStartMarker): void {
  (window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker })[NAVIGATION_START_MARKER_KEY] = marker;
}

function clearNavigationStartMarker(): void {
  delete (window as Window & { [NAVIGATION_START_MARKER_KEY]?: NavigationStartMarker })[NAVIGATION_START_MARKER_KEY];
}

type AppNavigationProps = {
  isHelpOpen: boolean;
  onHelpClick: () => void;
};

function AppNavigation({ isHelpOpen, onHelpClick }: AppNavigationProps) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const isDashboardActive = pathname === "/";
  const isDiagnosticsActive = pathname === "/diagnostics";
  const isSettingsActive = pathname === "/settings";
  const isHelpActive = isHelpOpen;

  const recordNavigationStart = useCallback(
    (to: string) => {
      if (to === pathname) {
        clearNavigationStartMarker();
        return;
      }
      const startedAtUnixMs = Date.now();
      const startedAtPerfMs = performance.now();
      setNavigationStartMarker({
        from: pathname,
        to,
        startedAtUnixMs,
        startedAtPerfMs,
      });
      if (isTelemetryEnabled()) {
        console.info(`${UI_TELEMETRY_PREFIX} navigation.start`, {
          from: pathname,
          to,
          timestamp_ms: startedAtUnixMs,
        });
      }
    },
    [pathname],
  );

  return (
    <>
      <Sidebar collapsed={isSidebarCollapsed}>
        <SidebarHeader className="flex items-center justify-between gap-2">
          {!isSidebarCollapsed && (
            <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Groove
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              setIsSidebarCollapsed((current) => !current);
            }}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft aria-hidden="true" className="size-4" />
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <TooltipProvider>
            <SidebarMenu>
              <Link
                to="/"
                className={sidebarMenuButtonClassName({
                  isActive: isDashboardActive,
                  collapsed: isSidebarCollapsed,
                })}
                onClick={() => {
                  recordNavigationStart("/");
                }}
              >
                <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                {!isSidebarCollapsed && <span>Dashboard</span>}
              </Link>
              <Link
                to="/diagnostics"
                className={cn(
                  "relative",
                  sidebarMenuButtonClassName({
                    isActive: isDiagnosticsActive,
                    collapsed: isSidebarCollapsed,
                  }),
                )}
                onClick={() => {
                  recordNavigationStart("/diagnostics");
                }}
              >
                <ActivitySquare aria-hidden="true" className="size-4 shrink-0" />
                {!isSidebarCollapsed && <span>Diagnostics</span>}
              </Link>
              <Link
                to="/settings"
                className={cn(
                  "relative",
                  sidebarMenuButtonClassName({
                    isActive: isSettingsActive,
                    collapsed: isSidebarCollapsed,
                  }),
                )}
                onClick={() => {
                  recordNavigationStart("/settings");
                }}
              >
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                {!isSidebarCollapsed && <span>Settings</span>}
              </Link>
              <SidebarMenuButton
                type="button"
                className={cn("relative")}
                isActive={isHelpActive}
                collapsed={isSidebarCollapsed}
                onClick={onHelpClick}
              >
                <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
                {!isSidebarCollapsed && <span>Help</span>}
              </SidebarMenuButton>
            </SidebarMenu>
          </TooltipProvider>
        </SidebarContent>
      </Sidebar>

      <Collapsible
        open={isMobileSidebarOpen}
        onOpenChange={setIsMobileSidebarOpen}
        className="rounded-xl border bg-card p-2 md:hidden"
      >
        <CollapsibleTrigger className="inline-flex h-9 w-full items-center justify-start gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none">
          <PanelLeft aria-hidden="true" className="size-4" />
          <span>Navigation</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <TooltipProvider>
            <SidebarMenu>
              <Link
                to="/"
                className={sidebarMenuButtonClassName({ isActive: isDashboardActive })}
                onClick={() => {
                  recordNavigationStart("/");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/diagnostics"
                className={sidebarMenuButtonClassName({ isActive: isDiagnosticsActive })}
                onClick={() => {
                  recordNavigationStart("/diagnostics");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <ActivitySquare aria-hidden="true" className="size-4 shrink-0" />
                <span>Diagnostics</span>
              </Link>
              <Link
                to="/settings"
                className={sidebarMenuButtonClassName({ isActive: isSettingsActive })}
                onClick={() => {
                  recordNavigationStart("/settings");
                  setIsMobileSidebarOpen(false);
                }}
              >
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                <span>Settings</span>
              </Link>
              <SidebarMenuButton
                type="button"
                isActive={isHelpActive}
                onClick={() => {
                  onHelpClick();
                  setIsMobileSidebarOpen(false);
                }}
              >
                <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
                <span>Help</span>
              </SidebarMenuButton>
            </SidebarMenu>
          </TooltipProvider>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

export { AppNavigation };
