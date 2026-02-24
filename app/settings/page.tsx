"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleHelp, Copy, Loader2 } from "lucide-react";

import { PageShell } from "@/components/pages/page-shell";
import { CommandsSettingsForm } from "@/components/pages/settings/commands-settings-form";
import { TerminalSettingsForm } from "@/components/pages/settings/terminal-settings-form";
import type { SaveState, WorkspaceMeta } from "@/components/pages/settings/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { THEME_MODE_OPTIONS, type ThemeMode } from "@/src/lib/theme-constants";
import { applyThemeToDom } from "@/src/lib/theme";
import {
  DEFAULT_PLAY_GROOVE_COMMAND,
  DEFAULT_TESTING_PORTS,
  getGlobalSettingsSnapshot,
  getThemeMode,
  ghAuthStatus,
  ghDetectRepo,
  globalSettingsGet,
  globalSettingsUpdate,
  isTelemetryEnabled,
  subscribeToGlobalSettings,
  workspaceGetActive,
  workspacePickAndOpen,
  workspaceUpdateCommandsSettings,
  workspaceUpdateTerminalSettings,
  type DefaultTerminal,
  type GhAuthStatusResponse,
  type GhDetectRepoResponse,
  type WorkspaceCommandSettingsPayload,
} from "@/src/lib/ipc";
import { describeWorkspaceContextError } from "@/lib/utils/workspace/context";

const UI_TELEMETRY_PREFIX = "[ui-telemetry]";

let settingsGlobalSettingsGetPromise: Promise<Awaited<ReturnType<typeof globalSettingsGet>>> | null = null;
let settingsWorkspaceGetActivePromise: Promise<Awaited<ReturnType<typeof workspaceGetActive>>> | null = null;

function logSettingsTelemetry(event: string, payload: Record<string, unknown>): void {
  if (!isTelemetryEnabled()) {
    return;
  }
  console.info(`${UI_TELEMETRY_PREFIX} ${event}`, payload);
}

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

function loadSettingsGlobalSettings(): Promise<Awaited<ReturnType<typeof globalSettingsGet>>> {
  if (!settingsGlobalSettingsGetPromise) {
    settingsGlobalSettingsGetPromise = globalSettingsGet().finally(() => {
      settingsGlobalSettingsGetPromise = null;
    });
  }
  return settingsGlobalSettingsGetPromise;
}

function loadSettingsWorkspaceGetActive(): Promise<Awaited<ReturnType<typeof workspaceGetActive>>> {
  if (!settingsWorkspaceGetActivePromise) {
    settingsWorkspaceGetActivePromise = workspaceGetActive().finally(() => {
      settingsWorkspaceGetActivePromise = null;
    });
  }
  return settingsWorkspaceGetActivePromise;
}

function waitForDeferredTask(timeoutMs = 180): Promise<void> {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  return new Promise<void>((resolve) => {
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleWindow.requestIdleCallback(() => {
        resolve();
      }, { timeout: timeoutMs });
      return;
    }

    window.setTimeout(() => {
      resolve();
    }, timeoutMs);
  });
}

