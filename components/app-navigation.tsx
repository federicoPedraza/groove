"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, LayoutDashboard, PanelLeft, Settings } from "lucide-react";
import { useState } from "react";

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
  sidebarMenuButtonClassName,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AppNavigationProps = {
  showSettingsWarning: boolean;
};

function AppNavigation({ showSettingsWarning }: AppNavigationProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const isDashboardActive = pathname === "/";
  const isSettingsActive = pathname === "/settings";

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
                href="/"
                className={sidebarMenuButtonClassName({
                  isActive: isDashboardActive,
                  collapsed: isSidebarCollapsed,
                })}
              >
                <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                {!isSidebarCollapsed && <span>Dashboard</span>}
              </Link>
              <Link
                href="/settings"
                className={cn(
                  "relative",
                  sidebarMenuButtonClassName({
                    isActive: isSettingsActive,
                    collapsed: isSidebarCollapsed,
                  }),
                )}
              >
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                {!isSidebarCollapsed && <span>Settings</span>}
                {showSettingsWarning && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "inline-flex text-amber-600",
                          isSidebarCollapsed
                            ? "absolute right-1.5 top-1.5"
                            : "ml-auto",
                        )}
                        role="img"
                        aria-label="Workspace root override not set"
                      >
                        <AlertTriangle aria-hidden="true" className="size-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Workspace root override not set</TooltipContent>
                  </Tooltip>
                )}
              </Link>
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
                href="/"
                className={sidebarMenuButtonClassName({ isActive: isDashboardActive })}
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                }}
              >
                <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/settings"
                className={sidebarMenuButtonClassName({ isActive: isSettingsActive })}
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                }}
              >
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                <span>Settings</span>
                {showSettingsWarning && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-auto inline-flex text-amber-600" role="img" aria-label="Workspace root override not set">
                        <AlertTriangle aria-hidden="true" className="size-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Workspace root override not set</TooltipContent>
                  </Tooltip>
                )}
              </Link>
            </SidebarMenu>
          </TooltipProvider>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

export { AppNavigation };
