"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

import { CommandsSettingsForm } from "@/components/pages/settings/commands-settings-form";
import { WorktreeSymlinkPathsModal } from "@/components/pages/settings/worktree-symlink-paths-modal";
import { JiraIntegrationPanel } from "@/components/jira/jira-integration-panel";
import type { SaveState, WorkspaceMeta } from "@/components/pages/settings/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { THEME_MODE_OPTIONS, type ThemeMode } from "@/src/lib/theme-constants";
import { applyThemeToDom } from "@/src/lib/theme";
import {
  DEFAULT_PLAY_GROOVE_COMMAND,
  DEFAULT_TESTING_PORTS,
  getGlobalSettingsSnapshot,
  getThemeMode,
  globalSettingsGet,
  globalSettingsUpdate,
  isTelemetryEnabled,
  jiraConnectApiToken,
  jiraConnectionStatus,
  jiraDisconnect,
  jiraSyncPull,
  subscribeToGlobalSettings,
  workspaceGetActive,
  workspaceUpdateCommandsSettings,
  workspaceUpdateWorktreeSymlinkPaths,
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
  const [telemetryEnabled, setTelemetryEnabled] = useState(globalSettingsSnapshot.telemetryEnabled);
  const [disableGrooveLoadingSection, setDisableGrooveLoadingSection] = useState(globalSettingsSnapshot.disableGrooveLoadingSection);
  const [showFps, setShowFps] = useState(globalSettingsSnapshot.showFps);
  const [alwaysShowDiagnosticsSidebar, setAlwaysShowDiagnosticsSidebar] = useState(globalSettingsSnapshot.alwaysShowDiagnosticsSidebar);
  const [periodicRerenderEnabled, setPeriodicRerenderEnabled] = useState(globalSettingsSnapshot.periodicRerenderEnabled);
  const [playGrooveCommand, setPlayGrooveCommand] = useState(DEFAULT_PLAY_GROOVE_COMMAND);
  const [testingPorts, setTestingPorts] = useState<number[]>([...DEFAULT_TESTING_PORTS]);
  const [openTerminalAtWorktreeCommand, setOpenTerminalAtWorktreeCommand] = useState("");
  const [runLocalCommand, setRunLocalCommand] = useState("");
  const [worktreeSymlinkPaths, setWorktreeSymlinkPaths] = useState<string[]>([]);
  const [isWorktreeSymlinkModalOpen, setIsWorktreeSymlinkModalOpen] = useState(false);
  const [isWorktreeSymlinkSaving, setIsWorktreeSymlinkSaving] = useState(false);
  const [worktreeSymlinkMessage, setWorktreeSymlinkMessage] = useState<string | null>(null);
  const [worktreeSymlinkMessageType, setWorktreeSymlinkMessageType] = useState<"success" | "error" | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [jiraConnected, setJiraConnected] = useState(false);
  const [jiraStatusMessage, setJiraStatusMessage] = useState<string | null>(null);
  const [jiraErrorMessage, setJiraErrorMessage] = useState<string | null>(null);
  const [isJiraConnectPending, setIsJiraConnectPending] = useState(false);
  const [isJiraDisconnectPending, setIsJiraDisconnectPending] = useState(false);
  const [isJiraSyncPending, setIsJiraSyncPending] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode());
  const disableGrooveLoadingSectionRequestVersionRef = useRef(0);
  const telemetryEnabledRequestVersionRef = useRef(0);
  const showFpsRequestVersionRef = useRef(0);
  const alwaysShowDiagnosticsSidebarRequestVersionRef = useRef(0);
  const periodicRerenderEnabledRequestVersionRef = useRef(0);
  const themeModeRequestVersionRef = useRef(0);

  useEffect(() => {
    setTelemetryEnabled(globalSettingsSnapshot.telemetryEnabled);
    setDisableGrooveLoadingSection(globalSettingsSnapshot.disableGrooveLoadingSection);
    setShowFps(globalSettingsSnapshot.showFps);
    setAlwaysShowDiagnosticsSidebar(globalSettingsSnapshot.alwaysShowDiagnosticsSidebar);
    setPeriodicRerenderEnabled(globalSettingsSnapshot.periodicRerenderEnabled);
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
          openTerminalAtWorktreeCommand: payload.openTerminalAtWorktreeCommand ?? null,
          runLocalCommand: payload.runLocalCommand ?? null,
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
        const savedOpenTerminalAtWorktreeCommand = result.workspaceMeta.openTerminalAtWorktreeCommand ?? "";
        const savedRunLocalCommand = result.workspaceMeta.runLocalCommand ?? "";

        setWorkspaceMeta(result.workspaceMeta);
        setPlayGrooveCommand(savedPlayGrooveCommand);
        setTestingPorts(savedTestingPorts);
        setOpenTerminalAtWorktreeCommand(savedOpenTerminalAtWorktreeCommand);
        setRunLocalCommand(savedRunLocalCommand);
        setWorktreeSymlinkPaths(result.workspaceMeta.worktreeSymlinkPaths ?? []);
        return {
          ok: true,
          payload: {
            playGrooveCommand: savedPlayGrooveCommand,
            testingPorts: savedTestingPorts,
            openTerminalAtWorktreeCommand: savedOpenTerminalAtWorktreeCommand,
            runLocalCommand: savedRunLocalCommand,
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
          setOpenTerminalAtWorktreeCommand("");
          setRunLocalCommand("");
          setWorktreeSymlinkPaths([]);
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
        setPlayGrooveCommand(result.workspaceMeta.playGrooveCommand ?? DEFAULT_PLAY_GROOVE_COMMAND);
        setTestingPorts(
          result.workspaceMeta.testingPorts && result.workspaceMeta.testingPorts.length > 0
            ? result.workspaceMeta.testingPorts
            : [...DEFAULT_TESTING_PORTS],
        );
        setOpenTerminalAtWorktreeCommand(result.workspaceMeta.openTerminalAtWorktreeCommand ?? "");
        setRunLocalCommand(result.workspaceMeta.runLocalCommand ?? "");
        setWorktreeSymlinkPaths(result.workspaceMeta.worktreeSymlinkPaths ?? []);
        setSaveState("idle");

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
          setOpenTerminalAtWorktreeCommand("");
          setRunLocalCommand("");
          setWorktreeSymlinkPaths([]);
          setErrorMessage("Failed to load the active workspace context.");

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

  const onApplyWorktreeSymlinkPaths = useCallback(
    async (paths: string[]) => {
      if (!workspaceMeta) {
        setWorktreeSymlinkMessageType("error");
        setWorktreeSymlinkMessage("Connect a repository before editing worktree symlink paths.");
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
          setWorktreeSymlinkMessage(response.error ?? "Failed to save worktree symlink paths.");
          return;
        }

        setWorkspaceMeta(response.workspaceMeta);
        setWorktreeSymlinkPaths(response.workspaceMeta.worktreeSymlinkPaths ?? []);
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

  const refreshJiraStatus = useCallback(async () => {
    if (!workspaceRoot) {
      setJiraConnected(false);
      setJiraStatusMessage(null);
      setJiraErrorMessage(null);
      return;
    }

    try {
      const response = await jiraConnectionStatus();
      if (!response.ok) {
        setJiraConnected(false);
        setJiraErrorMessage(response.error ?? response.jiraError?.message ?? "Failed to load Jira status.");
        return;
      }

      setJiraConnected(response.connected);
    } catch {
      setJiraConnected(false);
      setJiraErrorMessage("Failed to load Jira status.");
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refreshJiraStatus();
  }, [refreshJiraStatus]);

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

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Connect a Git repository folder to manage workspace operations and Groove-level settings.
          </p>
        </div>

        {isLoading && <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Loading active workspace...</p>}

        <Collapsible defaultOpen>
          <Card className="my-4 gap-0">
            <CardHeader className="py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="relative flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180 [&[data-state=closed]>h3]:absolute [&[data-state=closed]>h3]:left-1/2 [&[data-state=closed]>h3]:-translate-x-1/2"
                  aria-label="Toggle workspace settings"
                >
                  <CardTitle className="text-sm">Workspace settings</CardTitle>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <Collapsible className="rounded-md border px-3 py-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                      aria-label="Toggle workspace commands settings"
                    >
                      <h3 className="text-sm font-medium text-foreground">Commands</h3>
                      <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <CommandsSettingsForm
                      playGrooveCommand={playGrooveCommand}
                      testingPorts={testingPorts}
                      openTerminalAtWorktreeCommand={openTerminalAtWorktreeCommand}
                      runLocalCommand={runLocalCommand}
                      section="commands"
                      disabled={!workspaceMeta}
                      disabledMessage={!workspaceMeta ? "Connect a repository to edit workspace command settings." : undefined}
                      onSave={onSaveCommandSettings}
                    />
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible className="rounded-md border px-3 py-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                      aria-label="Toggle workspace testing ports settings"
                    >
                      <h3 className="text-sm font-medium text-foreground">Testing ports</h3>
                      <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <CommandsSettingsForm
                      playGrooveCommand={playGrooveCommand}
                      testingPorts={testingPorts}
                      openTerminalAtWorktreeCommand={openTerminalAtWorktreeCommand}
                      runLocalCommand={runLocalCommand}
                      section="testingPorts"
                      disabled={!workspaceMeta}
                      disabledMessage={!workspaceMeta ? "Connect a repository to edit workspace testing ports settings." : undefined}
                      onSave={onSaveCommandSettings}
                    />
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible className="rounded-md border px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left [&[data-state=open]>svg]:rotate-180"
                        aria-label="Toggle worktree symlinked paths settings"
                      >
                        <h3 className="text-sm font-medium text-foreground">Worktree symlinked paths</h3>
                        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                      </button>
                    </CollapsibleTrigger>
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

                  <CollapsibleContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">Groove symlinks these paths into worktrees when they exist in the repository root.</p>

                    <ul className="space-y-1 text-sm text-foreground">
                      {worktreeSymlinkPaths.map((path) => (
                        <li key={path}>
                          <code>{path}</code>
                        </li>
                      ))}
                      {worktreeSymlinkPaths.length === 0 && <li className="text-muted-foreground">No configured paths.</li>}
                    </ul>

                    {!workspaceMeta && <p className="text-xs text-muted-foreground">Connect a repository to edit this list.</p>}
                    {worktreeSymlinkMessage && worktreeSymlinkMessageType === "success" && (
                      <p className="text-xs text-green-800">{worktreeSymlinkMessage}</p>
                    )}
                    {worktreeSymlinkMessage && worktreeSymlinkMessageType === "error" && (
                      <p className="text-xs text-destructive">{worktreeSymlinkMessage}</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible defaultOpen>
          <Card className="my-4 gap-0">
            <CardHeader className="py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="relative flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180 [&[data-state=closed]>h3]:absolute [&[data-state=closed]>h3]:left-1/2 [&[data-state=closed]>h3]:-translate-x-1/2"
                  aria-label="Toggle integrations settings"
                >
                  <CardTitle className="text-sm">Integrations</CardTitle>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <JiraIntegrationPanel
                  title="Jira"
                  settings={workspaceMeta?.jiraSettings ?? null}
                  connected={jiraConnected}
                  statusMessage={jiraStatusMessage}
                  errorMessage={jiraErrorMessage}
                  syncPending={isJiraSyncPending}
                  connectPending={isJiraConnectPending}
                  disconnectPending={isJiraDisconnectPending}
                  disabled={!workspaceMeta}
                  onConnect={(payload) => {
                    if (!workspaceMeta) {
                      setJiraErrorMessage("Connect a repository before configuring Jira.");
                      return;
                    }

                    setIsJiraConnectPending(true);
                    setJiraStatusMessage(null);
                    setJiraErrorMessage(null);

                    void (async () => {
                      try {
                        const response = await jiraConnectApiToken(payload);
                        if (!response.ok || !response.settings) {
                          setJiraErrorMessage(response.error ?? response.jiraError?.message ?? "Failed to connect Jira.");
                          return;
                        }

                        setWorkspaceMeta((current) => (current ? { ...current, jiraSettings: response.settings } : current));
                        setJiraConnected(true);
                        setJiraStatusMessage(
                          response.accountDisplayName ? `Connected as ${response.accountDisplayName}.` : "Jira connected.",
                        );
                      } catch {
                        setJiraErrorMessage("Failed to connect Jira.");
                      } finally {
                        setIsJiraConnectPending(false);
                      }
                    })();
                  }}
                  onDisconnect={() => {
                    if (!workspaceMeta) {
                      return;
                    }

                    setIsJiraDisconnectPending(true);
                    setJiraStatusMessage(null);
                    setJiraErrorMessage(null);

                    void (async () => {
                      try {
                        const response = await jiraDisconnect();
                        if (!response.ok || !response.settings) {
                          setJiraErrorMessage(response.error ?? "Failed to disconnect Jira.");
                          return;
                        }

                        setWorkspaceMeta((current) => (current ? { ...current, jiraSettings: response.settings } : current));
                        setJiraConnected(false);
                        setJiraStatusMessage("Jira disconnected.");
                      } catch {
                        setJiraErrorMessage("Failed to disconnect Jira.");
                      } finally {
                        setIsJiraDisconnectPending(false);
                      }
                    })();
                  }}
                  onSyncNow={() => {
                    if (!workspaceMeta) {
                      return;
                    }

                    setIsJiraSyncPending(true);
                    setJiraStatusMessage(null);
                    setJiraErrorMessage(null);

                    void (async () => {
                      try {
                        const response = await jiraSyncPull({});
                        if (!response.ok) {
                          setJiraErrorMessage(response.error ?? response.jiraError?.message ?? "Jira sync failed.");
                          return;
                        }

                        if (response.settings) {
                          setWorkspaceMeta((current) => (current ? { ...current, jiraSettings: response.settings } : current));
                        }

                        setJiraStatusMessage(
                          `Synced ${response.importedCount + response.updatedCount} issues (${response.importedCount} imported, ${response.updatedCount} updated).`,
                        );
                      } catch {
                        setJiraErrorMessage("Jira sync failed.");
                      } finally {
                        setIsJiraSyncPending(false);
                      }
                    })();
                  }}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible defaultOpen>
          <Card className="my-4 gap-0">
            <CardHeader className="py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="relative flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180 [&[data-state=closed]>h3]:absolute [&[data-state=closed]>h3]:left-1/2 [&[data-state=closed]>h3]:-translate-x-1/2"
                  aria-label="Toggle appearance settings"
                >
                  <CardTitle className="text-sm">Appearance</CardTitle>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
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

                      <div data-theme={option.value} className="rounded-md border border-border bg-background p-3">
                        <div className="space-y-3">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                              Primary
                            </span>
                            <span className="inline-flex h-6 items-center rounded-md bg-secondary px-2 text-[11px] font-medium text-secondary-foreground">
                              Chip
                            </span>
                          </div>

                          <div className="rounded-md border border-input bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
                            Search branches...
                          </div>

                          <div className="rounded-md border border-border bg-card px-2.5 py-2">
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
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible defaultOpen>
          <Card className="my-4 gap-0">
            <CardHeader className="py-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="relative flex w-full items-center justify-between gap-2 text-left [&[data-state=open]>svg]:rotate-180 [&[data-state=closed]>h3]:absolute [&[data-state=closed]>h3]:left-1/2 [&[data-state=closed]>h3]:-translate-x-1/2"
                  aria-label="Toggle Groove settings"
                >
                  <CardTitle className="text-sm">Groove settings</CardTitle>
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200" />
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">

              <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={telemetryEnabled}
                    disabled={saveState === "saving"}
                    onCheckedChange={(checked) => {
                      const nextTelemetryEnabled = checked === true;
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
                  <span>Enable telemetry</span>
                </span>
                <span className="text-xs text-muted-foreground/70 sm:text-right">
                  Controls whether Groove records UI telemetry events.
                </span>
              </label>

              <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={disableGrooveLoadingSection}
                    disabled={saveState === "saving"}
                    onCheckedChange={(checked) => {
                      const nextDisableGrooveLoadingSection = checked === true;
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
                  <span>Disable monkey</span>
                </span>
                <span className="text-xs text-muted-foreground/70 sm:text-right">
                  Hides the sidebar monkey sprite frame on desktop.
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={showFps}
                    disabled={saveState === "saving"}
                    onCheckedChange={(checked) => {
                      const nextShowFps = checked === true;
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
                  <span>Show FPS</span>
                </span>
                <span className="text-xs text-muted-foreground/70 sm:text-right">
                  Shows the frames-per-second overlay for UI performance checks.
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={periodicRerenderEnabled}
                    disabled={saveState === "saving"}
                    onCheckedChange={(checked) => {
                      const nextValue = checked === true;
                      const previousValue = periodicRerenderEnabled;
                      setPeriodicRerenderEnabled(nextValue);
                      setErrorMessage(null);

                      const requestVersion = ++periodicRerenderEnabledRequestVersionRef.current;

                      void (async () => {
                        try {
                          const result = await globalSettingsUpdate({ periodicRerenderEnabled: nextValue });

                          if (requestVersion !== periodicRerenderEnabledRequestVersionRef.current) {
                            return;
                          }

                          if (!result.ok || !result.globalSettings) {
                            setPeriodicRerenderEnabled(previousValue);
                            setErrorMessage(result.error ?? "Failed to update periodic re-render trigger settings.");
                            return;
                          }

                          setPeriodicRerenderEnabled(result.globalSettings.periodicRerenderEnabled);
                        } catch {
                          if (requestVersion !== periodicRerenderEnabledRequestVersionRef.current) {
                            return;
                          }
                          setPeriodicRerenderEnabled(previousValue);
                          setErrorMessage("Failed to update periodic re-render trigger settings.");
                        }
                      })();
                    }}
                  />
                  <span>Trigger periodic re-renders</span>
                </span>
                <span className="text-xs text-muted-foreground/70 sm:text-right">
                  Forces a React re-render every second to stress test UI updates. Disable when you are done testing.
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-sm text-foreground">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Checkbox
                    checked={alwaysShowDiagnosticsSidebar}
                    disabled={saveState === "saving"}
                    onCheckedChange={(checked) => {
                      const nextValue = checked === true;
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
                  <span>Always show diagnostics sidebar</span>
                </span>
                <span className="text-xs text-muted-foreground/70 sm:text-right">
                  Keeps the diagnostics sidebar visible in Groove.
                </span>
              </label>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

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
    </>
  );
}
