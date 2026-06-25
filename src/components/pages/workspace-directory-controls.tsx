"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Folder, FolderOpen, Settings2, Terminal, X } from "lucide-react";

import { ConfirmModal } from "@/src/components/ui/confirm-modal";
import { Button } from "@/src/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useGrooveBusiness } from "@/src/lib/groove-business";
import {
  workspaceClearActive,
  workspacePickAndOpen,
} from "@/src/lib/ipc";
import { toast } from "@/src/lib/toast";
import {
  clearWorkspaceContextStore,
  getWorkspaceContextStoreSnapshot,
  publishWorkspaceContext,
  subscribeToWorkspaceContextStore,
} from "@/src/lib/workspace-store";

const RECENT_DIRECTORIES_STORAGE_KEY = "groove:recent-directories";
const MAX_RECENT_DIRECTORIES = 5;

function getDirectoryNameFromPath(path: string): string | null {
  const segments = path
    .trim()
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? null;
}

function readStoredRecentDirectories(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_DIRECTORIES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return normalized
      .filter((value, index) => normalized.indexOf(value) === index)
      .slice(0, MAX_RECENT_DIRECTORIES);
  } catch {
    return [];
  }
}

function persistRecentDirectory(path: string): string[] {
  const normalizedPath = path.trim();
  const next = [
    normalizedPath,
    ...readStoredRecentDirectories().filter((value) => value !== normalizedPath),
  ]
    .filter((value) => value.length > 0)
    .slice(0, MAX_RECENT_DIRECTORIES);
  try {
    window.localStorage.setItem(
      RECENT_DIRECTORIES_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Ignore persistence failures — the in-memory list still updates.
  }
  return next;
}

type WorkspaceDirectoryControlsProps = {
  collapsed: boolean;
};

/**
 * Workspace directory controls (change directory, recent, close, terminal).
 * Rendered globally from the app sidebar so it is available on every page —
 * it owns its own workspace actions via the shared workspace store, and the
 * rest of the app re-syncs through the `workspace-ready` / `workspace-change`
 * events these commands emit.
 */
export function WorkspaceDirectoryControls({
  collapsed,
}: WorkspaceDirectoryControlsProps) {
  const grooveBusiness = useGrooveBusiness();
  const LandIcon = grooveBusiness.Icon("land");
  const landLabel = grooveBusiness.label("land");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isWorkspaceSettingsActive = pathname === "/workspace/settings";
  const isTerminalActive = pathname === "/intelligence";

  const snapshot = useSyncExternalStore(
    subscribeToWorkspaceContextStore,
    getWorkspaceContextStoreSnapshot,
    getWorkspaceContextStoreSnapshot,
  );
  const context = snapshot.context;
  const workspaceMeta = context?.workspaceMeta ?? null;
  const workspaceRoot = context?.workspaceRoot ?? null;
  const hasDirectory = Boolean(workspaceMeta);
  const workspaceDisplayName =
    workspaceMeta?.rootName?.trim() ||
    (workspaceRoot ? getDirectoryNameFromPath(workspaceRoot) : null) ||
    "Workspace";

  const [isBusy, setIsBusy] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);

  const pickDirectory = useCallback(async (): Promise<void> => {
    try {
      setIsBusy(true);
      const result = await workspacePickAndOpen();
      if (result.cancelled) {
        return;
      }
      if (!result.ok) {
        toast.error(result.error ?? "Unable to open the selected directory.");
        return;
      }
      publishWorkspaceContext(result);
      if (result.workspaceRoot) {
        persistRecentDirectory(result.workspaceRoot);
      }
    } catch {
      toast.error("Unable to pick a workspace directory.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const closeWorkspace = useCallback(async (): Promise<void> => {
    try {
      setIsBusy(true);
      const result = await workspaceClearActive();
      if (!result.ok) {
        toast.error(result.error ?? "Failed to close the current workspace.");
        return;
      }
      clearWorkspaceContextStore();
      toast.success("Current workspace closed.", {
        command: "workspace_clear_active",
      });
    } catch {
      toast.error("Failed to close the current workspace.");
    } finally {
      setIsBusy(false);
      setIsCloseConfirmOpen(false);
    }
  }, []);

  return (
    <>
      <Sidebar collapsed={collapsed}>
        <SidebarHeader>
          {collapsed ? (
            <div className="flex justify-center">
              <LandIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </div>
          ) : (
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span>{landLabel}</span>
            </h2>
          )}
        </SidebarHeader>
        <SidebarContent className="space-y-3">
          <TooltipProvider>
            <div
              className={
                collapsed
                  ? "flex flex-col items-center gap-1"
                  : "flex items-center gap-1"
              }
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void pickDirectory();
                    }}
                    disabled={isBusy}
                    className={
                      collapsed
                        ? "group h-8 w-8 px-0"
                        : "group h-8 min-w-0 flex-1 justify-start"
                    }
                    aria-label="Change directory"
                  >
                    <Folder
                      aria-hidden="true"
                      className="size-4 group-hover:hidden group-active:hidden group-focus-visible:hidden"
                    />
                    <FolderOpen
                      aria-hidden="true"
                      className="hidden size-4 group-hover:block group-active:block group-focus-visible:block"
                    />
                    {!collapsed && (
                      <span className="truncate">{workspaceDisplayName}</span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Change directory</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={isWorkspaceSettingsActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      navigate("/workspace/settings");
                    }}
                    aria-pressed={isWorkspaceSettingsActive}
                    className="h-8 w-8 px-0"
                    aria-label="Workspace settings"
                  >
                    <Settings2 aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Workspace settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={isTerminalActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      navigate("/intelligence");
                    }}
                    disabled={isBusy || !hasDirectory}
                    aria-pressed={isTerminalActive}
                    className="h-8 w-8 px-0"
                    aria-label="Open terminal"
                  >
                    <Terminal aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open terminal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCloseConfirmOpen(true);
                    }}
                    disabled={isBusy || !hasDirectory}
                    className="h-8 w-8 px-0"
                    aria-label="Close directory"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close directory</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </SidebarContent>
      </Sidebar>
      <ConfirmModal
        open={isCloseConfirmOpen}
        title="Close current workspace?"
        description="This clears the active workspace in desktop storage until you select a directory again."
        confirmLabel="Close workspace"
        cancelLabel="Keep workspace open"
        loading={isBusy}
        onConfirm={() => {
          void closeWorkspace();
        }}
        onCancel={() => {
          setIsCloseConfirmOpen(false);
        }}
        onOpenChange={setIsCloseConfirmOpen}
      />
    </>
  );
}
