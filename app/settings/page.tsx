"use client";

import { useEffect, useState } from "react";

import { PageShell } from "@/components/pages/page-shell";
import { TerminalSettingsForm } from "@/components/pages/settings/terminal-settings-form";
import type { SaveState, WorkspaceMeta } from "@/components/pages/settings/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  workspaceGetActive,
  workspaceUpdateTerminalSettings,
  type DefaultTerminal,
} from "@/src/lib/ipc";
import { describeWorkspaceContextError } from "@/lib/utils/workspace/context";

export default function SettingsPage() {
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [workspaceRootName, setWorkspaceRootName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [defaultTerminal, setDefaultTerminal] = useState<DefaultTerminal>("auto");
  const [terminalCustomCommand, setTerminalCustomCommand] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
          setErrorMessage(describeWorkspaceContextError(result, "Failed to load the active workspace context."));
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
        setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
        setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
        setSaveState("idle");
        setSaveMessage(null);
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

  const onSave = async (): Promise<void> => {
    if (!workspaceMeta) {
      setSaveState("error");
      setSaveMessage("Select an active workspace before saving terminal settings.");
      return;
    }

    const trimmedCommand = terminalCustomCommand.trim();
    if (defaultTerminal === "custom" && trimmedCommand.length === 0) {
      setSaveState("error");
      setSaveMessage("Custom command is required when terminal is set to Custom command.");
      return;
    }

    setSaveState("saving");
    setSaveMessage(null);

    try {
      const result = await workspaceUpdateTerminalSettings({
        defaultTerminal,
        terminalCustomCommand: trimmedCommand.length > 0 ? trimmedCommand : null,
      });

      if (!result.ok || !result.workspaceMeta) {
        setSaveState("error");
        setSaveMessage(result.error ?? "Failed to save terminal settings.");
        return;
      }

      setWorkspaceMeta(result.workspaceMeta);
      setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
      setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
      setSaveState("success");
      setSaveMessage("Terminal settings saved.");
    } catch {
      setSaveState("error");
      setSaveMessage("Failed to save terminal settings.");
    }
  };

  return (
    <PageShell>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Workspace options are now inferred from the active workspace selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Loading active workspace...</p>}

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

          {workspaceMeta && (
            <TerminalSettingsForm
              defaultTerminal={defaultTerminal}
              terminalCustomCommand={terminalCustomCommand}
              saveState={saveState}
              saveMessage={saveMessage}
              onDefaultTerminalChange={(value) => {
                setDefaultTerminal(value);
                setSaveState("idle");
                setSaveMessage(null);
              }}
              onTerminalCustomCommandChange={(value) => {
                setTerminalCustomCommand(value);
                setSaveState("idle");
                setSaveMessage(null);
              }}
              onSave={() => {
                void onSave();
              }}
            />
          )}

          {errorMessage && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
