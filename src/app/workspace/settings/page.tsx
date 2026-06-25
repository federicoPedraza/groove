"use client";

import { useCallback, useEffect, useState } from "react";

import { CommandsSettingsForm } from "@/src/components/pages/settings/commands-settings-form";
import { WorktreeSymlinkPathsModal } from "@/src/components/pages/settings/worktree-symlink-paths-modal";
import { DoctrineSection } from "@/src/components/pages/intelligence/doctrine-section";
import { DoctrineTable } from "@/src/components/pages/intelligence/doctrine-table";
import { PageHeader } from "@/src/components/pages/page-header";
import type { WorkspaceMeta } from "@/src/components/pages/settings/types";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  GROOVE_PLAY_COMMAND_SENTINEL,
  workspaceGetActive,
  workspaceUpdateCommandsSettings,
  workspaceUpdateRootDirectory,
  workspaceUpdateWorktreeSymlinkPaths,
  type WorkspaceCommandSettingsPayload,
} from "@/src/lib/ipc";
import { describeWorkspaceContextError } from "@/src/lib/utils/workspace/context";
import { ensureWorkspaceContext } from "@/src/lib/workspace-store";

function loadWorkspaceGetActive(): Promise<
  Awaited<ReturnType<typeof workspaceGetActive>>
> {
  return ensureWorkspaceContext();
}

