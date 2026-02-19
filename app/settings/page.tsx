"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { AppNavigation } from "@/components/app-navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  workspaceGetActive,
  workspaceUpdateTerminalSettings,
  type DefaultTerminal,
  type WorkspaceContextResponse,
} from "@/src/lib/ipc";

type WorkspaceMeta = {
  version: number;
  rootName: string;
  createdAt: string;
  updatedAt: string;
  defaultTerminal?: DefaultTerminal;
  terminalCustomCommand?: string | null;
};

const SUPPORTED_TERMINAL_OPTIONS: Array<{ value: DefaultTerminal; label: string }> = [
  { value: "auto", label: "Auto (recommended)" },
  { value: "ghostty", label: "Ghostty" },
  { value: "warp", label: "Warp" },
  { value: "kitty", label: "Kitty" },
  { value: "gnome", label: "GNOME Terminal" },
  { value: "xterm", label: "xterm" },
  { value: "none", label: "None" },
  { value: "custom", label: "Custom command" },
];


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
  const [defaultTerminal, setDefaultTerminal] = useState<DefaultTerminal>("auto");
  const [terminalCustomCommand, setTerminalCustomCommand] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
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

  const customCommandEnabled = defaultTerminal === "custom";

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

              {workspaceMeta && (
                <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
                  <div className="space-y-1">
                    <label htmlFor="default-terminal" className="text-sm font-medium text-foreground">
                      Default terminal
                    </label>
                    <select
                      id="default-terminal"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      value={defaultTerminal}
                      onChange={(event) => {
                        setDefaultTerminal(event.target.value as DefaultTerminal);
                        setSaveState("idle");
                        setSaveMessage(null);
                      }}
                      disabled={saveState === "saving"}
                    >
                      {SUPPORTED_TERMINAL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="terminal-custom-command" className="text-sm font-medium text-foreground">
                      Custom command fallback
                    </label>
                    <Input
                      id="terminal-custom-command"
                      value={terminalCustomCommand}
                      onChange={(event) => {
                        setTerminalCustomCommand(event.target.value);
                        setSaveState("idle");
                        setSaveMessage(null);
                      }}
                      placeholder="Example: ghostty --working-directory {worktree}"
                      disabled={saveState === "saving" || !customCommandEnabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Used when default terminal is set to Custom command. Supports <code>{"{worktree}"}</code> and <code>GROOVE_WORKTREE</code>.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => void onSave()} disabled={saveState === "saving"}>
                      {saveState === "saving" && <Loader2 className="size-4 animate-spin" />}
                      Save
                    </Button>
                    {saveState === "success" && saveMessage && (
                      <span className="text-sm text-green-800">{saveMessage}</span>
                    )}
                    {saveState === "error" && saveMessage && (
                      <span className="text-sm text-destructive">{saveMessage}</span>
                    )}
                  </div>
                </div>
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