export default function SettingsPage() {
  const settingsEnterPerfMsRef = useRef<number>(performance.now());
  const globalSettingsSnapshot = useSyncExternalStore(
    subscribeToGlobalSettings,
    getGlobalSettingsSnapshot,
    getGlobalSettingsSnapshot,
  );
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionMessageType, setConnectionMessageType] = useState<"success" | "error" | null>(null);
  const [defaultTerminal, setDefaultTerminal] = useState<DefaultTerminal>("auto");
  const [terminalCustomCommand, setTerminalCustomCommand] = useState("");
  const [telemetryEnabled, setTelemetryEnabled] = useState(globalSettingsSnapshot.telemetryEnabled);
  const [disableGrooveLoadingSection, setDisableGrooveLoadingSection] = useState(globalSettingsSnapshot.disableGrooveLoadingSection);
  const [showFps, setShowFps] = useState(globalSettingsSnapshot.showFps);
  const [alwaysShowDiagnosticsSidebar, setAlwaysShowDiagnosticsSidebar] = useState(globalSettingsSnapshot.alwaysShowDiagnosticsSidebar);
  const [playGrooveCommand, setPlayGrooveCommand] = useState(DEFAULT_PLAY_GROOVE_COMMAND);
  const [testingPorts, setTestingPorts] = useState<number[]>([...DEFAULT_TESTING_PORTS]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode());
  const [isGitHubCliLoading, setIsGitHubCliLoading] = useState(false);
  const [gitHubCliStatus, setGitHubCliStatus] = useState<GhAuthStatusResponse | null>(null);
  const [gitHubCliRepo, setGitHubCliRepo] = useState<GhDetectRepoResponse | null>(null);
  const [gitHubCliError, setGitHubCliError] = useState<string | null>(null);
  const [gitHubCliCheckedRoot, setGitHubCliCheckedRoot] = useState<string | null>(null);
  const gitHubCliRequestVersionRef = useRef(0);
  const disableGrooveLoadingSectionRequestVersionRef = useRef(0);
  const telemetryEnabledRequestVersionRef = useRef(0);
  const showFpsRequestVersionRef = useRef(0);
  const alwaysShowDiagnosticsSidebarRequestVersionRef = useRef(0);
  const themeModeRequestVersionRef = useRef(0);

  const loadGitHubCliStatus = useCallback(async (root: string | null, options?: { deferAuth?: boolean }): Promise<void> => {
    const startedAtMs = performance.now();
    const requestVersion = ++gitHubCliRequestVersionRef.current;
    const isLatestRequest = (): boolean => gitHubCliRequestVersionRef.current === requestVersion;

    setGitHubCliCheckedRoot(root);
    setIsGitHubCliLoading(true);
    setGitHubCliError(null);
    try {
      if (!root) {
        setGitHubCliStatus(null);
        setGitHubCliRepo(null);
        const durationMs = Math.max(0, performance.now() - startedAtMs);
        logSettingsTelemetry("settings.load_github_cli_status", {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "skipped",
          has_workspace_root: false,
        });
        return;
      }

      const detectedRepo = await ghDetectRepo({ path: root });
      if (!isLatestRequest()) {
        return;
      }
      setGitHubCliRepo(detectedRepo);

      if (options?.deferAuth) {
        await waitForDeferredTask();
        if (!isLatestRequest()) {
          return;
        }
      }

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

      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logSettingsTelemetry("settings.load_github_cli_status", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: status.ok ? "ok" : "error",
        has_workspace_root: true,
        has_remote_url: detectedRepo.remoteUrl != null,
        installed: status.installed,
        authenticated: status.authenticated,
      });
    } catch {
      if (!isLatestRequest()) {
        return;
      }
      setGitHubCliError("Failed to load GitHub CLI authentication status.");

      const durationMs = Math.max(0, performance.now() - startedAtMs);
      logSettingsTelemetry("settings.load_github_cli_status", {
        duration_ms: Number(durationMs.toFixed(2)),
        outcome: "error",
        has_workspace_root: root != null,
      });
    } finally {
      if (isLatestRequest()) {
        setIsGitHubCliLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setTelemetryEnabled(globalSettingsSnapshot.telemetryEnabled);
    setDisableGrooveLoadingSection(globalSettingsSnapshot.disableGrooveLoadingSection);
    setShowFps(globalSettingsSnapshot.showFps);
    setAlwaysShowDiagnosticsSidebar(globalSettingsSnapshot.alwaysShowDiagnosticsSidebar);
    setThemeMode(globalSettingsSnapshot.themeMode);
  }, [globalSettingsSnapshot]);

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
          testingPorts: payload.testingPorts,
        });

        if (!result.ok || !result.workspaceMeta) {
          return {
            ok: false,
            error: result.error ?? "Failed to save command settings.",
          };
        }

        const savedPlayGrooveCommand = result.workspaceMeta.playGrooveCommand ?? DEFAULT_PLAY_GROOVE_COMMAND;
        const savedTestingPorts =
          result.workspaceMeta.testingPorts && result.workspaceMeta.testingPorts.length > 0
            ? result.workspaceMeta.testingPorts
            : [...DEFAULT_TESTING_PORTS];

        setWorkspaceMeta(result.workspaceMeta);
        setPlayGrooveCommand(savedPlayGrooveCommand);
        setTestingPorts(savedTestingPorts);
        return {
          ok: true,
          payload: {
            playGrooveCommand: savedPlayGrooveCommand,
            testingPorts: savedTestingPorts,
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
    void (async () => {
      try {
        await loadSettingsGlobalSettings();
      } catch {
        setErrorMessage((current) => current ?? "Failed to load global settings.");
      }
    })();
  }, []);

  useEffect(() => {
    const mountDurationMs = Math.max(0, performance.now() - settingsEnterPerfMsRef.current);
    logSettingsTelemetry("settings.enter.mount", {
      duration_ms: Number(mountDurationMs.toFixed(2)),
    });

    let rafFrameId = 0;
    let rafNestedFrameId = 0;
    rafFrameId = requestAnimationFrame(() => {
      rafNestedFrameId = requestAnimationFrame(() => {
        const afterPaintDurationMs = Math.max(0, performance.now() - settingsEnterPerfMsRef.current);
        logSettingsTelemetry("settings.enter.after_paint", {
          duration_ms: Number(afterPaintDurationMs.toFixed(2)),
        });
      });
    });

    return () => {
      cancelAnimationFrame(rafFrameId);
      cancelAnimationFrame(rafNestedFrameId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const startedAtMs = performance.now();
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await loadSettingsWorkspaceGetActive();
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setErrorMessage(describeWorkspaceContextError(result, "Failed to load the active workspace context."));
          const durationMs = Math.max(0, performance.now() - startedAtMs);
          logSettingsTelemetry("workspace_get_active.settings", {
            duration_ms: Number(durationMs.toFixed(2)),
            outcome: "error",
            has_workspace_meta: false,
            has_workspace_root: false,
          });
          return;
        }

        if (!result.workspaceMeta) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setPlayGrooveCommand(DEFAULT_PLAY_GROOVE_COMMAND);
          setTestingPorts([...DEFAULT_TESTING_PORTS]);
          setGitHubCliStatus(null);
          setGitHubCliRepo(null);
          setGitHubCliError(null);
          setGitHubCliCheckedRoot(null);
          const durationMs = Math.max(0, performance.now() - startedAtMs);
          logSettingsTelemetry("workspace_get_active.settings", {
            duration_ms: Number(durationMs.toFixed(2)),
            outcome: "ok",
            has_workspace_meta: false,
            has_workspace_root: false,
          });
          return;
        }

        setWorkspaceMeta(result.workspaceMeta);
        setWorkspaceRoot(result.workspaceRoot ?? null);
        setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
        setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
        setPlayGrooveCommand(result.workspaceMeta.playGrooveCommand ?? DEFAULT_PLAY_GROOVE_COMMAND);
        setTestingPorts(
          result.workspaceMeta.testingPorts && result.workspaceMeta.testingPorts.length > 0
            ? result.workspaceMeta.testingPorts
            : [...DEFAULT_TESTING_PORTS],
        );
        setSaveState("idle");
        setSaveMessage(null);

        const durationMs = Math.max(0, performance.now() - startedAtMs);
        logSettingsTelemetry("workspace_get_active.settings", {
          duration_ms: Number(durationMs.toFixed(2)),
          outcome: "ok",
          has_workspace_meta: true,
          has_workspace_root: result.workspaceRoot != null,
        });
      } catch {
        if (!cancelled) {
          setWorkspaceMeta(null);
          setWorkspaceRoot(null);
          setPlayGrooveCommand(DEFAULT_PLAY_GROOVE_COMMAND);
          setTestingPorts([...DEFAULT_TESTING_PORTS]);
          setErrorMessage("Failed to load the active workspace context.");
          setGitHubCliStatus(null);
          setGitHubCliRepo(null);
          setGitHubCliError(null);
          setGitHubCliCheckedRoot(null);

          const durationMs = Math.max(0, performance.now() - startedAtMs);
          logSettingsTelemetry("workspace_get_active.settings", {
            duration_ms: Number(durationMs.toFixed(2)),
            outcome: "error",
            has_workspace_meta: false,
            has_workspace_root: false,
          });
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

  useEffect(() => {
    if (!workspaceRoot || isGitHubCliLoading) {
      return;
    }
    if (gitHubCliCheckedRoot === workspaceRoot) {
      return;
    }
    void loadGitHubCliStatus(workspaceRoot, { deferAuth: true });
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
      setDefaultTerminal(result.workspaceMeta.defaultTerminal ?? "auto");
      setTerminalCustomCommand(result.workspaceMeta.terminalCustomCommand ?? "");
      setPlayGrooveCommand(result.workspaceMeta.playGrooveCommand ?? DEFAULT_PLAY_GROOVE_COMMAND);
      setTestingPorts(
        result.workspaceMeta.testingPorts && result.workspaceMeta.testingPorts.length > 0
          ? result.workspaceMeta.testingPorts
          : [...DEFAULT_TESTING_PORTS],
      );
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

  const onCopyGitHubCliInstruction = (): void => {
    void navigator.clipboard.writeText("gh auth login");
  };

  const onRefreshGitHubCliStatus = async (): Promise<void> => {
    await loadGitHubCliStatus(workspaceRoot);
  };

  const onThemeModeChange = (nextTheme: ThemeMode): void => {
    const previousThemeMode = themeMode;
    setThemeMode(nextTheme);
    applyThemeToDom(nextTheme);
    setErrorMessage(null);

    const requestVersion = ++themeModeRequestVersionRef.current;

    void (async () => {
      try {
        const result = await globalSettingsUpdate({ themeMode: nextTheme });
        if (requestVersion !== themeModeRequestVersionRef.current) {
          return;
        }

        if (!result.ok || !result.globalSettings) {
          setThemeMode(previousThemeMode);
          applyThemeToDom(previousThemeMode);
          setErrorMessage(result.error ?? "Failed to update theme mode.");
          return;
        }

        setThemeMode(result.globalSettings.themeMode);
        applyThemeToDom(result.globalSettings.themeMode);
      } catch {
        if (requestVersion !== themeModeRequestVersionRef.current) {
          return;
        }
        setThemeMode(previousThemeMode);
        applyThemeToDom(previousThemeMode);
        setErrorMessage("Failed to update theme mode.");
      }
    })();
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
            Connect a Git repository folder to manage workspace operations and Groove-level settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Loading active workspace...</p>}

          <CommandsSettingsForm
            playGrooveCommand={playGrooveCommand}
            testingPorts={testingPorts}
            disabled={!workspaceMeta}
            disabledMessage={!workspaceMeta ? "Connect a repository to edit workspace command settings." : undefined}
            onSave={onSaveCommandSettings}
          />

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
                disabled={isLoading || isConnecting}
              >
                {isConnecting ? "Opening picker..." : "Connect to repository"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void onRefreshGitHubCliStatus();
                }}
                disabled={isGitHubCliLoading || !workspaceRoot || isConnecting}
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
            ) : (
              <div className="space-y-2">
                {isGitHubStatusPending && (
                  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Checking GitHub CLI status...
                  </p>
                )}

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {gitHubCliStatus?.installed && gitHubCliStatus.authenticated && gitHubCliStatus.username && (
                    <p className="font-semibold text-foreground">{gitHubCliStatus.username}</p>
                  )}
                  {gitHubCliRepositoryLabel && <p>{gitHubCliRepositoryLabel}</p>}
                  {gitHubCliStatus && !hideAuthenticatedStatusLabel && <p>{gitHubCliStatus.message}</p>}
                  {!gitHubCliStatus?.installed && <p>Install GitHub CLI (`gh`) to enable auth and PR actions.</p>}
                  {gitHubCliStatus?.installed && !gitHubCliStatus.authenticated && <p>Run `gh auth login` in a terminal to authenticate.</p>}
                  {!gitHubCliStatus && isGitHubStatusPending && !gitHubCliError && <p>Checking GitHub CLI status...</p>}
                  {gitHubCliError && <p className="line-clamp-2 text-[11px] text-destructive">Error: {gitHubCliError}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">Theme</h2>
            </div>

            <p className="text-xs text-muted-foreground">Applies across pages and workspaces and is saved on this device.</p>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {THEME_MODE_OPTIONS.map((option) => {
                const isSelected = themeMode === option.value;

                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground transition-colors hover:border-border/80"
                  >
                    <input
                      type="radio"
                      name="theme-mode"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => {
                        onThemeModeChange(option.value);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-4 items-center justify-center rounded-full border border-muted-foreground/60 transition-colors peer-checked:border-foreground peer-checked:bg-foreground/10 peer-checked:[&>span]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                    >
                      <span className="size-2 rounded-full bg-foreground opacity-0 transition-opacity" />
                    </span>
                    <div className="space-y-1">
                      <span className="block font-medium text-foreground">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.description}</span>

                      <div data-theme={option.value} className="rounded-md border border-border bg-background p-2">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                              Primary
                            </span>
                            <span className="inline-flex h-6 items-center rounded-md bg-secondary px-2 text-[11px] font-medium text-secondary-foreground">
                              Chip
                            </span>
                          </div>

                          <div className="rounded-md border border-input bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                            Search branches...
                          </div>

                          <div className="rounded-md border border-border bg-card px-2 py-1.5">
                            <p className="text-[11px] font-medium text-card-foreground">Preview card</p>
                            <p className="text-[10px] text-muted-foreground">Body text and muted helper content.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-dashed px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">About Groove</h2>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={telemetryEnabled}
                disabled={saveState === "saving"}
                onChange={(event) => {
                  const nextTelemetryEnabled = event.target.checked;
                  const previousTelemetryEnabled = telemetryEnabled;
                  setTelemetryEnabled(nextTelemetryEnabled);
                  setErrorMessage(null);

                  const requestVersion = ++telemetryEnabledRequestVersionRef.current;

                  void (async () => {
                    try {
                      const result = await globalSettingsUpdate({ telemetryEnabled: nextTelemetryEnabled });

                      if (requestVersion !== telemetryEnabledRequestVersionRef.current) {
                        return;
                      }

                      if (!result.ok || !result.globalSettings) {
                        setTelemetryEnabled(previousTelemetryEnabled);
                        setErrorMessage(result.error ?? "Failed to update telemetry settings.");
                        return;
                      }

                      setTelemetryEnabled(result.globalSettings.telemetryEnabled);
                    } catch {
                      if (requestVersion !== telemetryEnabledRequestVersionRef.current) {
                        return;
                      }
                      setTelemetryEnabled(previousTelemetryEnabled);
                      setErrorMessage("Failed to update telemetry settings.");
                    }
                  })();
                }}
              />
              <span className="inline-flex items-center gap-1.5">
                <span>Enable telemetry</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label="About telemetry"
                        onClick={(event) => {
                          event.preventDefault();
                        }}
                      >
                        <CircleHelp aria-hidden="true" className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Controls whether Groove records UI telemetry events.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </label>

            <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={disableGrooveLoadingSection}
                disabled={saveState === "saving"}
                onChange={(event) => {
                  const nextDisableGrooveLoadingSection = event.target.checked;
                  const previousDisableGrooveLoadingSection = disableGrooveLoadingSection;
                  setDisableGrooveLoadingSection(nextDisableGrooveLoadingSection);
                  setErrorMessage(null);

                  const requestVersion = ++disableGrooveLoadingSectionRequestVersionRef.current;

                  void (async () => {
                    try {
                      const result = await globalSettingsUpdate({
                        disableGrooveLoadingSection: nextDisableGrooveLoadingSection,
                      });

                      if (requestVersion !== disableGrooveLoadingSectionRequestVersionRef.current) {
                        return;
                      }

                      if (!result.ok || !result.globalSettings) {
                        setDisableGrooveLoadingSection(previousDisableGrooveLoadingSection);
                        setErrorMessage(result.error ?? "Failed to update Groove loading section visibility.");
                        return;
                      }

                      setDisableGrooveLoadingSection(result.globalSettings.disableGrooveLoadingSection);
                    } catch {
                      if (requestVersion !== disableGrooveLoadingSectionRequestVersionRef.current) {
                        return;
                      }
                      setDisableGrooveLoadingSection(previousDisableGrooveLoadingSection);
                      setErrorMessage("Failed to update Groove loading section visibility.");
                    }
                  })();
                }}
              />
              <span className="inline-flex items-center gap-1.5">
                <span>Disable Groove loading section</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label="About Groove loading section"
                        onClick={(event) => {
                          event.preventDefault();
                        }}
                      >
                        <CircleHelp aria-hidden="true" className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Hides the sidebar loading indicator on desktop.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showFps}
                disabled={saveState === "saving"}
                onChange={(event) => {
                  const nextShowFps = event.target.checked;
                  const previousShowFps = showFps;
                  setShowFps(nextShowFps);
                  setErrorMessage(null);

                  const requestVersion = ++showFpsRequestVersionRef.current;

                  void (async () => {
                    try {
                      const result = await globalSettingsUpdate({ showFps: nextShowFps });

                      if (requestVersion !== showFpsRequestVersionRef.current) {
                        return;
                      }

                      if (!result.ok || !result.globalSettings) {
                        setShowFps(previousShowFps);
                        setErrorMessage(result.error ?? "Failed to update FPS settings.");
                        return;
                      }

                      setShowFps(result.globalSettings.showFps);
                    } catch {
                      if (requestVersion !== showFpsRequestVersionRef.current) {
                        return;
                      }
                      setShowFps(previousShowFps);
                      setErrorMessage("Failed to update FPS settings.");
                    }
                  })();
                }}
              />
              Show FPS
            </label>
            <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={alwaysShowDiagnosticsSidebar}
                disabled={saveState === "saving"}
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  const previousValue = alwaysShowDiagnosticsSidebar;
                  setAlwaysShowDiagnosticsSidebar(nextValue);
                  setErrorMessage(null);

                  const requestVersion = ++alwaysShowDiagnosticsSidebarRequestVersionRef.current;

                  void (async () => {
                    try {
                      const result = await globalSettingsUpdate({ alwaysShowDiagnosticsSidebar: nextValue });

                      if (requestVersion !== alwaysShowDiagnosticsSidebarRequestVersionRef.current) {
                        return;
                      }

                      if (!result.ok || !result.globalSettings) {
                        setAlwaysShowDiagnosticsSidebar(previousValue);
                        setErrorMessage(result.error ?? "Failed to update diagnostics sidebar visibility.");
                        return;
                      }

                      setAlwaysShowDiagnosticsSidebar(result.globalSettings.alwaysShowDiagnosticsSidebar);
                    } catch {
                      if (requestVersion !== alwaysShowDiagnosticsSidebarRequestVersionRef.current) {
                        return;
                      }
                      setAlwaysShowDiagnosticsSidebar(previousValue);
                      setErrorMessage("Failed to update diagnostics sidebar visibility.");
                    }
                  })();
                }}
              />
              Always show diagnostics sidebar
            </label>
          </div>

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
        </CardContent>
      </Card>
    </PageShell>
  );
}