export default function WorkspaceSettingsPage() {
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(
    null,
  );
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playGrooveCommand, setPlayGrooveCommand] = useState(
    GROOVE_PLAY_COMMAND_SENTINEL,
  );
  const [openTerminalAtWorktreeCommand, setOpenTerminalAtWorktreeCommand] =
    useState("");
  const [worktreeSymlinkPaths, setWorktreeSymlinkPaths] = useState<string[]>(
    [],
  );
  const [rootDirectoryInput, setRootDirectoryInput] = useState("");
  const [isRootDirectorySaving, setIsRootDirectorySaving] = useState(false);
  const [rootDirectoryMessage, setRootDirectoryMessage] = useState<
    string | null
  >(null);
  const [rootDirectoryMessageType, setRootDirectoryMessageType] = useState<
    "success" | "error" | null
  >(null);
  const [isWorktreeSymlinkModalOpen, setIsWorktreeSymlinkModalOpen] =
    useState(false);
  const [isWorktreeSymlinkSaving, setIsWorktreeSymlinkSaving] = useState(false);
  const [worktreeSymlinkMessage, setWorktreeSymlinkMessage] = useState<
    string | null
  >(null);
  const [worktreeSymlinkMessageType, setWorktreeSymlinkMessageType] = useState<
    "success" | "error" | null
  >(null);

  const onSaveRootDirectory = useCallback(async () => {
    if (!workspaceMeta) {
      setRootDirectoryMessage(
        "Connect a repository before changing the scope directory.",
      );
      setRootDirectoryMessageType("error");
      return;
    }
    setIsRootDirectorySaving(true);
    setRootDirectoryMessage(null);
    setRootDirectoryMessageType(null);
    try {
      const trimmed = rootDirectoryInput.trim();
      const result = await workspaceUpdateRootDirectory({
        rootDirectory: trimmed.length === 0 ? null : trimmed,
      });
      if (!result.ok || !result.workspaceMeta) {
        setRootDirectoryMessage(
          result.error ?? "Failed to update scope directory.",
        );
        setRootDirectoryMessageType("error");
        return;
      }
      setWorkspaceMeta(result.workspaceMeta);
      setRootDirectoryInput(result.workspaceMeta.rootDirectory ?? "");
      setRootDirectoryMessage(
        result.workspaceMeta.rootDirectory
          ? `Scope directory set to "${result.workspaceMeta.rootDirectory}".`
          : "Scope directory cleared.",
      );
      setRootDirectoryMessageType("success");
    } catch {
      setRootDirectoryMessage("Failed to update scope directory.");
      setRootDirectoryMessageType("error");
    } finally {
      setIsRootDirectorySaving(false);
    }
  }, [rootDirectoryInput, workspaceMeta]);

  const onSaveCommandSettings = useCallback(
    async (payload: WorkspaceCommandSettingsPayload) => {
      if (!workspaceMeta) {
        return {
          ok: false,
          error: "Select an active workspace before saving command settings.",
        };
      }

      try {
        const result = await workspaceUpdateCommandsSettings({
          playGrooveCommand: payload.playGrooveCommand,
          openTerminalAtWorktreeCommand:
            payload.openTerminalAtWorktreeCommand ?? null,
        });

        if (!result.ok || !result.workspaceMeta) {
          return {
            ok: false,
            error: result.error ?? "Failed to save command settings.",
          };
        }

        const savedPlayGrooveCommand =
          result.workspaceMeta.playGrooveCommand ?? GROOVE_PLAY_COMMAND_SENTINEL;
        const savedOpenTerminalAtWorktreeCommand =
          result.workspaceMeta.openTerminalAtWorktreeCommand ?? "";

        setWorkspaceMeta(result.workspaceMeta);
        setPlayGrooveCommand(savedPlayGrooveCommand);
        setOpenTerminalAtWorktreeCommand(savedOpenTerminalAtWorktreeCommand);
        setWorktreeSymlinkPaths(result.workspaceMeta.worktreeSymlinkPaths ?? []);
        return {
          ok: true,
          payload: {
            playGrooveCommand: savedPlayGrooveCommand,
            openTerminalAtWorktreeCommand: savedOpenTerminalAtWorktreeCommand,
          },
        };
      } catch {
        return {
          ok: false,
          error: "Failed to save command settings.",
        };
      }
    },
    [workspaceMeta],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await loadWorkspaceGetActive();
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setErrorMessage(
            describeWorkspaceContextError(
              result,
              "Failed to load the active workspace context.",
            ),
          );
          return;
        }

        if (!result.workspaceMeta) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setPlayGrooveCommand(GROOVE_PLAY_COMMAND_SENTINEL);
          setOpenTerminalAtWorktreeCommand("");
          setWorktreeSymlinkPaths([]);
          setRootDirectoryInput("");
          return;
        }

        setWorkspaceMeta(result.workspaceMeta);
        setWorkspaceRoot(result.workspaceRoot ?? null);
        setPlayGrooveCommand(
          result.workspaceMeta.playGrooveCommand ?? GROOVE_PLAY_COMMAND_SENTINEL,
        );
        setOpenTerminalAtWorktreeCommand(
          result.workspaceMeta.openTerminalAtWorktreeCommand ?? "",
        );
        setWorktreeSymlinkPaths(result.workspaceMeta.worktreeSymlinkPaths ?? []);
        setRootDirectoryInput(result.workspaceMeta.rootDirectory ?? "");
      } catch {
        if (!cancelled) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setPlayGrooveCommand(GROOVE_PLAY_COMMAND_SENTINEL);
          setOpenTerminalAtWorktreeCommand("");
          setWorktreeSymlinkPaths([]);
          setErrorMessage("Failed to load the active workspace context.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onApplyWorktreeSymlinkPaths = useCallback(
    async (paths: string[]) => {
      if (!workspaceMeta) {
        setWorktreeSymlinkMessageType("error");
        setWorktreeSymlinkMessage(
          "Connect a repository before editing worktree symlink paths.",
        );
        return;
      }

      setIsWorktreeSymlinkSaving(true);
      setWorktreeSymlinkMessage(null);
      setWorktreeSymlinkMessageType(null);

      try {
        const response = await workspaceUpdateWorktreeSymlinkPaths({
          worktreeSymlinkPaths: paths,
        });
        if (!response.ok || !response.workspaceMeta) {
          setWorktreeSymlinkMessageType("error");
          setWorktreeSymlinkMessage(
            response.error ?? "Failed to save worktree symlink paths.",
          );
          return;
        }

        setWorkspaceMeta(response.workspaceMeta);
        setWorktreeSymlinkPaths(
          response.workspaceMeta.worktreeSymlinkPaths ?? [],
        );
        setIsWorktreeSymlinkModalOpen(false);
        setWorktreeSymlinkMessageType("success");
        setWorktreeSymlinkMessage("Worktree symlink paths updated.");
      } catch {
        setWorktreeSymlinkMessageType("error");
        setWorktreeSymlinkMessage("Failed to save worktree symlink paths.");
      } finally {
        setIsWorktreeSymlinkSaving(false);
      }
    },
    [workspaceMeta],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Workspace settings"
        description="Configure commands and paths for the active workspace."
      />

      {isLoading && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Loading active workspace...
        </p>
      )}

        <Card className="py-4">
          <CardContent className="space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">
                  Worktrees Directory
                </h3>
                <p className="text-xs text-muted-foreground">
                  Optional path (relative to the workspace root) where Groove
                  should create and look for <code>.worktrees/</code>. Leave
                  blank to operate at the workspace root. Useful when you open a
                  monorepo root in Groove but want to scope worktrees to a
                  sub-app like <code>apps/next</code>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={rootDirectoryInput}
                    onChange={(event) =>
                      setRootDirectoryInput(event.target.value)
                    }
                    placeholder="path/to/subdirectory"
                    disabled={!workspaceMeta || isRootDirectorySaving}
                    className="max-w-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void onSaveRootDirectory();
                    }}
                    disabled={!workspaceMeta || isRootDirectorySaving}
                  >
                    {isRootDirectorySaving ? "Saving..." : "Save"}
                  </Button>
                  {workspaceMeta?.rootDirectory && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRootDirectoryInput("");
                        void onSaveRootDirectory();
                      }}
                      disabled={isRootDirectorySaving}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {!workspaceMeta && (
                  <p className="text-xs text-muted-foreground">
                    Connect a repository to configure the scope directory.
                  </p>
                )}
                {rootDirectoryMessage &&
                  rootDirectoryMessageType === "success" && (
                    <p className="text-xs text-green-800">
                      {rootDirectoryMessage}
                    </p>
                  )}
                {rootDirectoryMessage && rootDirectoryMessageType === "error" && (
                  <p className="text-xs text-destructive">
                    {rootDirectoryMessage}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Commands</h3>
                <CommandsSettingsForm
                  playGrooveCommand={playGrooveCommand}
                  openTerminalAtWorktreeCommand={openTerminalAtWorktreeCommand}
                  section="commands"
                  disabled={!workspaceMeta}
                  disabledMessage={
                    !workspaceMeta
                      ? "Connect a repository to edit workspace command settings."
                      : undefined
                  }
                  onSave={onSaveCommandSettings}
                />
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    Worktree symlinked paths
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!workspaceMeta || isWorktreeSymlinkSaving}
                    onClick={() => {
                      setWorktreeSymlinkMessage(null);
                      setWorktreeSymlinkMessageType(null);
                      setIsWorktreeSymlinkModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Groove symlinks these paths into worktrees when they exist in
                  the repository root.
                </p>

                <ul className="space-y-1 text-sm text-foreground">
                  {worktreeSymlinkPaths.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                  {worktreeSymlinkPaths.length === 0 && (
                    <li className="text-muted-foreground">
                      No configured paths.
                    </li>
                  )}
                </ul>

                {!workspaceMeta && (
                  <p className="text-xs text-muted-foreground">
                    Connect a repository to edit this list.
                  </p>
                )}
                {worktreeSymlinkMessage &&
                  worktreeSymlinkMessageType === "success" && (
                    <p className="text-xs text-green-800">
                      {worktreeSymlinkMessage}
                    </p>
                  )}
                {worktreeSymlinkMessage &&
                  worktreeSymlinkMessageType === "error" && (
                    <p className="text-xs text-destructive">
                      {worktreeSymlinkMessage}
                    </p>
                  )}
              </section>
          </CardContent>
        </Card>

      <DoctrineSection />
      <DoctrineTable />

      <WorktreeSymlinkPathsModal
        open={isWorktreeSymlinkModalOpen}
        workspaceRoot={workspaceRoot}
        selectedPaths={worktreeSymlinkPaths}
        savePending={isWorktreeSymlinkSaving}
        onApply={onApplyWorktreeSymlinkPaths}
        onOpenChange={(open) => {
          if (!isWorktreeSymlinkSaving) {
            setIsWorktreeSymlinkModalOpen(open);
          }
        }}
      />

      {errorMessage && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
