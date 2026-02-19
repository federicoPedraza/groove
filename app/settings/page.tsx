"use client";

import { useEffect, useState } from "react";

import { AppNavigation } from "@/components/app-navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { workspaceGetActive, type WorkspaceContextResponse } from "@/src/lib/ipc";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
};


function describeWorkspaceContextError(result: WorkspaceContextResponse): string {
  if (result.error && result.error.trim().length > 0) {
    return result.error;
  }
  return "Failed to load the active workspace context.";
}

export default function SettingsPage() {
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [workspaceRootName, setWorkspaceRootName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await workspaceGetActive();
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setWorkspaceMeta(null);
          setWorkspaceRootName(null);
          setErrorMessage(describeWorkspaceContextError(result));
          return;
        }

        if (!result.workspaceMeta) {
          setWorkspaceMeta(null);
          setWorkspaceRootName(null);
          return;
        }

        const rootName = result.workspaceMeta.rootName;

        setWorkspaceMeta(result.workspaceMeta);
        setWorkspaceRootName(rootName);
      } catch {
        if (!cancelled) {
          setWorkspaceMeta(null);
          setWorkspaceRootName(null);
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

  return (
    <main className="min-h-screen w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl gap-4">
        <AppNavigation />

        <div className="min-w-0 flex-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>
                Workspace options are now inferred from the active workspace selection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Loading active workspace...
                </p>
              )}

              {!isLoading && workspaceRootName === null && (
                <p className="rounded-md border border-amber-700/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
                  No active workspace selected. Open Dashboard and select a directory.
                </p>
              )}

              {workspaceRootName && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Active workspace: <span className="font-medium text-foreground">{workspaceRootName}</span>
                </p>
              )}

              {workspaceMeta && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Metadata version: <span className="font-medium text-foreground">{String(workspaceMeta.version)}</span>
                </p>
              )}

              {errorMessage && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
