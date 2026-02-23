"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Loader2 } from "lucide-react";

import { PageShell } from "@/components/pages/page-shell";
import { TerminalSettingsForm } from "@/components/pages/settings/terminal-settings-form";
import type { SaveState, WorkspaceMeta } from "@/components/pages/settings/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ghAuthStatus,
  ghDetectRepo,
  workspaceClearActive,
  workspaceGetActive,
  workspacePickAndOpen,
  workspaceUpdateTerminalSettings,
  type DefaultTerminal,
  type GhAuthStatusResponse,
  type GhDetectRepoResponse,
} from "@/src/lib/ipc";
import { describeWorkspaceContextError } from "@/lib/utils/workspace/context";

function normalizeHostnameCandidate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return undefined;
  }
  return trimmed.split(":")[0]?.trim() || undefined;
}

export default function SettingsPage() {
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [workspaceRootName, setWorkspaceRootName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionMessageType, setConnectionMessageType] = useState<"success" | "error" | null>(null);
  const [defaultTerminal, setDefaultTerminal] = useState<DefaultTerminal>("auto");
  const [terminalCustomCommand, setTerminalCustomCommand] = useState("");
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isGitHubCliLoading, setIsGitHubCliLoading] = useState(false);
  const [gitHubCliStatus, setGitHubCliStatus] = useState<GhAuthStatusResponse | null>(null);
  const [gitHubCliRepo, setGitHubCliRepo] = useState<GhDetectRepoResponse | null>(null);
  const [gitHubCliError, setGitHubCliError] = useState<string | null>(null);
  const [gitHubCliCheckedRoot, setGitHubCliCheckedRoot] = useState<string | null>(null);
  const gitHubCliRequestVersionRef = useRef(0);

  const loadGitHubCliStatus = useCallback(async (root: string | null): Promise<void> => {
    const requestVersion = ++gitHubCliRequestVersionRef.current;
    const isLatestRequest = (): boolean => gitHubCliRequestVersionRef.current === requestVersion;

    setGitHubCliCheckedRoot(root);
    setIsGitHubCliLoading(true);
    setGitHubCliError(null);
    setGitHubCliStatus(null);
    setGitHubCliRepo(null);
    try {
      if (!root) {
        return;
      }

      const detectedRepo = await ghDetectRepo({ path: root });
      if (!isLatestRequest()) {
        return;
      }
      setGitHubCliRepo(detectedRepo);

      const status = await ghAuthStatus({
        hostname: normalizeHostnameCandidate(detectedRepo.host),
        path: root,
        remoteUrl: detectedRepo.remoteUrl,
      });
      if (!isLatestRequest()) {
        return;
      }
      setGitHubCliStatus(status);
      if (!status.ok) {
        setGitHubCliError(status.error ?? "Failed to load GitHub CLI authentication status.");
      }
    } catch {
      if (!isLatestRequest()) {
        return;
      }
      setGitHubCliStatus(null);
      setGitHubCliRepo(null);
      setGitHubCliError("Failed to load GitHub CLI authentication status.");
    } finally {
      if (isLatestRequest()) {
        setIsGitHubCliLoading(false);
      }
    }
  }, []);

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
          setWorkspaceRoot(null);
          setWorkspaceRootName(null);
          setErrorMessage(describeWorkspaceContextError(result, "Failed to load the active workspace context."));
          return;
        }

        if (!result.workspaceMeta) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setWorkspaceRootName(null);
          setTelemetryEnabled(true);
          setGitHubCliStatus(null);
          setGitHubCliRepo(null);
          setGitHubCliError(null);
          setGitHubCliCheckedRoot(null);
          return;
        }

        const rootName = result.workspaceMeta.rootName;

        setWorkspaceMeta(result.workspaceMeta);
        setWorkspaceRoot(result.workspaceRoot ?? null);
        setWorkspaceRootName(rootName);
        setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
        setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
        setTelemetryEnabled(result.workspaceMeta.telemetryEnabled !== false);
        setSaveState("idle");
        setSaveMessage(null);
      } catch {
        if (!cancelled) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setWorkspaceRootName(null);
          setTelemetryEnabled(true);
          setErrorMessage("Failed to load the active workspace context.");
          setGitHubCliStatus(null);
          setGitHubCliRepo(null);
          setGitHubCliError(null);
          setGitHubCliCheckedRoot(null);
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
  }, [loadGitHubCliStatus]);

  useEffect(() => {
    if (!workspaceRoot || isGitHubCliLoading) {
      return;
    }
    if (gitHubCliCheckedRoot === workspaceRoot) {
      return;
    }
    void loadGitHubCliStatus(workspaceRoot);
  }, [gitHubCliCheckedRoot, isGitHubCliLoading, loadGitHubCliStatus, workspaceRoot]);

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
        telemetryEnabled,
      });

      if (!result.ok || !result.workspaceMeta) {
        setSaveState("error");
        setSaveMessage(result.error ?? "Failed to save terminal settings.");
        return;
      }

      setWorkspaceMeta(result.workspaceMeta);
      setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
      setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
      setTelemetryEnabled(result.workspaceMeta.telemetryEnabled !== false);
      setSaveState("success");
      setSaveMessage("Settings saved.");
    } catch {
      setSaveState("error");
      setSaveMessage("Failed to save terminal settings.");
    }
  };

  const onConnectRepository = async (): Promise<void> => {
    setIsConnecting(true);
    setConnectionMessage(null);
    setConnectionMessageType(null);
    setErrorMessage(null);

    try {
      const result = await workspacePickAndOpen();
      if (result.cancelled) {
        return;
      }

      if (!result.ok || !result.workspaceMeta) {
        setConnectionMessage(describeWorkspaceContextError(result, "Failed to connect repository."));
        setConnectionMessageType("error");
        return;
      }

      setWorkspaceMeta(result.workspaceMeta);
      setWorkspaceRoot(result.workspaceRoot ?? null);
      setWorkspaceRootName(result.workspaceMeta.rootName);
      setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
      setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
      setTelemetryEnabled(result.workspaceMeta.telemetryEnabled !== false);
      setSaveState("idle");
      setSaveMessage(null);
      setConnectionMessage(`Connected to repository: ${result.workspaceRoot ?? result.workspaceMeta.rootName}`);
      setConnectionMessageType("success");
      setGitHubCliCheckedRoot(null);
      void loadGitHubCliStatus(result.workspaceRoot ?? null);
    } catch {
      setConnectionMessage("Failed to connect repository.");
      setConnectionMessageType("error");
    } finally {
      setIsConnecting(false);
    }
  };

  const onDisconnectRepository = async (): Promise<void> => {
    setIsDisconnecting(true);
    setConnectionMessage(null);
    setConnectionMessageType(null);
    setErrorMessage(null);

    try {
      const result = await workspaceClearActive();
      if (!result.ok) {
        setConnectionMessage(result.error ?? "Failed to disconnect repository.");
        setConnectionMessageType("error");
        return;
      }

      setWorkspaceMeta(null);
      setWorkspaceRoot(null);
      setWorkspaceRootName(null);
      setDefaultTerminal("auto");
      setTerminalCustomCommand("");
      setTelemetryEnabled(true);
      setSaveState("idle");
      setSaveMessage(null);
      setConnectionMessage("Repository disconnected.");
      setConnectionMessageType("success");
      setGitHubCliStatus(null);
      setGitHubCliRepo(null);
      setGitHubCliError(null);
      setGitHubCliCheckedRoot(null);
    } catch {
      setConnectionMessage("Failed to disconnect repository.");
      setConnectionMessageType("error");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const onCopyGitHubCliInstruction = (): void => {
    void navigator.clipboard.writeText("gh auth login");
  };

  const onRefreshGitHubCliStatus = async (): Promise<void> => {
    await loadGitHubCliStatus(workspaceRoot);
  };

  const gitHubCliRepositoryLabel =
    gitHubCliRepo?.nameWithOwner ?? (gitHubCliRepo?.owner && gitHubCliRepo?.repo ? `${gitHubCliRepo.owner}/${gitHubCliRepo.repo}` : null);
  const hideAuthenticatedStatusLabel = gitHubCliStatus?.message === "Authenticated via GitHub CLI session.";
  const isGitHubStatusPending = Boolean(workspaceRoot) && (isGitHubCliLoading || gitHubCliCheckedRoot !== workspaceRoot);

  return (
    <PageShell>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Connect a Git repository folder to manage workspace operations and local settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Loading active workspace...</p>}

          {!isLoading && workspaceRootName === null && (
            <p className="rounded-md border border-amber-700/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
              No repository connected. Connect one to enable workspace controls.
            </p>
          )}

          <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">Workspace</h2>
            </div>

            {workspaceRootName && (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Active workspace: <span className="font-medium text-foreground">{workspaceRootName}</span>
              </p>
            )}

            {workspaceRoot && (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Current workspace path: <span className="font-medium text-foreground">{workspaceRoot}</span>
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {workspaceRoot && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void onDisconnectRepository();
                  }}
                  disabled={isLoading || isConnecting || isDisconnecting}
                >
                  {isDisconnecting ? "Closing workspace..." : "Close workspace"}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">GitHub CLI</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  void onConnectRepository();
                }}
                disabled={isLoading || isConnecting || isDisconnecting}
              >
                {isConnecting ? "Opening picker..." : "Connect to repository"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void onRefreshGitHubCliStatus();
                }}
                disabled={isGitHubCliLoading || !workspaceRoot || isConnecting || isDisconnecting}
              >
                {isGitHubCliLoading ? "Refreshing..." : "Refresh status"}
              </Button>
              {gitHubCliStatus?.installed && !gitHubCliStatus.authenticated && (
                <Button type="button" variant="ghost" size="sm" className="h-9 px-3" onClick={onCopyGitHubCliInstruction}>
                  <Copy aria-hidden="true" className="mr-1 size-3" />
                  Copy login command
                </Button>
              )}
            </div>

            {!workspaceRoot ? (
              <p className="text-sm text-muted-foreground">Connect a repository to inspect GitHub CLI auth.</p>
            ) : isGitHubStatusPending ? (
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Checking GitHub CLI status...
              </p>
            ) : (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {gitHubCliStatus?.installed && gitHubCliStatus.authenticated && gitHubCliStatus.username && (
                  <p className="font-semibold text-foreground">{gitHubCliStatus.username}</p>
                )}
                {gitHubCliRepositoryLabel && <p>{gitHubCliRepositoryLabel}</p>}
                {gitHubCliStatus && !hideAuthenticatedStatusLabel && <p>{gitHubCliStatus.message}</p>}
                {!gitHubCliStatus?.installed && <p>Install GitHub CLI (`gh`) to enable auth and PR actions.</p>}
                {gitHubCliStatus?.installed && !gitHubCliStatus.authenticated && <p>Run `gh auth login` in a terminal to authenticate.</p>}
                {gitHubCliError && <p className="line-clamp-2 text-[11px] text-destructive">Error: {gitHubCliError}</p>}
              </div>
            )}
          </div>

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

          {connectionMessage && connectionMessageType === "success" && (
            <p className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{connectionMessage}</p>
          )}

          {connectionMessage && connectionMessageType === "error" && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{connectionMessage}</p>
          )}

          {errorMessage && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          {workspaceMeta && (
            <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-foreground">About Groove</h2>
              </div>

              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Metadata version: <span className="font-medium text-foreground">{String(workspaceMeta.version)}</span>
              </p>

              <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={telemetryEnabled}
                  disabled={saveState === "saving"}
                  onChange={(event) => {
                    setTelemetryEnabled(event.target.checked);
                    setSaveState("idle");
                    setSaveMessage(null);
                  }}
                />
                Enable telemetry
              </label>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
